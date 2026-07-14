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


// PUT update transaction
router.put('/:id', async (req, res) => {
  const { card_id, amount, description, type, transaction_date } = req.body;
  const txnDate = transaction_date ? new Date(transaction_date) : new Date();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get old transaction to reverse balance effect
    const old = await client.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (old.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transaction not found' }); }
    const oldTxn = old.rows[0];

    // Reverse old balance effect on old card
    const oldDelta = oldTxn.type === 'payment' ? Math.abs(Number(oldTxn.amount)) : -Math.abs(Number(oldTxn.amount));
    await client.query(
      'UPDATE credit_cards SET outstanding_balance = GREATEST(0, outstanding_balance + $1), updated_at=CURRENT_TIMESTAMP WHERE id=$2',
      [oldDelta, oldTxn.card_id]
    );

    // Update transaction
    await client.query(
      'UPDATE transactions SET card_id=$1, amount=$2, description=$3, type=$4, transaction_date=$5 WHERE id=$6',
      [Number(card_id), parseFloat(amount), description || '', type, txnDate, req.params.id]
    );

    // Apply new balance effect on new card
    const newDelta = type === 'payment' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
    await client.query(
      'UPDATE credit_cards SET outstanding_balance = GREATEST(0, outstanding_balance + $1), updated_at=CURRENT_TIMESTAMP WHERE id=$2',
      [newDelta, Number(card_id)]
    );

    await client.query('COMMIT');
    const updated = await pool.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE transaction
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get transaction first to reverse balance
    const old = await client.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (old.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const txn = old.rows[0];

    // Reverse the balance effect
    const delta = txn.type === 'payment' ? Math.abs(Number(txn.amount)) : -Math.abs(Number(txn.amount));
    await client.query(
      'UPDATE credit_cards SET outstanding_balance = GREATEST(0, outstanding_balance + $1), updated_at=CURRENT_TIMESTAMP WHERE id=$2',
      [delta, txn.card_id]
    );

    await client.query('DELETE FROM transactions WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;