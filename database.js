const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bookings.db');
let db;

function initDB() {
  db = new Database(DB_PATH);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      duration_min INTEGER DEFAULT 60,
      description TEXT
    );
    
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT,
      user_phone TEXT,
      service_id INTEGER NOT NULL,
      booking_date TEXT NOT NULL,
      booking_time TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_status TEXT DEFAULT 'unpaid',
      payment_intent_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (service_id) REFERENCES services(id)
    );
    
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      phone TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);
  
  // Seed default services if empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM services').get();
  if (count.cnt === 0) {
    const insert = db.prepare('INSERT INTO services (name, price, duration_min, description) VALUES (?, ?, ?, ?)');
    insert.run('Haircut', 1500, 60, 'Classic haircut with styling');
    insert.run('Beard Trim', 800, 30, 'Beard shaping and trim');
    insert.run('Full Service', 2000, 90, 'Haircut + Beard + Styling');
    insert.run('Hair Coloring', 3500, 120, 'Professional hair coloring');
  }
  
  return {
    getServices: () => db.prepare('SELECT * FROM services').all(),
    getService: (id) => db.prepare('SELECT * FROM services WHERE id = ?').get(id),
    
    addUser: (user) => {
      db.prepare(`INSERT OR REPLACE INTO users (user_id, username, first_name) VALUES (?, ?, ?)`)
        .run(user.user_id, user.username, user.first_name);
    },
    getUser: (userId) => db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId),
    
    createBooking: (booking) => {
      const result = db.prepare(`
        INSERT INTO bookings (user_id, user_name, user_phone, service_id, booking_date, booking_time, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `).run(booking.user_id, booking.user_name, booking.user_phone, booking.service_id, booking.booking_date, booking.booking_time);
      return result.lastInsertRowid;
    },
    
    updatePayment: (bookingId, paymentIntentId) => {
      db.prepare(`UPDATE bookings SET payment_status = 'paid', payment_intent_id = ? WHERE id = ?`)
        .run(paymentIntentId, bookingId);
    },
    
    confirmBooking: (bookingId) => {
      db.prepare(`UPDATE bookings SET status = 'confirmed' WHERE id = ?`).run(bookingId);
    },
    
    getUserBookings: (userId) => {
      return db.prepare(`
        SELECT b.*, s.name as service_name, s.price 
        FROM bookings b 
        JOIN services s ON b.service_id = s.id 
        WHERE b.user_id = ? 
        ORDER BY b.created_at DESC
      `).all(userId);
    },
    
    getAllBookings: () => {
      return db.prepare(`
        SELECT b.*, s.name as service_name, s.price 
        FROM bookings b 
        JOIN services s ON b.service_id = s.id 
        ORDER BY b.created_at DESC
      `).all();
    },
    
    getAdminStats: () => {
      const totalBookings = db.prepare('SELECT COUNT(*) as cnt FROM bookings').get();
      const totalRevenue = db.prepare(`SELECT SUM(s.price) as total FROM bookings b JOIN services s ON b.service_id = s.id WHERE b.payment_status = 'paid'`).get();
      const pendingCount = db.prepare(`SELECT COUNT(*) as cnt FROM bookings WHERE status = 'pending'`).get();
      const todayCount = db.prepare(`SELECT COUNT(*) as cnt FROM bookings WHERE booking_date = date('now')`).get();
      
      return {
        totalBookings: totalBookings.cnt,
        totalRevenue: totalRevenue.total || 0,
        pendingCount: pendingCount.cnt,
        todayCount: todayCount.cnt
      };
    },
    
    cancelBooking: (bookingId, userId) => {
      const result = db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ?`).run(bookingId, userId);
      return result.changes > 0;
    }
  };
}

module.exports = { initDB };
