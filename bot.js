require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const Stripe = require('stripe');
const { initDB } = require('./database');

const bot = new Telegraf(process.env.BOT_TOKEN);
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const db = initDB();

const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => parseInt(s.trim())).filter(Boolean);
const isAdmin = id => ADMIN_IDS.includes(id);

const pendingBookings = new Map();

// ─── /start ──────────────────────────────────────────────
bot.command('start', ctx => {
  const u = ctx.from;
  db.addUser({ user_id: u.id, username: u.username, first_name: u.first_name });
  
  ctx.reply(
    `👋 Welcome, ${u.first_name}!\n\n` +
    `I am a booking bot with online payment.\n\n` +
    `🗓 /services — View services and prices\n` +
    `📅 /book — Book a service\n` +
    `📋 /mybookings — My bookings\n` +
    `❌ /cancel — Cancel booking`,
    Markup.keyboard([
      ['/services', '/book'],
      ['/mybookings', '/cancel']
    ]).resize()
  );
});

// ─── /services ─────────────────────────────────────────────
bot.command('services', ctx => {
  const services = db.getServices();
  let text = '💈 *Available Services*\n\n';
  services.forEach(s => {
    text += `*${s.name}* — ${s.price}₽\n`;
    text += `⏱ ${s.duration_min} min | ${s.description}\n\n`;
  });
  text += 'Use /book to make an appointment';
  ctx.reply(text, { parse_mode: 'Markdown' });
});

// ─── /book ─────────────────────────────────────────────────
bot.command('book', ctx => {
  const services = db.getServices();
  const buttons = services.map(s => [Markup.button.callback(`${s.name} — ${s.price}₽`, `service_${s.id}`)]);
  
  ctx.reply(
    '📅 *Select a service:*',
    Markup.inlineKeyboard(buttons)
  );
});

// ─── Service selection ─────────────────────────────────────
bot.action(/^service_(\d+)$/, ctx => {
  const serviceId = parseInt(ctx.match[1]);
  const service = db.getService(serviceId);
  
  pendingBookings.set(ctx.from.id, { step: 'date', serviceId, service });
  
  ctx.editMessageText(
    `✅ *${service.name}* — ${service.price}₽\n\n` +
    '📅 Enter date in format: *DD.MM.YYYY*\n' +
    'Example: `31.12.2025`',
    { parse_mode: 'Markdown' }
  );
});

