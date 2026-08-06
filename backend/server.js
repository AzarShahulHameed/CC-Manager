require('dotenv').config();
const { validateEnv } = require('./config/env');
validateEnv();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const pool = require('./db');
const { requireAuth, resolveOfficeScope } = require('./middleware/auth');

const app = express();

// --- CORS ---
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

app.use(express.json());
app.use((req, res, next) => {
  console.log('👉', req.method, req.url);
  next();
});

app.get('/', (req, res) => res.send('CC Manager Backend is running'));
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unreachable', error: err.message, timestamp: new Date() });
  }
});

// --- public route: login ---
app.use('/api/auth', require('./routes/auth'));

// --- protected api routes ---
app.use('/api/cards', require('./routes/cards'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/admin/email-templates', require('./routes/emailTemplates'));
app.use('/api/admin', require('./routes/admin'));

// ─── DASHBOARD SUMMARY (now office-scoped, requires auth) ────
app.get('/api/dashboard', requireAuth, resolveOfficeScope, async (req, res) => {
  try {
    const params = [];
    let cardQuery = 'SELECT * FROM credit_cards WHERE is_archived = false';
    if (req.officeScope !== null) {
      params.push(req.officeScope);
      cardQuery += ` AND office_id = $${params.length}`;
    }
    cardQuery += ' ORDER BY due_date ASC';

    const cardsResult = await pool.query(cardQuery, params);
    const cards = cardsResult.rows;

    const totalLimit = cards.reduce((s, c) => s + Number(c.credit_limit), 0);
    const totalOutstanding = cards.reduce((s, c) => s + Number(c.outstanding_balance), 0);
    const utilizationRate = totalLimit > 0 ? Math.round((totalOutstanding / totalLimit) * 1000) / 10 : 0;

    const today = new Date();
    const todayDay = today.getDate();

    const cardsWithDays = cards.map(c => {
      const due = parseInt(c.due_date);
      const daysUntilDue = due >= todayDay
        ? due - todayDay
        : Math.round((new Date(today.getFullYear(), today.getMonth() + 1, due) - today) / 86400000);
      return { ...c, credit_limit: Number(c.credit_limit), outstanding_balance: Number(c.outstanding_balance), daysUntilDue };
    }).sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    const txnParams = [...params];
    let txnQuery = `
      SELECT t.*, c.bank_name, c.card_number
      FROM transactions t JOIN credit_cards c ON t.card_id = c.id
    `;
    if (req.officeScope !== null) txnQuery += ` WHERE c.office_id = $${txnParams.length}`;
    txnQuery += ' ORDER BY t.transaction_date DESC LIMIT 10';

    const recentTxns = await pool.query(txnQuery, txnParams);
    const recentTransactions = recentTxns.rows.map(t => ({ ...t, amount: Number(t.amount) }));

    res.json({
      totalCards: cards.length,
      totalLimit,
      totalOutstanding,
      availableCredit: totalLimit - totalOutstanding,
      utilizationRate,
      cards: cardsWithDays,
      recentTransactions
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── BEST CARD RECOMMENDATION (office-scoped, requires auth) ──
app.get('/api/recommend', requireAuth, resolveOfficeScope, async (req, res) => {
  const { amount = 0, date } = req.query;
  const payAmount = parseFloat(amount);

  try {
    const params = [];
    let query = 'SELECT * FROM credit_cards WHERE is_archived = false';
    if (req.officeScope !== null) {
      params.push(req.officeScope);
      query += ` AND office_id = $${params.length}`;
    }
    const result = await pool.query(query, params);
    const cards = result.rows;

    const today = date ? new Date(date) : new Date();
    const todayDay = today.getDate();

    const scored = cards.map(card => {
      const available = Number(card.credit_limit) - Number(card.outstanding_balance);
      const canAfford = available >= payAmount;

      let daysToBilling = parseInt(card.billing_date) >= todayDay
        ? parseInt(card.billing_date) - todayDay
        : Math.round((new Date(today.getFullYear(), today.getMonth() + 1, parseInt(card.billing_date)) - today) / 86400000);

      let daysToDue = parseInt(card.due_date) >= todayDay
        ? parseInt(card.due_date) - todayDay
        : Math.round((new Date(today.getFullYear(), today.getMonth() + 1, parseInt(card.due_date)) - today) / 86400000);

      daysToBilling = Math.round(daysToBilling);
      daysToDue = Math.round(daysToDue);

      const utilization = (Number(card.outstanding_balance) / Number(card.credit_limit)) * 100;
      const interestFreeDays = daysToBilling + daysToDue;

      let score = 0;
      if (canAfford) {
        score += interestFreeDays * 10;
        score += daysToBilling * 5;
        score += (100 - utilization) * 0.5;
        score += (available / 10000);
      } else {
        score += interestFreeDays * 10;
        score += (available / 10000);
      }

      let recommendation = '';
      if (!canAfford) {
        recommendation = `Limit insufficient — ${available.toLocaleString()} available, ${interestFreeDays}d interest-free window`;
      } else if (daysToBilling >= 7) {
        recommendation = 'BEST CHOICE — billing far away, maximum interest-free period available';
      } else if (daysToBilling >= 4) {
        recommendation = 'GOOD CHOICE — moderate billing window, decent interest-free period';
      } else if (daysToBilling <= 2) {
        recommendation = 'CAUTION — billing closes very soon, charge will appear on this month\'s statement';
      } else {
        recommendation = 'ACCEPTABLE — billing closes soon but still within the window';
      }

      return {
        ...card,
        credit_limit: Number(card.credit_limit),
        outstanding_balance: Number(card.outstanding_balance),
        available, canAfford, daysToBilling, daysToDue,
        utilization: Math.round(utilization * 10) / 10,
        score: Math.round(score),
        recommendation
      };
    });

    const sorted = scored.sort((a, b) => b.score - a.score);
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
