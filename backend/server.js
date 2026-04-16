console.log('🔥 CORRECT BACKEND server.js LOADED');
app.get('/', (req, res) => {
  res.send('CC Manager Backend is running');
});
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const app = express();

// ✅ PostgreSQL pool
const pool = require('./db');

// Routes
const cardRoutes = require('./routes/cards');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const { runDailyNotificationCheck } = require('./services/notificationService');

const PORT = process.env.PORT || 3001;

// Middleware
console.log('✅ REGISTERING ROUTES...');
app.use(cors({ origin: '*' }));
app.use(express.json());


// Routes
app.use('/api/cards', cardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// Catch‑all 404 (must be LAST)
app.use((req, res) => {
  console.log('❗ Unmatched path reached Express:', req.method, req.path);
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ✅ Dashboard summary (PostgreSQL)
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

    const utilizationRate =
      totalLimit > 0 ? (totalOutstanding / totalLimit) * 100 : 0;

    const today = new Date();
    const todayDay = today.getDate();

    const upcomingDue = cards
      .map(c => {
        const daysUntil =
          c.due_date >= todayDay
            ? c.due_date - todayDay
            : Math.round(
                (new Date(today.getFullYear(), today.getMonth() + 1, c.due_date) -
                  today) /
                  86400000
              );
        return { ...c, daysUntilDue: daysUntil };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    const recentTxResult = await pool.query(`
      SELECT t.*, c.bank_name, c.card_number
      FROM transactions t
      JOIN credit_cards c ON t.card_id = c.id
      ORDER BY t.transaction_date DESC
      LIMIT 10
    `);

    res.json({
      totalCards: cards.length,
      totalLimit,
      totalOutstanding,
      availableCredit: totalLimit - totalOutstanding,
      utilizationRate: Math.round(utilizationRate * 10) / 10,
      cards: upcomingDue,
      recentTransactions: recentTxResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Best card recommendation (PostgreSQL)
app.get('/api/recommend', async (req, res) => {
  const { amount = 0, date } = req.query;
  const today = date ? new Date(date) : new Date();
  const todayDay = today.getDate();
  const payAmount = parseFloat(amount);

  try {
    const result = await pool.query('SELECT * FROM credit_cards');
    const cards = result.rows;

    const scored = cards.map(card => {
      const available =
        Number(card.credit_limit) - Number(card.outstanding_balance);

      const daysToBilling =
        card.billing_date >= todayDay
          ? card.billing_date - todayDay
          : Math.round(
              (new Date(
                today.getFullYear(),
                today.getMonth() + 1,
                card.billing_date
              ) -
                today) /
                86400000
            );

      const daysToDue =
        card.due_date >= todayDay
          ? card.due_date - todayDay
          : Math.round(
              (new Date(
                today.getFullYear(),
                today.getMonth() + 1,
                card.due_date
              ) -
                today) /
                86400000
            );

      const utilization =
        (Number(card.outstanding_balance) / Number(card.credit_limit)) * 100;

      let score = 0;
      if (available >= payAmount) {
        score += daysToBilling * 3;
        score += daysToDue * 2;
        score += 100 - utilization;
        score += available / 1000;
      }

      return {
        ...card,
        available,
        daysToBilling,
        daysToDue,
        utilization: Math.round(utilization * 10) / 10,
        score: Math.round(score)
      };
    });

    res.json({
      amount: payAmount,
      recommendations: scored.sort((a, b) => b.score - a.score)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Cron: daily notification at 9 AM (UTC unless timezone set)
cron.schedule('0 9 * * *', () => {
  runDailyNotificationCheck(pool);
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`✅ CC Manager API running on port ${PORT}`);
  console.log(`📅 Daily SMS notifications scheduled at 9:00 AM`);
});