const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bookings.db');
let db;

async function initDB() {
  const SQL = await initSqlJs();
  
  // Load existing or create new
  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  db.run(`
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
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
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
  const res = db.exec('SELECT COUNT(*) as cnt FROM services');
  const count = res.length ? res[0].values[0][0] : 0;
  
  if (count === 0) {
    const services = [
      ['Haircut', 1500, 60, 'Classic haircut with styling'],
      ['Beard Trim', 800, 30, 'Beard shaping and trim'],
      ['Full Service', 2000, 90, 'Haircut + Beard + Styling'],
      ['Hair Coloring', 3500, 120, 'Professional hair coloring']
    ];
    services.forEach(s => {
      db.run('INSERT INTO services (name, price, duration_min, description) VALUES (?, ?, ?, ?)', s);
    });
  }
  
  saveDB();
  
  // Helper functions
  function getOne(sql, params = []) {
    const res = db.exec(sql, params);
    if (!res.length || !res[0].values.length) return null;
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
  }
  
  function getAll(sql, params = []) {
    const res = db.exec(sql, params);
    if (!res.length) return [];
    return res[0].values.map(row => {
      const obj = {};
      res[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    });
  }
  
  function saveDB() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
  
  return {
    getServices: () => getAll('SELECT * FROM services'),
    getService: (id) => getOne(`SELECT * FROM services WHERE id = ${id}`),
    
    addUser: (user) => {
      db.run(`INSERT OR REPLACE INTO users (user_id, username, first_name) VALUES (${user.user_id}, '${user.username || ''}', '${user.first_name || ''}')`);
      saveDB();
    },
    getUser: (userId) => getOne(`SELECT * FROM users WHERE user_id = ${userId}`),
    
    createBooking: (booking) => {
      db.run(`
        INSERT INTO bookings (user_id, user_name, user_phone, service_id, booking_date, booking_time, status)
        VALUES (${booking.user_id}, '${booking.user_name || ''}', '${booking.user_phone}', ${booking.service_id}, '${booking.booking_date}', '${booking.booking_time}', 'pending')
      `);
      saveDB();
      const res = db.exec('SELECT last_insert_rowid() as id');
      return res[0].values[0][0];
    },
    
    updatePayment: (bookingId, paymentIntentId) => {
      db.run(`UPDATE bookings SET payment_status = 'paid', payment_intent_id = '${paymentIntentId}' WHERE id = ${bookingId}`);
      saveDB();
    },
    
    confirmBooking: (bookingId) => {
      db.run(`UPDATE bookings SET status = 'confirmed' WHERE id = ${bookingId}`);
      saveDB();
    },
    
    getUserBookings: (userId) => {
      return getAll(`
        SELECT b.*, s.name as service_name, s.price 
        FROM bookings b 
        JOIN services s ON b.service_id = s.id 
        WHERE b.user_id = ${userId} 
        ORDER BY b.created_at DESC
      `);
    },
    
    getAllBookings: () => {
      return getAll(`
        SELECT b.*, s.name as service_name, s.price 
        FROM bookings b 
        JOIN services s ON b.service_id = s.id 
        ORDER BY b.created_at DESC
      `);
    },
    
    getAdminStats: () => {
      const totalBookings = getOne('SELECT COUNT(*) as cnt FROM bookings');
      const totalRevenue = getOne(`SELECT SUM(s.price) as total FROM bookings b JOIN services s ON b.service_id = s.id WHERE b.payment_status = 'paid'`);
      const pendingCount = getOne(`SELECT COUNT(*) as cnt FROM bookings WHERE status = 'pending'`);
      const todayCount = getOne(`SELECT COUNT(*) as cnt FROM bookings WHERE booking_date = date('now')`);
      
      return {
        totalBookings: totalBookings?.cnt || 0,
        totalRevenue: totalRevenue?.total || 0,
        pendingCount: pendingCount?.cnt || 0,
        todayCount: todayCount?.cnt || 0
      };
    },
    
    cancelBooking: (bookingId, userId) => {
      const existing = getOne(`SELECT * FROM bookings WHERE id = ${bookingId} AND user_id = ${userId}`);
      if (!existing) return false;
      db.run(`UPDATE bookings SET status = 'cancelled' WHERE id = ${bookingId}`);
      saveDB();
      return true;
    }
  };
}

module.exports = { initDB };
