
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { sendSMS, runDailyNotificationCheck } = require('../services/notificationService');

// GET notification history
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT n.*, c.bank_name, c.card_number
      FROM notifications n
      JOIN credit_cards c ON n.card_id = c.id
      ORDER BY n.sent_at DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST manually trigger notification check
router.post('/trigger', async (req, res) => {
  try {
    // IMPORTANT: update notificationService to accept pool
    await runDailyNotificationCheck(pool);
    res.json({ message: 'Notification check triggered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST send test SMS
router.post('/test-sms', async (req, res) => {
  const { phone, message } = req.body;

  try {
    const result = await sendSMS(
      phone,
      message || 'Test SMS from CC Manager'
    );

    res.json({ success: true, sid: result?.sid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
