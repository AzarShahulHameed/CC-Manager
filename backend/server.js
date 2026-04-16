
require('dotenv').config({
  path: require('path').join(process.cwd(), '.env')
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const app = express(); // ✅ THIS WAS MISSING

const { initDB } = require('./db');
const cardRoutes = require('./routes/cards');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes = require('./routes/notifications');
const analyticsRoutes = require('./routes/analytics');
const { runDailyNotificationCheck } = require('./services/notificationService');

const PORT = process.env.PORT || 3001;

// Init DB
const db = initDB();
app.locals.db = db;

// ✅ CONFIRM DATA IS PRESENT
const count = db.prepare('SELECT COUNT(*) as n FROM credit_cards').get();
console.log(`📊 Credit cards in DB at startup: ${count.n}`);

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api/cards', cardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard summary endpoint
app.get('/api/dashboard', (req, res) => {
  const db = req.app.locals.db;
  try {
    const cards = db.prepare('SELECT * FROM credit_cards ORDER BY due_date ASC').all();
    const totalLimit = cards.reduce((s, c) => s + c.credit_limit, 0);
    const totalOutstanding = cards.reduce((s, c) => s + c.outstanding_balance, 0);
    const utilizationRate = totalLimit > 0 ? (totalOutstanding / totalLimit) * 100 : 0;

    const today = new Date();
    const todayDay = today.getDate();

    // Get next due card
    const upcomingDue = cards
      .map(c => {
        const daysUntil = c.due_date >= todayDay
          ? c.due_date - todayDay
          : (new Date(today.getFullYear(), today.getMonth() + 1, c.due_date) - today) / 86400000;
        return { ...c, daysUntilDue: Math.round(daysUntil) };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    const recentTransactions = db.prepare(`
      SELECT t.*, c.bank_name, c.card_number 
      FROM transactions t 
      JOIN credit_cards c ON t.card_id = c.id 
      ORDER BY t.transaction_date DESC LIMIT 10
    `).all();

    res.json({
      totalCards: cards.length,
      totalLimit,
      totalOutstanding,
      availableCredit: totalLimit - totalOutstanding,
      utilizationRate: Math.round(utilizationRate * 10) / 10,
      cards: upcomingDue,
      recentTransactions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Best card recommendation
app.get('/api/recommend', (req, res) => {
  const db = req.app.locals.db;
  const { amount = 0, date } = req.query;
  // Use provided payment date or today
  const today = date ? new Date(date) : new Date();
  const payAmount = parseFloat(amount);

  try {
    const cards = db.prepare('SELECT * FROM credit_cards').all();
    const todayDay = today.getDate();

    const scored = cards.map(card => {
      const available = card.credit_limit - card.outstanding_balance;
      const canAfford = available >= payAmount;

      // Days until billing
      let daysToBilling = card.billing_date >= todayDay
        ? card.billing_date - todayDay
        : (new Date(today.getFullYear(), today.getMonth() + 1, card.billing_date) - today) / 86400000;

      // Days until due
      let daysToDue = card.due_date >= todayDay
        ? card.due_date - todayDay
        : (new Date(today.getFullYear(), today.getMonth() + 1, card.due_date) - today) / 86400000;

      daysToBilling = Math.round(daysToBilling);
      daysToDue = Math.round(daysToDue);

      const utilization = (card.outstanding_balance / card.credit_limit) * 100;

      // Score: more days before billing = better, lower utilization = better
      let score = 0;
      if (canAfford) {
        score += daysToBilling * 3;     // More days before billing = more interest-free time
        score += daysToDue * 2;         // More days before due = more flexibility
        score += (100 - utilization);   // Lower utilization = better for credit score
        score += (available / 1000);    // More available credit = better buffer
      }

      return {
        ...card,
        available,
        canAfford,
        daysToBilling,
        daysToDue,
        utilization: Math.round(utilization * 10) / 10,
        score: Math.round(score),
        recommendation: canAfford
          ? daysToBilling >= 5
            ? 'BEST CHOICE — billing cycle not closing soon, maximize interest-free period'
            : daysToBilling <= 2
            ? 'CAUTION — billing date is very close, charge will appear this month'
            : 'GOOD CHOICE — moderate billing window remaining'
          : 'INSUFFICIENT LIMIT — not enough available credit'
      };
    });

    const sorted = scored.sort((a, b) => b.score - a.score);
    res.json({ amount: payAmount, recommendations: sorted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cron: daily check at 9 AM
cron.schedule('0 9 * * *', () => {
  console.log('[CRON] Running daily notification check...');
  runDailyNotificationCheck(db);
});

app.listen(PORT, () => {
  console.log(`✅ CC Manager API running on http://localhost:${PORT}`);
  console.log(`📅 Daily SMS notifications scheduled at 9:00 AM`);
});
