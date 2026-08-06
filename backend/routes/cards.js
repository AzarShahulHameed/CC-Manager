const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, resolveOfficeScope } = require('../middleware/auth');
const { logAudit } = require('../services/auditLog');

router.use(requireAuth, resolveOfficeScope);

// pg returns NUMERIC columns as strings (to avoid float precision loss on money).
// Cast them here, once, so nothing downstream — frontend or otherwise — has to
// remember to do it, or silently does string concatenation instead of addition.
function castCard(c) {
  return { ...c, credit_limit: Number(c.credit_limit), outstanding_balance: Number(c.outstanding_balance) };
}

// GET all cards (scoped to the user's office, or ?office_id= for admins)
// Archived (replaced) cards are hidden by default — pass ?include_archived=true to see them.
router.get('/', async (req, res) => {
  try {
    const params = [];
    let query = 'SELECT * FROM credit_cards WHERE 1=1';
    if (req.officeScope !== null) {
      params.push(req.officeScope);
      query += ` AND office_id = $${params.length}`;
    }
    if (req.query.include_archived !== 'true') {
      query += ' AND is_archived = false';
    }
    query += ' ORDER BY id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(castCard));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single card (still office-checked, so users can't view another office's card by guessing an id)
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM credit_cards WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

    const card = result.rows[0];
    if (req.officeScope !== null && card.office_id !== req.officeScope) {
      return res.status(403).json({ error: 'Card belongs to a different office' });
    }
    res.json(castCard(card));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create card
router.post('/', async (req, res) => {
  const {
    card_number, holder_name, bank_name, credit_limit, outstanding_balance,
    billing_date, due_date, sms_phone, notify_email, color, office_id
  } = req.body;

  if (!card_number || !holder_name || !bank_name || !credit_limit || !billing_date || !due_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Non-admins can only create cards in their own office, regardless of what's posted
  const targetOffice = req.officeScope !== null ? req.officeScope : (office_id || req.user.office_id);
  if (!targetOffice) {
    return res.status(400).json({ error: 'office_id required' });
  }

  try {
    const insert = await pool.query(
      `INSERT INTO credit_cards
       (card_number, holder_name, bank_name, credit_limit, outstanding_balance,
        billing_date, due_date, sms_phone, notify_email, color, office_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        card_number, holder_name, bank_name,
        parseFloat(credit_limit), parseFloat(outstanding_balance || 0),
        parseInt(billing_date), parseInt(due_date),
        sms_phone || null, notify_email || null, color || '#1e3a5f',
        targetOffice, req.user.id
      ]
    );
    res.status(201).json(castCard(insert.rows[0]));
    logAudit(pool, {
      userId: req.user.id, actorName: req.user.username, action: 'card.create',
      entityType: 'card', entityId: insert.rows[0].id,
      details: { bank_name, holder_name, masked: `****${card_number.slice(-4)}` }, officeId: targetOffice
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update card
router.put('/:id', async (req, res) => {
  const {
    card_number, holder_name, bank_name, credit_limit, outstanding_balance,
    billing_date, due_date, sms_phone, notify_email, color
  } = req.body;

  try {
    const existing = await pool.query('SELECT office_id FROM credit_cards WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Card not found' });
    if (req.officeScope !== null && existing.rows[0].office_id !== req.officeScope) {
      return res.status(403).json({ error: 'Card belongs to a different office' });
    }

    const update = await pool.query(
      `UPDATE credit_cards SET
        card_number=$1, holder_name=$2, bank_name=$3, credit_limit=$4, outstanding_balance=$5,
        billing_date=$6, due_date=$7, sms_phone=$8, notify_email=$9, color=$10,
        updated_at=CURRENT_TIMESTAMP
       WHERE id=$11 RETURNING *`,
      [
        card_number, holder_name, bank_name,
        parseFloat(credit_limit), parseFloat(outstanding_balance || 0),
        parseInt(billing_date), parseInt(due_date),
        sms_phone || null, notify_email || null, color || '#1e3a5f',
        req.params.id
      ]
    );
    res.json(castCard(update.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update outstanding balance
router.patch('/:id/balance', async (req, res) => {
  const { outstanding_balance } = req.body;
  try {
    const existing = await pool.query('SELECT office_id FROM credit_cards WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Card not found' });
    if (req.officeScope !== null && existing.rows[0].office_id !== req.officeScope) {
      return res.status(403).json({ error: 'Card belongs to a different office' });
    }

    const update = await pool.query(
      `UPDATE credit_cards SET outstanding_balance=$1, updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 RETURNING *`,
      [parseFloat(outstanding_balance), req.params.id]
    );
    res.json(castCard(update.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE card (admin or manager of that office only)
// POST replace a card — for lost/expired/reissued cards. Archives the old
// card (its history stays intact and queryable) and creates a new one,
// moving the outstanding balance across as a logged, auditable transaction
// pair rather than silently overwriting a number.
router.post('/:id/replace', async (req, res) => {
  const {
    card_number, holder_name, bank_name, credit_limit,
    billing_date, due_date, sms_phone, notify_email, color
  } = req.body;

  if (!card_number || !billing_date || !due_date) {
    return res.status(400).json({ error: 'card_number, billing_date, and due_date are required for the replacement card' });
  }
  if (req.user.role === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot replace cards' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const oldResult = await client.query('SELECT * FROM credit_cards WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (oldResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Card not found' }); }
    const oldCard = oldResult.rows[0];
    if (req.officeScope !== null && oldCard.office_id !== req.officeScope) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Card belongs to a different office' });
    }
    if (oldCard.is_archived) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This card has already been replaced' });
    }

    const transferAmount = Number(oldCard.outstanding_balance);

    // New card starts at 0, then gets the balance moved in as a real transaction —
    // same mechanism as any other balance change, so it shows up in the ledger.
    const newCardInsert = await client.query(
      `INSERT INTO credit_cards
       (card_number, holder_name, bank_name, credit_limit, outstanding_balance,
        billing_date, due_date, sms_phone, notify_email, color, office_id, created_by)
       VALUES ($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        card_number, holder_name || oldCard.holder_name, bank_name || oldCard.bank_name,
        parseFloat(credit_limit) || Number(oldCard.credit_limit),
        parseInt(billing_date), parseInt(due_date),
        sms_phone || oldCard.sms_phone, notify_email || oldCard.notify_email,
        color || oldCard.color, oldCard.office_id, req.user.id
      ]
    );
    const newCard = newCardInsert.rows[0];

    if (transferAmount > 0) {
      // Zero out the old card
      await client.query(
        `INSERT INTO transactions (card_id, amount, description, type, created_by)
         VALUES ($1, $2, $3, 'payment', $4)`,
        [oldCard.id, transferAmount, `Balance transferred to replacement card ****${card_number.slice(-4)}`, req.user.id]
      );
      await client.query(
        `UPDATE credit_cards SET outstanding_balance = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [oldCard.id]
      );
      // Move it onto the new card
      await client.query(
        `INSERT INTO transactions (card_id, amount, description, type, created_by)
         VALUES ($1, $2, $3, 'charge', $4)`,
        [newCard.id, transferAmount, `Balance transferred from ${oldCard.bank_name} ****${oldCard.card_number.slice(-4)}`, req.user.id]
      );
      await client.query(
        `UPDATE credit_cards SET outstanding_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [transferAmount, newCard.id]
      );
    }

    await client.query(
      `UPDATE credit_cards SET is_archived = true, replaced_by_card_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newCard.id, oldCard.id]
    );

    await client.query('COMMIT');

    logAudit(pool, {
      userId: req.user.id, actorName: req.user.username, action: 'card.replace',
      entityType: 'card', entityId: oldCard.id,
      details: { old_card: `****${oldCard.card_number.slice(-4)}`, new_card: `****${card_number.slice(-4)}`, transferred_amount: transferAmount },
      officeId: oldCard.office_id
    });

    const finalNew = await pool.query('SELECT * FROM credit_cards WHERE id = $1', [newCard.id]);
    res.status(201).json(castCard(finalNew.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT office_id FROM credit_cards WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Card not found' });
    if (req.officeScope !== null && existing.rows[0].office_id !== req.officeScope) {
      return res.status(403).json({ error: 'Card belongs to a different office' });
    }
    if (req.user.role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot delete cards' });
    }

    await pool.query('DELETE FROM credit_cards WHERE id=$1', [req.params.id]);
    logAudit(pool, {
      userId: req.user.id, actorName: req.user.username, action: 'card.delete',
      entityType: 'card', entityId: req.params.id, officeId: existing.rows[0].office_id
    });
    res.json({ message: 'Card deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
