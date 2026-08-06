const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole, resolveOfficeScope } = require('../middleware/auth');
const { logAudit } = require('../services/auditLog');
const { DEFAULT_TEMPLATES, VARIABLES, SAMPLE_DATA, renderTemplate } = require('../services/emailTemplates');

router.use(requireAuth, resolveOfficeScope, requireRole('admin', 'manager'));

const KNOWN_KEYS = Object.keys(DEFAULT_TEMPLATES);

// GET all templates for a specific office.
router.get('/', async (req, res) => {
  const officeId = req.officeScope !== null ? req.officeScope : req.query.office_id;
  if (!officeId) return res.status(400).json({ error: 'office_id required' });

  const rows = await pool.query(
    `SELECT key, value FROM settings WHERE category = 'email_templates' AND office_id = $1`,
    [officeId]
  );

  const templates = KNOWN_KEYS.map(key => {
    const override = rows.rows.find(r => r.key === key);
    const active = override?.value || DEFAULT_TEMPLATES[key];
    return {
      key,
      subject: active.subject,
      body: active.body,
      variables: VARIABLES[key],
      is_customized: !!override
    };
  });

  res.json(templates);
});

// PUT save a custom template, scoped to one specific office — every
// customization belongs to exactly one office, no ambiguous "global" case.
router.put('/:key', async (req, res) => {
  const { key } = req.params;
  const { subject, body, office_id } = req.body;
  if (!KNOWN_KEYS.includes(key)) return res.status(400).json({ error: 'Unknown template key' });
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });

  const targetOfficeId = req.officeScope !== null ? req.officeScope : office_id;
  if (!targetOfficeId) return res.status(400).json({ error: 'office_id required' });

  try {
    const result = await pool.query(
      `INSERT INTO settings (office_id, category, key, value)
       VALUES ($1, 'email_templates', $2, $3)
       ON CONFLICT (office_id, category, key) DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [targetOfficeId, key, JSON.stringify({ subject, body })]
    );
    await logAudit(pool, {
      userId: req.user.id, actorName: req.user.username, action: 'email_template.update',
      entityType: 'email_template', entityId: key, officeId: targetOfficeId
    });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE reset a template back to the factory default for one office.
router.delete('/:key', async (req, res) => {
  const { key } = req.params;
  const targetOfficeId = req.officeScope !== null ? req.officeScope : req.query.office_id;
  if (!targetOfficeId) return res.status(400).json({ error: 'office_id required' });

  await pool.query(
    `DELETE FROM settings WHERE category = 'email_templates' AND key = $1 AND office_id = $2`,
    [key, targetOfficeId]
  );
  await logAudit(pool, {
    userId: req.user.id, actorName: req.user.username, action: 'email_template.reset',
    entityType: 'email_template', entityId: key, officeId: targetOfficeId
  });
  res.json({ message: 'Reset to default' });
});

// POST preview a draft — renders with sample data WITHOUT saving or sending.
// This is what powers the live preview pane; it never touches the DB or Resend.
router.post('/:key/preview', (req, res) => {
  const { key } = req.params;
  const { subject, body } = req.body;
  if (!KNOWN_KEYS.includes(key)) return res.status(400).json({ error: 'Unknown template key' });
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });

  try {
    const rendered = renderTemplate(key, SAMPLE_DATA[key], { subject, body });
    res.json(rendered);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
