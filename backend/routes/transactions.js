const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, resolveOfficeScope } = require('../middleware/auth');

router.use(requireAuth, resolveOfficeScope);

// GET all transactions (optionally filtered by card, always office-scoped, paginated)
router.get('/', async (req, res) => {
  const { card_id, limit = 100, offset = 0 } = req.query;
  const safeLimit = Math.min(parseInt(limit) || 100, 1000);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);

  try {
    const params = [];
    let whereClause = 'WHERE 1=1';

    if (req.officeScope !== null) {
      params.push(req.officeScope);
      whereClause += ` AND c.office_id = $${params.length}`;
    }
    if (card_id) {
      params.push(card_id);
      whereClause += ` AND t.card_id = $${params.length}`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM transactions t JOIN credit_cards c ON t.card_id = c.id ${whereClause}`,
      params
    );

    params.push(safeLimit, safeOffset);
    const query = `
      SELECT t.*, c.bank_name, c.card_number, c.holder_name, c.office_id
      FROM transactions t
      JOIN credit_cards c ON t.card_id = c.id
      ${whereClause}
      ORDER BY t.transaction_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await pool.query(query, params);
    res.json({
      transactions: result.rows.map(t => ({ ...t, amount: Number(t.amount) })),
      total: parseInt(countResult.rows[0].count),
      limit: safeLimit,
      offset: safeOffset
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: confirm a card belongs to the caller's office before mutating it
async function assertCardInScope(cardId, officeScope) {
  const r = await pool.query('SELECT office_id FROM credit_cards WHERE id = $1', [cardId]);
  if (r.rows.length === 0) return { ok: false, status: 404, error: 'Card not found' };
  if (officeScope !== null && r.rows[0].office_id !== officeScope) {
    return { ok: false, status: 403, error: 'Card belongs to a different office' };
  }
  return { ok: true };
}

// POST add transaction
router.post('/', async (req, res) => {
  const { card_id, amount, description, type = 'charge' } = req.body;

  if (!card_id || !amount) {
    return res.status(400).json({ error: 'card_id and amount required' });
  }

  const scopeCheck = await assertCardInScope(card_id, req.officeScope);
  if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ error: scopeCheck.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO transactions (card_id, amount, description, type, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [card_id, parseFloat(amount), description || '', type, req.user.id]
    );

    const delta = type === 'payment' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));
    await client.query(
      `UPDATE credit_cards SET outstanding_balance = GREATEST(0, outstanding_balance + $1),
       updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [delta, card_id]
    );

    const cardResult = await client.query('SELECT * FROM credit_cards WHERE id = $1', [card_id]);
    await client.query('COMMIT');

    res.status(201).json({ message: 'Transaction added', card: cardResult.rows[0] });
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

  const scopeCheck = await assertCardInScope(card_id, req.officeScope);
  if (!scopeCheck.ok) return res.status(scopeCheck.status).json({ error: scopeCheck.error });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const old = await client.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (old.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Transaction not found' }); }
    const oldTxn = old.rows[0];

    const oldScopeCheck = await assertCardInScope(oldTxn.card_id, req.officeScope);
    if (!oldScopeCheck.ok) { await client.query('ROLLBACK'); return res.status(oldScopeCheck.status).json({ error: oldScopeCheck.error }); }

    const oldDelta = oldTxn.type === 'payment' ? Math.abs(Number(oldTxn.amount)) : -Math.abs(Number(oldTxn.amount));
    await client.query(
      'UPDATE credit_cards SET outstanding_balance = GREATEST(0, outstanding_balance + $1), updated_at=CURRENT_TIMESTAMP WHERE id=$2',
      [oldDelta, oldTxn.card_id]
    );

    await client.query(
      'UPDATE transactions SET card_id=$1, amount=$2, description=$3, type=$4, transaction_date=$5 WHERE id=$6',
      [Number(card_id), parseFloat(amount), description || '', type, txnDate, req.params.id]
    );

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

    const old = await client.query('SELECT * FROM transactions WHERE id=$1', [req.params.id]);
    if (old.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const txn = old.rows[0];

    const scopeCheck = await assertCardInScope(txn.card_id, req.officeScope);
    if (!scopeCheck.ok) { await client.query('ROLLBACK'); return res.status(scopeCheck.status).json({ error: scopeCheck.error }); }

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
