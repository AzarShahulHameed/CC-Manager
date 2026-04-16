const express = require('express');
const router = express.Router();

// GET all transactions (optionally filtered by card)
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const { card_id, limit = 50 } = req.query;
  try {
    let query = `
      SELECT t.*, c.bank_name, c.card_number, c.holder_name
      FROM transactions t
      JOIN credit_cards c ON t.card_id = c.id
    `;
    const params = [];
    if (card_id) {
      query += ' WHERE t.card_id = ?';
      params.push(card_id);
    }
    query += ' ORDER BY t.transaction_date DESC LIMIT ?';
    params.push(parseInt(limit));
    const txns = db.prepare(query).all(...params);
    res.json(txns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add transaction
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { card_id, amount, description, type = 'charge' } = req.body;
  if (!card_id || !amount) return res.status(400).json({ error: 'card_id and amount required' });

  try {
    // Add transaction
    db.prepare('INSERT INTO transactions (card_id, amount, description, type) VALUES (?, ?, ?, ?)')
      .run(card_id, parseFloat(amount), description || '', type);

    // Update outstanding balance
    const delta = type === 'payment' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
    db.prepare('UPDATE credit_cards SET outstanding_balance = MAX(0, outstanding_balance + ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(delta, card_id);

    const card = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(card_id);
    res.status(201).json({ message: 'Transaction added', card });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
