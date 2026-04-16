const express = require('express');
const router = express.Router();
const { sendSMS, runDailyNotificationCheck } = require('../services/notificationService');

// GET notification history
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  try {
    const notifs = db.prepare(`
      SELECT n.*, c.bank_name, c.card_number
      FROM notifications n
      JOIN credit_cards c ON n.card_id = c.id
      ORDER BY n.sent_at DESC LIMIT 50
    `).all();
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST manually trigger notification check
router.post('/trigger', (req, res) => {
  const db = req.app.locals.db;
  try {
    runDailyNotificationCheck(db);
    res.json({ message: 'Notification check triggered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send test SMS
router.post('/test-sms', async (req, res) => {
  const { phone, message } = req.body;
  try {
    const result = await sendSMS(phone, message || 'Test SMS from CC Manager');
    res.json({ success: true, sid: result?.sid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
