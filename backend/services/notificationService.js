const twilio = require('twilio');

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

// Send SMS via Twilio
async function sendSMS(to, message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.warn('[SMS] Twilio credentials not configured. SMS not sent.');
    console.log(`[SMS MOCK] To: ${to} | Message: ${message}`);
    return { sid: 'MOCK_SID', status: 'mock' };
  }
  try {
    const client = twilio(TWILIO_SID, TWILIO_TOKEN);
   const msg = await client.messages.create({
  body: message,
  from: `whatsapp:${TWILIO_FROM}`,
  to: `whatsapp:${to}`
});
    console.log(`[SMS] Sent to ${to}: ${msg.sid}`);
    return msg;
  } catch (err) {
    console.error('[SMS] Error:', err.message);
    throw err;
  }
}

// Daily notification logic
async function runDailyNotificationCheck(db) {
  const cards = db.prepare('SELECT * FROM credit_cards').all();
  const today = new Date();
  const todayDay = today.getDate();

  for (const card of cards) {
    if (!card.sms_phone) continue;

    const daysUntilDue = card.due_date >= todayDay
      ? card.due_date - todayDay
      : calcDaysUntil(today, card.due_date);

    const daysUntilBilling = card.billing_date >= todayDay
      ? card.billing_date - todayDay
      : calcDaysUntil(today, card.billing_date);

    const maskedCard = `****${card.card_number.slice(-4)}`;

    // Due date reminders: 7 days, 3 days, 1 day before
    if ([7, 3, 1].includes(daysUntilDue)) {
      const alreadySent = db.prepare(`
        SELECT id FROM notifications 
        WHERE card_id = ? AND type = 'due_reminder' 
        AND date(sent_at) = date('now')
      `).get(card.id);

      if (!alreadySent) {
        const msg = `💳 CC MANAGER ALERT\n\nDear ${card.holder_name},\n\n⚠️ PAYMENT DUE REMINDER\nCard: ${card.bank_name} ${maskedCard}\nOutstanding: AED ${card.outstanding_balance.toLocaleString()}\nDue Date: ${card.due_date}th of this month\nDays Remaining: ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}\n\nPlease ensure timely payment to avoid charges.`;

        try {
          await sendSMS(card.sms_phone, msg);
          db.prepare('INSERT INTO notifications (card_id, type, message, status) VALUES (?, ?, ?, ?)').run(card.id, 'due_reminder', msg, 'sent');
        } catch {
          db.prepare('INSERT INTO notifications (card_id, type, message, status) VALUES (?, ?, ?, ?)').run(card.id, 'due_reminder', msg, 'failed');
        }
      }
    }

    // Billing date reminders: 3 days, 1 day before
    if ([3, 1].includes(daysUntilBilling)) {
      const alreadySent = db.prepare(`
        SELECT id FROM notifications 
        WHERE card_id = ? AND type = 'billing_reminder' 
        AND date(sent_at) = date('now')
      `).get(card.id);

      if (!alreadySent) {
        const msg = `💳 CC MANAGER ALERT\n\nDear ${card.holder_name},\n\n📅 BILLING DATE REMINDER\nCard: ${card.bank_name} ${maskedCard}\nCurrent Outstanding: AED ${card.outstanding_balance.toLocaleString()}\nBilling Date: ${card.billing_date}th of this month\nDays to Billing: ${daysUntilBilling} day${daysUntilBilling > 1 ? 's' : ''}\n\nYour statement will be generated soon.`;

        try {
          await sendSMS(card.sms_phone, msg);
          db.prepare('INSERT INTO notifications (card_id, type, message, status) VALUES (?, ?, ?, ?)').run(card.id, 'billing_reminder', msg, 'sent');
        } catch {
          db.prepare('INSERT INTO notifications (card_id, type, message, status) VALUES (?, ?, ?, ?)').run(card.id, 'billing_reminder', msg, 'failed');
        }
      }
    }
  }

  console.log(`[NOTIFICATIONS] Check complete for ${cards.length} cards`);
}

function calcDaysUntil(today, dayOfMonth) {
  const next = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
  return Math.round((next - today) / 86400000);
}

module.exports = { sendSMS, runDailyNotificationCheck };
