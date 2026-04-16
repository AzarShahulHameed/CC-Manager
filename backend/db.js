const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// ✅ DETECT ELECTRON
let BASE_DIR;

try {
  const { app } = require('electron');
  BASE_DIR = app.getPath('userData');
} catch {
  // fallback for normal node run
  BASE_DIR = path.join(__dirname);
}

// ✅ FINAL DB DIRECTORY
const DATA_DIR = path.join(BASE_DIR, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ✅ SINGLE, SAFE DB LOCATION
const DB_PATH = path.join(DATA_DIR, 'cards.db');
console.log('✅ Using SQLite DB at:', DB_PATH);

// 🚨 REMOVE LEGACY BLOCK (invalid in Electron)
// Your old safety guard should be REMOVED
// because __dirname is no longer the authority

function initDB() {
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_number TEXT NOT NULL,
      holder_name TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      credit_limit REAL NOT NULL,
      outstanding_balance REAL DEFAULT 0,
      billing_date INTEGER NOT NULL,
      due_date INTEGER NOT NULL,
      sms_phone TEXT,
      color TEXT DEFAULT '#1a1a2e',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      type TEXT CHECK(type IN ('charge', 'payment', 'adjustment')) DEFAULT 'charge',
      transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (card_id) REFERENCES credit_cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'sent',
      FOREIGN KEY (card_id) REFERENCES credit_cards(id) ON DELETE CASCADE
    );
  `);

  return db;
}

module.exports = { initDB, DB_PATH };