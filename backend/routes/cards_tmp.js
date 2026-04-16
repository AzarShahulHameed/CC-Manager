console.log('✅ cards routes file loaded');
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET all cards
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM credit_cards ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single card
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM credit_cards WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create card
router.post('/', async (req, res) => {
  const {
    card_number,
    holder_name,
    bank_name,
    credit_limit,
    outstanding_balance,
    billing_date,
    due_date,
    sms_phone,
    color
  } = req.body;

  if (!card_number || !holder_name || !bank_name || !credit_limit || !billing_date || !due_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const insert = await pool.query(
      `
      INSERT INTO credit_cards
      (card_number, holder_name, bank_name, credit_limit, outstanding_balance,
       billing_date, due_date, sms_phone, color)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        card_number,
        holder_name,
        bank_name,
        parseFloat(credit_limit),
        parseFloat(outstanding_balance || 0),
        parseInt(billing_date),
        parseInt(due_date),
        sms_phone || null,
        color || '#1e3a5f'
      ]
    );

    res.status(201).json(insert.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update card
router.put('/:id', async (req, res) => {
  const {
    card_number,
    holder_name,
    bank_name,
    credit_limit,
    outstanding_balance,
    billing_date,
    due_date,
    sms_phone,
    color
  } = req.body;

  try {
    const update = await pool.query(
      `
      UPDATE credit_cards SET
        card_number=$1,
        holder_name=$2,
        bank_name=$3,
        credit_limit=$4,
        outstanding_balance=$5,
        billing_date=$6,
        due_date=$7,
        sms_phone=$8,
        color=$9,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$10
      RETURNING *
      `,
      [
        card_number,
        holder_name,
        bank_name,
        parseFloat(credit_limit),
        parseFloat(outstanding_balance || 0),
        parseInt(billing_date),
        parseInt(due_date),
        sms_phone || null,
        color || '#1e3a5f',
        req.params.id
      ]
    );

    if (update.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json(update.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update outstanding balance
router.patch('/:id/balance', async (req, res) => {
  const { outstanding_balance } = req.body;

  try {
    const update = await pool.query(
      `
      UPDATE credit_cards
      SET outstanding_balance=$1, updated_at=CURRENT_TIMESTAMP
      WHERE id=$2
      RETURNING *
      `,
      [parseFloat(outstanding_balance), req.params.id]
    );

    if (update.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json(update.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE card
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM credit_cards WHERE id=$1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({ message: 'Card deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