// ─── Date & Time input handler ─────────────────────────────
bot.on('text', async ctx => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  
  if (!pendingBookings.has(userId)) return;
  if (text.startsWith('/')) return;
  
  const state = pendingBookings.get(userId);
  
  // Step: date
  if (state.step === 'date') {
    const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!dateRegex.test(text)) {
      return ctx.reply('❌ Invalid format. Use DD.MM.YYYY');
    }
    state.date = text;
    state.step = 'time';
    return ctx.reply(
      '🕐 Enter time in format: *HH:MM*\n' +
      'Example: `14:30`',
      { parse_mode: 'Markdown' }
    );
  }
  
  // Step: time
  if (state.step === 'time') {
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(text)) {
      return ctx.reply('❌ Invalid format. Use HH:MM');
    }
    state.time = text;
    state.step = 'phone';
    return ctx.reply('📱 Enter your phone number for contact:');
  }
  
  // Step: phone
  if (state.step === 'phone') {
    state.phone = text;
    state.step = 'confirm';
    
    const { service, date, time } = state;
    
    ctx.reply(
      `📝 *Booking Summary*\n\n` +
      `Service: *${service.name}*\n` +
      `Price: *${service.price}₽*\n` +
      `Date: *${date}*\n` +
      `Time: *${time}*\n` +
      `Phone: *${state.phone}*\n\n` +
      `Proceed to payment?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💳 Pay Now', `pay_${state.serviceId}`)],
          [Markup.button.callback('❌ Cancel', 'cancel_booking')]
        ])
      }
    );
  }
});

// ─── Payment ────────────────────────────────────────────────
bot.action(/^pay_(\d+)$/, async ctx => {
  const userId = ctx.from.id;
  const state = pendingBookings.get(userId);
  
  if (!state) return ctx.reply('❌ Session expired. Start over with /book');
  
  const { service, date, time, phone } = state;
  
  // Create booking in DB (pending payment)
  const bookingId = db.createBooking({
    user_id: userId,
    user_name: ctx.from.first_name,
    user_phone: phone,
    service_id: service.id,
    booking_date: date,
    booking_time: time
  });
  
  // Create Stripe PaymentIntent
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: service.price * 100, // kopecks/cents
      currency: 'rub',
      metadata: {
        booking_id: bookingId,
        user_id: userId,
        service: service.name
      }
    });
    
    db.updatePayment(bookingId, paymentIntent.id);
    pendingBookings.delete(userId);
    
    // Create payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: 'rub',
          product_data: { name: service.name },
          unit_amount: service.price * 100
        },
        quantity: 1
      }],
      metadata: { booking_id: bookingId }
    });
    
    ctx.editMessageText(
      `💳 *Payment Required*\n\n` +
      `Service: ${service.name}\n` +
      `Amount: ${service.price}₽\n\n` +
      `Click the button below to complete payment:`,
      Markup.inlineKeyboard([
        [Markup.button.url('💳 Pay Now', paymentLink.url)],
        [Markup.button.callback('❌ Cancel', 'cancel_payment')]
      ])
    );
    
    // Notify admin
    for (const adminId of ADMIN_IDS) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          `🔔 *New Booking Pending Payment*\n\n` +
          `Service: ${service.name}\n` +
          `Customer: ${ctx.from.first_name}\n` +
          `Date: ${date} ${time}\n` +
          `Phone: ${phone}\n` +
          `Amount: ${service.price}₽`
          , { parse_mode: 'Markdown' }
        );
      } catch (e) {}
    }
    
  } catch (err) {
    console.error('Stripe error:', err);
    ctx.reply('❌ Payment error. Please try again later.');
  }
});

bot.action('cancel_booking', ctx => {
  pendingBookings.delete(ctx.from.id);
  ctx.editMessageText('❌ Booking cancelled.');
});

bot.action('cancel_payment', ctx => {
  ctx.editMessageText('❌ Payment cancelled. You can retry with /book');
});

// ─── /mybookings ───────────────────────────────────────────
bot.command('mybookings', ctx => {
  const bookings = db.getUserBookings(ctx.from.id);
  
  if (bookings.length === 0) {
    return ctx.reply('📭 You have no bookings yet.\n\nUse /book to make one!');
  }
  
  let text = '📋 *Your Bookings*\n\n';
  bookings.forEach((b, i) => {
    const status = b.status === 'confirmed' ? '✅' : b.status === 'cancelled' ? '❌' : '⏳';
    const payment = b.payment_status === 'paid' ? '💳 Paid' : '💳 Unpaid';
    text += `${status} *${b.service_name}*\n`;
    text += `📅 ${b.booking_date} ${b.booking_time}\n`;
    text += `${payment} — ${b.price}₽\n\n`;
  });
  
  ctx.reply(text, { parse_mode: 'Markdown' });
});

// ─── /cancel ──────────────────────────────────────────────
bot.command('cancel', ctx => {
  const bookings = db.getUserBookings(ctx.from.id)
    .filter(b => b.status !== 'cancelled' && b.status !== 'completed');
  
  if (bookings.length === 0) {
    return ctx.reply('📭 No active bookings to cancel.');
  }
  
  const buttons = bookings.map(b => [
    Markup.button.callback(
      `${b.service_name} (${b.booking_date})`,
      `cancel_${b.id}`
    )
  ]);
  
  ctx.reply('📅 Select booking to cancel:', Markup.inlineKeyboard(buttons));
});

bot.action(/^cancel_(\d+)$/, ctx => {
  const bookingId = parseInt(ctx.match[1]);
  const success = db.cancelBooking(bookingId, ctx.from.id);
  
  if (success) {
    ctx.editMessageText('✅ Booking cancelled successfully.\n\nRefund will be processed within 3-5 business days.');
  } else {
    ctx.reply('❌ Could not cancel booking.');
  }
});

// ─── Admin Commands ────────────────────────────────────────
bot.command('adminbookings', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  
  const bookings = db.getAllBookings();
  if (bookings.length === 0) return ctx.reply('📭 No bookings yet.');
  
  let text = '📋 *All Bookings*\n\n';
  bookings.slice(0, 10).forEach(b => {
    const status = b.status === 'confirmed' ? '✅' : b.status === 'cancelled' ? '❌' : '⏳';
    text += `${status} *${b.service_name}* — ${b.user_name}\n`;
    text += `📅 ${b.booking_date} ${b.booking_time} | ${b.payment_status}\n\n`;
  });
  
  ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.command('adminstats', ctx => {
  if (!isAdmin(ctx.from.id)) return;
  
  const stats = db.getAdminStats();
  ctx.reply(
    `📊 *Business Stats*\n\n` +
    `📅 Total Bookings: *${stats.totalBookings}*\n` +
    `💰 Total Revenue: *${stats.totalRevenue}₽*\n` +
    `⏳ Pending: *${stats.pendingCount}*\n` +
    `📆 Today: *${stats.todayCount}*`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Webhook for Stripe ────────────────────────────────────
const app = express();
app.use(express.raw({ type: 'application/json' }));

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const bookingId = paymentIntent.metadata.booking_id;
    
    if (bookingId) {
      db.updatePayment(bookingId, paymentIntent.id);
      db.confirmBooking(bookingId);
      
      // Notify user
      const userId = parseInt(paymentIntent.metadata.user_id);
      try {
        await bot.telegram.sendMessage(
          userId,
          `✅ *Payment Confirmed!*\n\n` +
          `Your booking is confirmed.\n` +
          `Service: ${paymentIntent.metadata.service}\n` +
          `See you soon! 🎉`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) {
        console.error('Failed to notify user:', e);
      }
    }
  }
  
  res.json({ received: true });
});

// Start servers
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});

bot.launch();
console.log('Booking bot started!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
