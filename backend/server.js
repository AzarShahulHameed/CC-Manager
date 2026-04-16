require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
console.log('🔥 CORRECT BACKEND server.js LOADED');

// DB
const pool = require('./db');

// Route imports
const cardRoutes = require('./routes/cards');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const { runDailyNotificationCheck } = require('./services/notificationService');

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// ✅ Root route
app.get('/', (req, res) => {
  res.send('CC Manager Backend is running');
});

// ✅ API routes
console.log('✅ REGISTERING ROUTES...');
app.use('/api/cards', cardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ✅ Dashboard
app.get('/api/dashboard', async (req, res) => {
  const result = await pool.query('SELECT * FROM credit_cards');
  res.json(result.rows);
});

// ✅ CRON
cron.schedule('0 9 * * *', () => {
  runDailyNotificationCheck(pool);
});

// ✅ 404 handler — MUST BE LAST
app.use((req, res) => {
  console.log('❗ Unmatched path reached Express:', req.method, req.path);
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ✅ Start server LAST
app.listen(PORT, () => {
  console.log(`✅ CC Manager API running on port ${PORT}`);
});
