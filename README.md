# 📅 Telegram Booking Bot with Stripe Payment

A professional booking bot for salons, barbershops, and service businesses — with integrated Stripe payments.

> Built with Node.js + Telegraf + Stripe + SQLite

---

## ✨ Features

### For Customers
- 🗓 **Browse Services** — view prices and durations
- 📅 **Book Appointment** — step-by-step booking flow
- 💳 **Online Payment** — secure Stripe checkout
- 📋 **My Bookings** — view all appointments and payment status
- ❌ **Cancel Booking** — cancel with automatic refund notice

### For Business Owners
- 📊 **Admin Stats** — total revenue, pending bookings, daily stats
- 📋 **All Bookings** — view every appointment in the system
- 🔔 **Instant Notifications** — get notified of new bookings
- 💰 **Payment Tracking** — see paid vs unpaid bookings

### Payment Flow
1. Customer selects service → date → time → enters phone
2. Stripe payment link generated
3. Customer pays online
4. Webhook confirms payment automatically
5. Booking confirmed, customer notified

---

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- Stripe account (for test keys)
- Telegram Bot Token from @BotFather

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/tg-booking-bot.git
cd tg-booking-bot
npm install
```

### 2. Configure
Create `.env` file:
```env
BOT_TOKEN=your_bot_token
ADMIN_IDS=your_telegram_id
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
WEBHOOK_URL=https://your-domain.com/webhook
PORT=3000
```

**Get Stripe test keys:**
1. Go to [stripe.com](https://stripe.com)
2. Create account → Developers → API Keys
3. Use `sk_test_...` for testing

**Set up webhook:**
1. Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/webhook`
3. Select event: `payment_intent.succeeded`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

### 3. Run
```bash
node bot.js
```

---

## 📋 Default Services (Editable in `database.js`)

| Service | Price | Duration |
|---------|-------|----------|
| Haircut | 1,500₽ | 60 min |
| Beard Trim | 800₽ | 30 min |
| Full Service | 2,000₽ | 90 min |
| Hair Coloring | 3,500₽ | 120 min |

---

## 🗂 Project Structure
```
tg-booking-bot/
├── bot.js          # Bot logic, handlers, Stripe integration
├── database.js     # SQLite wrapper, all DB operations
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 📱 Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome & menu |
| `/services` | View all services |
| `/book` | Start booking process |
| `/mybookings` | View my appointments |
| `/cancel` | Cancel a booking |
| `/adminstats` | Business stats (admin only) |
| `/adminbookings` | All bookings list (admin only) |

---

## ⚙️ Tech Stack
- **Node.js** — runtime
- **Telegraf v4** — Telegram Bot framework
- **Stripe** — payment processing
- **Express** — webhook server
- **better-sqlite3** — local database
- **dotenv** — configuration

---

## 🔒 Security
- Webhook signature verification
- Environment variables for secrets
- No sensitive data in code
- SQLite for local data storage

---

## 🧪 Testing Webhook Locally

For portfolio/demo purposes, the bot code demonstrates full Stripe integration including webhook handling. To test payments end-to-end:

1. Install [ngrok](https://ngrok.com): `ngrok http 3000`
2. Copy HTTPS URL (e.g., `https://abc123.ngrok.io/webhook`)
3. Add to Stripe Dashboard → Webhooks
4. Set `WEBHOOK_URL` in `.env`

Without ngrok/server, the booking and payment link generation still works — webhook just won't auto-confirm (you'd confirm manually via database).

---

## 💡 Production Deployment

For real payments:
1. Switch to Stripe live keys (`sk_live_...`)
2. Use HTTPS webhook URL
3. Set up proper hosting (VPS, Railway, etc.)
4. Configure webhook in Stripe dashboard

---

## 📄 License
MIT
