const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all transactions (optionally filtered by card)
router.get('/', async (req, res) => {
  const { card_id, limit = 50 } = req.query;

  try {
    let query = `
      SELECT t.*, c.bank_name, c.card_number, c.holder_name
      FROM transactions t
      JOIN credit_cards c ON t.card_id = c.id
    `;
    const params = [];

    if (card_id) {
      params.push(card_id);
      query += ` WHERE t.card_id = $${params.length}`;
    }

    params.push(parseInt(limit));
    query += ` ORDER BY t.transaction_date DESC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST add transaction
router.post('/', async (req, res) => {
  const { card_id, amount, description, type = 'charge' } = req.body;

  if (!card_id || !amount) {
    return res.status(400).json({ error: 'card_id and amount required' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert transaction
    await client.query(
      `
      INSERT INTO transactions (card_id, amount, description, type)
      VALUES ($1, $2, $3, $4)
      `,
      [
        card_id,
        parseFloat(amount),
        description || '',
        type
      ]
    );

    // Update outstanding balance
    const delta =
      type === 'payment'
        ? -Math.abs(parseFloat(amount))
        : Math.abs(parseFloat(amount));

    await client.query(
      `
      UPDATE credit_cards
      SET outstanding_balance = GREATEST(0, outstanding_balance + $1),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [delta, card_id]
    );

    // Fetch updated card
    const cardResult = await client.query(
      'SELECT * FROM credit_cards WHERE id = $1',
      [card_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Transaction added',
      card: cardResult.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;