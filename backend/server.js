require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const app = express();

// --- middleware ---
app.use((req, res, next) => {
  console.log('👉 EXPRESS RECEIVED:', req.method, req.url);
  next();
});

app.use(cors({ origin: '*' }));
app.use(express.json());

// --- root ---
app.get('/', (req, res) => {
  res.send('CC Manager Backend is running');
});

// --- api routes ---
const cardRoutes = require('./routes/cards');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');

app.use('/api/cards', cardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// --- health ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- last: 404 ONLY ---
app.use((req, res) => {
  console.log('❗ 404 HIT:', req.method, req.path);
  res.status(404).json({ error: 'Route not found' });
});

// --- listen LAST ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
});