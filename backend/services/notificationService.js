const twilio = require('twilio');
const { Resend } = require('resend');

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'CC Manager <alerts@cat-cons.com>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function sendSMS(to, message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    console.warn('[WHATSAPP] Twilio credentials not configured. Message not sent.');
    console.log(`[WHATSAPP MOCK] To: ${to} | Message: ${message}`);
    return { sid: 'MOCK_SID', status: 'mock' };
  }
  try {
    const client = twilio(TWILIO_SID, TWILIO_TOKEN);
    const msg = await client.messages.create({
      body: message,
      from: `whatsapp:${TWILIO_FROM}`,
      to: `whatsapp:${to}`
    });
    console.log(`[WHATSAPP] Sent to ${to}: ${msg.sid}`);
    return { sid: msg.sid, status: 'sent' };
  } catch (err) {
    console.error('[WHATSAPP] Error:', err.message);
    throw err;
  }
}

async function sendEmail(to, subject, text, html) {
  if (!resend) {
    console.warn('[EMAIL] RESEND_API_KEY not configured. Email not sent.');
    console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject} | Message: ${text}`);
    return { id: 'MOCK_ID', status: 'mock' };
  }
  try {
    const result = await resend.emails.send({
      from: RESEND_FROM,
      to,
      subject,
      text,
      ...(html ? { html } : {})
    });
    if (result.error) {
      // This is the part that was silently swallowed before: the Resend SDK
      // reports failures as { error } in a successful-looking response,
      // it doesn't throw. Treat it as a real failure.
      console.error('[EMAIL] Resend rejected the send:', JSON.stringify(result.error));
      throw new Error(result.error.message || 'Resend rejected the email');
    }
    console.log(`[EMAIL] Sent to ${to}: ${result.data?.id}`);
    return { id: result.data?.id, status: 'sent' };
  } catch (err) {
    console.error('[EMAIL] Error:', err.message);
    throw err;
  }
}

// Reads office notification channel toggles from settings; defaults to both enabled if unset.
async function getOfficeChannels(pool, officeId) {
  const result = await pool.query(
    `SELECT value FROM settings WHERE office_id = $1 AND category = 'notifications' AND key = 'channels'`,
    [officeId]
  );
  return result.rows[0]?.value || { whatsapp: true, email: true };
}

const { loadAndRender } = require('./emailTemplates');

async function dispatch(pool, card, type, msg, daysRemaining) {
  const channels = await getOfficeChannels(pool, card.office_id);
  const results = [];

  if (channels.whatsapp && card.sms_phone) {
    try {
      await sendSMS(card.sms_phone, msg);
      results.push({ channel: 'whatsapp', status: 'sent' });
    } catch {
      results.push({ channel: 'whatsapp', status: 'failed' });
    }
  }

  if (channels.email && card.notify_email) {
    try {
      const vars = {
        holder_name: card.holder_name, bank_name: card.bank_name, masked_card: `****${card.card_number.slice(-4)}`,
        amount: Number(card.outstanding_balance).toLocaleString(), currency: card.currency || '',
        days_remaining: daysRemaining
      };
      if (type === 'due_reminder') vars.due_day = card.due_date; else vars.billing_day = card.billing_date;

      const { subject, html, text } = await loadAndRender(pool, type, vars, card.office_id);
      await sendEmail(card.notify_email, subject, text || msg, html);
      results.push({ channel: 'email', status: 'sent' });
    } catch {
      results.push({ channel: 'email', status: 'failed' });
    }
  }

  for (const r of results) {
    await pool.query(
      `INSERT INTO notifications (card_id, type, message, status, channel)
       VALUES ($1, $2, $3, $4, $5)`,
      [card.id, type, msg, r.status, r.channel]
    );
  }

  if (results.length === 0) {
    console.warn(`[NOTIFICATIONS] Card ${card.id}: no channel configured (no phone/email on card, or both channels disabled for office ${card.office_id})`);
  }
}

async function runDailyNotificationCheck(pool) {
  const today = new Date();
  const todayDay = today.getDate();

  const cardsResult = await pool.query(`
    SELECT c.*, o.currency FROM credit_cards c LEFT JOIN offices o ON c.office_id = o.id
  `);
  const cards = cardsResult.rows;

  for (const card of cards) {
    if (!card.sms_phone && !card.notify_email) continue;

    const daysUntilDue = card.due_date >= todayDay ? card.due_date - todayDay : calcDaysUntil(today, card.due_date);
    const daysUntilBilling = card.billing_date >= todayDay ? card.billing_date - todayDay : calcDaysUntil(today, card.billing_date);
    const maskedCard = `****${card.card_number.slice(-4)}`;

    if ([7, 3, 1].includes(daysUntilDue)) {
      const already = await pool.query(
        `SELECT id FROM notifications WHERE card_id = $1 AND type = 'due_reminder' AND sent_at::date = CURRENT_DATE`,
        [card.id]
      );
      if (already.rows.length === 0) {
        const msg = `💳 CC MANAGER ALERT\n\nDear ${card.holder_name},\n\n⚠️ PAYMENT DUE REMINDER\nCard: ${card.bank_name} ${maskedCard}\nOutstanding: ${Number(card.outstanding_balance).toLocaleString()}\nDue Date: ${card.due_date}th of this month\nDays Remaining: ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}\n\nPlease ensure timely payment to avoid charges.`;
        await dispatch(pool, card, 'due_reminder', msg, daysUntilDue);
      }
    }

    if ([3, 1].includes(daysUntilBilling)) {
      const already = await pool.query(
        `SELECT id FROM notifications WHERE card_id = $1 AND type = 'billing_reminder' AND sent_at::date = CURRENT_DATE`,
        [card.id]
      );
      if (already.rows.length === 0) {
        const msg = `💳 CC MANAGER ALERT\n\nDear ${card.holder_name},\n\n📅 BILLING DATE REMINDER\nCard: ${card.bank_name} ${maskedCard}\nCurrent Outstanding: ${Number(card.outstanding_balance).toLocaleString()}\nBilling Date: ${card.billing_date}th of this month\nDays to Billing: ${daysUntilBilling} day${daysUntilBilling > 1 ? 's' : ''}\n\nYour statement will be generated soon.`;
        await dispatch(pool, card, 'billing_reminder', msg, daysUntilBilling);
      }
    }
  }

  console.log(`[NOTIFICATIONS] Check complete for ${cards.length} cards`);
}

function calcDaysUntil(today, dayOfMonth) {
  const next = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
  return Math.round((next - today) / 86400000);
}

module.exports = { sendSMS, sendEmail, runDailyNotificationCheck };
