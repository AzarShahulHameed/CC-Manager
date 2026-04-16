const express = require('express');
const router = express.Router();

// GET all cards
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  try {
    const cards = db.prepare('SELECT * FROM credit_cards ORDER BY created_at DESC').all();
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single card
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  try {
    const card = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create card
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { card_number, holder_name, bank_name, credit_limit, outstanding_balance, billing_date, due_date, sms_phone, color } = req.body;

  if (!card_number || !holder_name || !bank_name || !credit_limit || !billing_date || !due_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO credit_cards (card_number, holder_name, bank_name, credit_limit, outstanding_balance, billing_date, due_date, sms_phone, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      card_number, holder_name, bank_name,
      parseFloat(credit_limit), parseFloat(outstanding_balance || 0),
      parseInt(billing_date), parseInt(due_date),
      sms_phone || null, color || '#1e3a5f'
    );
    const newCard = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newCard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update card
router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const { card_number, holder_name, bank_name, credit_limit, outstanding_balance, billing_date, due_date, sms_phone, color } = req.body;

  try {
    const stmt = db.prepare(`
      UPDATE credit_cards SET
        card_number = ?, holder_name = ?, bank_name = ?,
        credit_limit = ?, outstanding_balance = ?,
        billing_date = ?, due_date = ?,
        sms_phone = ?, color = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(
      card_number, holder_name, bank_name,
      parseFloat(credit_limit), parseFloat(outstanding_balance || 0),
      parseInt(billing_date), parseInt(due_date),
      sms_phone || null, color || '#1e3a5f',
      req.params.id
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
    const updated = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update outstanding balance
router.patch('/:id/balance', (req, res) => {
  const db = req.app.locals.db;
  const { outstanding_balance } = req.body;
  try {
    db.prepare('UPDATE credit_cards SET outstanding_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(parseFloat(outstanding_balance), req.params.id);
    const updated = db.prepare('SELECT * FROM credit_cards WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE card
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = db.prepare('DELETE FROM credit_cards WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Card not found' });
    res.json({ message: 'Card deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
