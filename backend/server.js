require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const pool = require('./db');

const app = express();

// --- CORS — must be FIRST before any routes ---
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.options('*', cors());

// --- middleware ---
app.use(express.json());
app.use((req, res, next) => {
  console.log('👉', req.method, req.url);
  next();
});

// --- root ---
app.get('/', (req, res) => res.send('CC Manager Backend is running'));

// --- api routes ---
const cardRoutes        = require('./routes/cards');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes= require('./routes/notifications');
const analyticsRoutes   = require('./routes/analytics');

app.use('/api/cards',         cardRoutes);
app.use('/api/transactions',  transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics',     analyticsRoutes);

// --- health ---
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── DASHBOARD SUMMARY (was missing!) ────────────────────────
app.get('/api/dashboard', async (req, res) => {
  try {
    const cardsResult = await pool.query('SELECT * FROM credit_cards ORDER BY due_date ASC');
    const cards = cardsResult.rows;

    const totalLimit       = cards.reduce((s,c) => s + Number(c.credit_limit), 0);
    const totalOutstanding = cards.reduce((s,c) => s + Number(c.outstanding_balance), 0);
    const utilizationRate  = totalLimit > 0 ? Math.round((totalOutstanding / totalLimit) * 1000) / 10 : 0;

    const today    = new Date();
    const todayDay = today.getDate();

    // Add daysUntilDue to each card for sorting
    const cardsWithDays = cards.map(c => {
      const due = parseInt(c.due_date);
      const daysUntilDue = due >= todayDay
        ? due - todayDay
        : Math.round((new Date(today.getFullYear(), today.getMonth()+1, due) - today) / 86400000);
      return { ...c, daysUntilDue };
    }).sort((a,b) => a.daysUntilDue - b.daysUntilDue);

    const recentTxns = await pool.query(`
      SELECT t.*, c.bank_name, c.card_number
      FROM transactions t
      JOIN credit_cards c ON t.card_id = c.id
      ORDER BY t.transaction_date DESC
      LIMIT 10
    `);

    res.json({
      totalCards:       cards.length,
      totalLimit,
      totalOutstanding,
      availableCredit:  totalLimit - totalOutstanding,
      utilizationRate,
      cards:            cardsWithDays,
      recentTransactions: recentTxns.rows
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── BEST CARD RECOMMENDATION (was missing!) ─────────────────
app.get('/api/recommend', async (req, res) => {
  const { amount = 0, date } = req.query;
  const payAmount = parseFloat(amount);

  try {
    const result = await pool.query('SELECT * FROM credit_cards');
    const cards  = result.rows;

    const today    = date ? new Date(date) : new Date();
    const todayDay = today.getDate();

    const scored = cards.map(card => {
      const available  = Number(card.credit_limit) - Number(card.outstanding_balance);
      const canAfford  = available >= payAmount;

      let daysToBilling = parseInt(card.billing_date) >= todayDay
        ? parseInt(card.billing_date) - todayDay
        : Math.round((new Date(today.getFullYear(), today.getMonth()+1, parseInt(card.billing_date)) - today) / 86400000);

      let daysToDue = parseInt(card.due_date) >= todayDay
        ? parseInt(card.due_date) - todayDay
        : Math.round((new Date(today.getFullYear(), today.getMonth()+1, parseInt(card.due_date)) - today) / 86400000);

      daysToBilling = Math.round(daysToBilling);
      daysToDue     = Math.round(daysToDue);

      const utilization = (Number(card.outstanding_balance) / Number(card.credit_limit)) * 100;

      let score = 0;
      if (canAfford) {
        score += daysToBilling * 3;
        score += daysToDue * 2;
        score += (100 - utilization);
        score += (available / 1000);
      } else {
        // Still score so we can rank by available balance when none can afford
        score = available / 100;
      }

      let recommendation = '';
      if (!canAfford) {
        recommendation = `Insufficient limit — only AED ${available.toLocaleString()} available`;
      } else if (daysToBilling >= 5) {
        recommendation = 'BEST CHOICE — billing cycle not closing soon, maximise interest-free period';
      } else if (daysToBilling <= 2) {
        recommendation = 'CAUTION — billing date is very close, charge will appear this month';
      } else {
        recommendation = 'GOOD CHOICE — moderate billing window remaining';
      }

      return {
        ...card,
        credit_limit:        Number(card.credit_limit),
        outstanding_balance: Number(card.outstanding_balance),
        available,
        canAfford,
        daysToBilling,
        daysToDue,
        utilization: Math.round(utilization * 10) / 10,
        score:       Math.round(score),
        recommendation
      };
    });

    const sorted = scored.sort((a,b) => b.score - a.score);
    res.json({ amount: payAmount, recommendations: sorted });
  } catch (err) {
    console.error('Recommend error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- cron: daily 9AM ---
const { runDailyNotificationCheck } = require('./services/notificationService');
cron.schedule('0 9 * * *', () => {
  console.log('[CRON] Running daily notification check...');
  runDailyNotificationCheck(pool);
});

// --- 404 fallback ---
app.use((req, res) => {
  console.log('❗ 404:', req.method, req.path);
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ CC Manager running on port ${PORT}`));