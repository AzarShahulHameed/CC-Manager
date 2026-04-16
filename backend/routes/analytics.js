const express = require('express');
const router = express.Router();
const pool = require('../db');

// Monthly spending per card (last 6 months)
router.get('/spending', async (req, res) => {
  try {
    const spendingResult = await pool.query(`
      SELECT
        to_char(t.transaction_date, 'YYYY-MM') AS month,
        c.bank_name,
        c.card_number,
        SUM(CASE WHEN t.type = 'charge' THEN t.amount ELSE 0 END) AS charged,
        SUM(CASE WHEN t.type = 'payment' THEN t.amount ELSE 0 END) AS paid
      FROM transactions t
      JOIN credit_cards c ON t.card_id = c.id
      WHERE t.transaction_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY month, t.card_id, c.bank_name, c.card_number
      ORDER BY month ASC
    `);

    const rows = spendingResult.rows;

    // Build chart-friendly structure
    const months = [...new Set(rows.map(r => r.month))].sort();
    const cards = [...new Set(
      rows.map(r => `${r.bank_name} ****${r.card_number.slice(-4)}`)
    )];

    const chartData = months.map(month => {
      const entry = { month };
      cards.forEach(card => {
        const row = rows.find(
          r =>
            r.month === month &&
            `${r.bank_name} ****${r.card_number.slice(-4)}` === card
        );
        entry[card] = row ? Number(row.charged) : 0;
      });
      return entry;
    });

    // Top spending categories (last 30 days)
    const topSpendResult = await pool.query(`
      SELECT description, SUM(amount) AS total, COUNT(*) AS count
      FROM transactions
      WHERE type = 'charge'
        AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY description
      ORDER BY total DESC
      LIMIT 10
    `);

    res.json({
      chartData,
      cards,
      topSpend: topSpendResult.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Card utilization
router.get('/utilization', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM credit_cards');

    const data = result.rows.map(c => ({
      name: `${c.bank_name} ****${c.card_number.slice(-4)}`,
      bank_name: c.bank_name,
      limit: Number(c.credit_limit),
      outstanding: Number(c.outstanding_balance),
      available: Number(c.credit_limit) - Number(c.outstanding_balance),
      utilization: Math.round(
        (Number(c.outstanding_balance) / Number(c.credit_limit)) * 100 * 10
      ) / 10,
      color: c.color
    }));

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;