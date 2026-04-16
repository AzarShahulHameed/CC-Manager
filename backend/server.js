// 1️⃣ Load environment variables FIRST
require('dotenv').config();

// 2️⃣ Imports
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

// 3️⃣ Create app BEFORE using it
const app = express();

console.log('🔥 CORRECT BACKEND server.js LOADED');

// 4️⃣ Database
const pool = require('./db');

// 5️⃣ Routes imports
const cardRoutes = require('./routes/cards');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const { runDailyNotificationCheck } = require('./services/notificationService');

const PORT = process.env.PORT || 3001;

// 6️⃣ Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// 7️⃣ ROOT route (important for Render edge)
app.get('/', (req, res) => {
  res.send('CC Manager Backend is running');
});

// 8️⃣ API routes
console.log('✅ REGISTERING ROUTES...');
app.use('/api/cards', cardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// 9️⃣ Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 🔟 Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const cardsResult = await pool.query(
      'SELECT * FROM credit_cards ORDER BY due_date ASC'
    );
    const cards = cardsResult.rows;

    const totalLimit = cards.reduce((s, c) => s + Number(c.credit_limit), 0);
    const totalOutstanding = cards.reduce(
      (s, c) => s + Number(c.outstanding_balance),
      0
    );

    res.json({
      totalCards: cards.length,
      totalLimit,
      totalOutstanding
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 1️⃣1️⃣ Catch‑all 404 (MUST be last)
app.use((req, res) => {
  console.log('❗ Unmatched path reached Express:', req.method, req.path);
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// 1️⃣2️⃣ Cron job
cron.schedule('0 9 * * *', () => {
  runDailyNotificationCheck(pool);
});

// 1️⃣3️⃣ Start server LAST
app.listen(PORT, () => {
  console.log(`✅ CC Manager API running on port ${PORT}`);
  console.log('📅 Daily SMS notifications scheduled at 9:00 AM');
});
