const express = require('express');
const router = express.Router();

// Monthly spending per card (last 6 months)
router.get('/spending', (req, res) => {
  const db = req.app.locals.db;
  try {
    const rows = db.prepare(`
      SELECT
        strftime('%Y-%m', transaction_date) AS month,
        c.bank_name,
        c.card_number,
        SUM(CASE WHEN type = 'charge' THEN amount ELSE 0 END) AS charged,
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) AS paid
      FROM transactions t
      JOIN credit_cards c ON t.card_id = c.id
      WHERE transaction_date >= date('now', '-6 months')
      GROUP BY month, t.card_id
      ORDER BY month ASC
    `).all();

    // Build chart-friendly structure
    const months = [...new Set(rows.map(r => r.month))].sort();
    const cards = [...new Set(rows.map(r => r.bank_name + ' ****' + r.card_number.slice(-4)))];

    const chartData = months.map(month => {
      const entry = { month };
      cards.forEach(card => {
        const row = rows.find(r => r.month === month && (r.bank_name + ' ****' + r.card_number.slice(-4)) === card);
        entry[card] = row ? row.charged : 0;
      });
      return entry;
    });

    // Total by category (top descriptions)
    const topSpend = db.prepare(`
      SELECT description, SUM(amount) as total, COUNT(*) as count
      FROM transactions
      WHERE type = 'charge' AND transaction_date >= date('now', '-30 days')
      GROUP BY description
      ORDER BY total DESC
      LIMIT 10
    `).all();

    res.json({ chartData, cards, topSpend });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Card utilization history
router.get('/utilization', (req, res) => {
  const db = req.app.locals.db;
  try {
    const cards = db.prepare('SELECT * FROM credit_cards').all();
    const data = cards.map(c => ({
      name: `${c.bank_name} ****${c.card_number.slice(-4)}`,
      bank_name: c.bank_name,
      limit: c.credit_limit,
      outstanding: c.outstanding_balance,
      available: c.credit_limit - c.outstanding_balance,
      utilization: Math.round((c.outstanding_balance / c.credit_limit) * 100 * 10) / 10,
      color: c.color
    }));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
