const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole, resolveOfficeScope } = require('../middleware/auth');
const { sendSMS, sendEmail, runDailyNotificationCheck } = require('../services/notificationService');
const { loadAndRender } = require('../services/emailTemplates');

router.use(requireAuth, resolveOfficeScope);

// GET notification history (office-scoped, so a delivery failure is actually visible to who owns it)
router.get('/', async (req, res) => {
  try {
    const params = [];
    let query = `
      SELECT n.*, c.bank_name, c.card_number, c.office_id
      FROM notifications n
      JOIN credit_cards c ON n.card_id = c.id
      WHERE 1=1
    `;
    if (req.officeScope !== null) {
      params.push(req.officeScope);
      query += ` AND c.office_id = $${params.length}`;
    }
    query += ' ORDER BY n.sent_at DESC LIMIT 50';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST manually trigger notification check (admin/manager only)
router.post('/trigger', requireRole('admin', 'manager'), async (req, res) => {
  try {
    await runDailyNotificationCheck(pool);
    res.json({ message: 'Notification check triggered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST send test WhatsApp/SMS
router.post('/test-sms', requireRole('admin', 'manager'), async (req, res) => {
  const { phone, message } = req.body;
  try {
    const result = await sendSMS(phone, message || 'Test message from CC Manager');
    res.json({ success: true, sid: result?.sid, mode: result?.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send test email
router.post('/test-email', requireRole('admin', 'manager'), async (req, res) => {
  const { email, message } = req.body;
  try {
    const { subject, html, text } = await loadAndRender(
      pool, 'test',
      { actor_name: req.user.username, message: message || 'This is a test email from CC Manager.' },
      req.officeScope
    );
    const result = await sendEmail(email, subject, text, html);
    res.json({ success: true, id: result?.id, mode: result?.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST retry a specific failed notification (re-sends on the same channel it originally failed on)
router.post('/:id/retry', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const notifResult = await pool.query(
      `SELECT n.*, c.bank_name, c.card_number, c.sms_phone, c.notify_email, c.office_id
       FROM notifications n JOIN credit_cards c ON n.card_id = c.id
       WHERE n.id = $1`,
      [req.params.id]
    );
    if (notifResult.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });

    const n = notifResult.rows[0];
    if (req.officeScope !== null && n.office_id !== req.officeScope) {
      return res.status(403).json({ error: 'Notification belongs to a different office' });
    }
    if (n.status !== 'failed') return res.status(400).json({ error: 'Only failed notifications can be retried' });

    let result, newStatus;
    try {
      if (n.channel === 'email') {
        if (!n.notify_email) return res.status(400).json({ error: 'Card has no alert email set' });
        result = await sendEmail(n.notify_email, `CC Manager: ${n.type === 'due_reminder' ? 'Payment Due Reminder' : 'Billing Date Reminder'}`, n.message);
      } else {
        if (!n.sms_phone) return res.status(400).json({ error: 'Card has no WhatsApp number set' });
        result = await sendSMS(n.sms_phone, n.message);
      }
      newStatus = 'sent';
    } catch (err) {
      newStatus = 'failed';
    }

    const insert = await pool.query(
      `INSERT INTO notifications (card_id, type, message, status, channel)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [n.card_id, n.type, n.message, newStatus, n.channel]
    );
    res.json(insert.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
