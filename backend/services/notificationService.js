const twilio = require('twilio');

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

// Send SMS via Twilio (UNCHANGED)
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

// ✅ Daily notification logic (POSTGRESQL VERSION)
async function runDailyNotificationCheck(pool) {
  const today = new Date();
  const todayDay = today.getDate();

  // Fetch all cards
  const cardsResult = await pool.query('SELECT * FROM credit_cards');
  const cards = cardsResult.rows;

  for (const card of cards) {
    if (!card.sms_phone) continue;

    const daysUntilDue =
      card.due_date >= todayDay
        ? card.due_date - todayDay
        : calcDaysUntil(today, card.due_date);

    const daysUntilBilling =
      card.billing_date >= todayDay
        ? card.billing_date - todayDay
        : calcDaysUntil(today, card.billing_date);

    const maskedCard = `****${card.card_number.slice(-4)}`;

    // 🔔 Due date reminders (7, 3, 1 days)
    if ([7, 3, 1].includes(daysUntilDue)) {
      const alreadySent = await pool.query(
        `
        SELECT id FROM notifications
        WHERE card_id = $1
          AND type = 'due_reminder'
          AND sent_at::date = CURRENT_DATE
        `,
        [card.id]
      );

      if (alreadySent.rows.length === 0) {
        const msg =
`💳 CC MANAGER ALERT

Dear ${card.holder_name},

⚠️ PAYMENT DUE REMINDER
Card: ${card.bank_name} ${maskedCard}
Outstanding: AED ${Number(card.outstanding_balance).toLocaleString()}
Due Date: ${card.due_date}th of this month
Days Remaining: ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}

Please ensure timely payment to avoid charges.`;

        try {
          await sendSMS(card.sms_phone, msg);
          await pool.query(
            `
            INSERT INTO notifications (card_id, type, message, status)
            VALUES ($1, $2, $3, 'sent')
            `,
            [card.id, 'due_reminder', msg]
          );
        } catch {
          await pool.query(
            `
            INSERT INTO notifications (card_id, type, message, status)
            VALUES ($1, $2, $3, 'failed')
            `,
            [card.id, 'due_reminder', msg]
          );
        }
      }
    }

    // 📅 Billing date reminders (3, 1 days)
    if ([3, 1].includes(daysUntilBilling)) {
      const alreadySent = await pool.query(
        `
        SELECT id FROM notifications
        WHERE card_id = $1
          AND type = 'billing_reminder'
          AND sent_at::date = CURRENT_DATE
        `,
        [card.id]
      );

      if (alreadySent.rows.length === 0) {
        const msg =
`💳 CC MANAGER ALERT

Dear ${card.holder_name},

📅 BILLING DATE REMINDER
Card: ${card.bank_name} ${maskedCard}
Current Outstanding: AED ${Number(card.outstanding_balance).toLocaleString()}
Billing Date: ${card.billing_date}th of this month
Days to Billing: ${daysUntilBilling} day${daysUntilBilling > 1 ? 's' : ''}

Your statement will be generated soon.`;

        try {
          await sendSMS(card.sms_phone, msg);
          await pool.query(
            `
            INSERT INTO notifications (card_id, type, message, status)
            VALUES ($1, $2, $3, 'sent')
            `,
            [card.id, 'billing_reminder', msg]
          );
        } catch {
          await pool.query(
            `
            INSERT INTO notifications (card_id, type, message, status)
            VALUES ($1, $2, $3, 'failed')
            `,
            [card.id, 'billing_reminder', msg]
          );
        }
      }
    }
  }

  console.log(`[NOTIFICATIONS] Check complete for ${cards.length} cards`);
}

// Utility
function calcDaysUntil(today, dayOfMonth) {
  const next = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
  return Math.round((next - today) / 86400000);
}

module.exports = { sendSMS, runDailyNotificationCheck };