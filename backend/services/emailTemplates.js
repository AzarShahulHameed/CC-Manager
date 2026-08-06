/**
 * Email templates, editable from the UI (Settings → Email Templates).
 * Each template's subject/html is a plain string with {{variable}} tokens —
 * the same substitution logic runs whether you're previewing a draft in the
 * browser or actually sending. The chrome (header bar, footer) stays fixed
 * in code so a bad edit can't break branding entirely; the body is what's
 * editable.
 */

const BRAND = { name: 'CC Manager', color: '#2C3348', accent: '#3B6FFF' };

const VARIABLES = {
  invite: ['full_name', 'username', 'invite_url'],
  due_reminder: ['holder_name', 'bank_name', 'masked_card', 'amount', 'currency', 'due_day', 'days_remaining'],
  billing_reminder: ['holder_name', 'bank_name', 'masked_card', 'amount', 'currency', 'billing_day', 'days_remaining'],
  test: ['actor_name', 'message']
};

const DEFAULT_TEMPLATES = {
  invite: {
    subject: 'Set up your CC Manager account',
    body: `<p style="margin:0 0 16px;font-size:15px;color:#15171D;">Hi {{full_name}},</p>
<p style="margin:0 0 24px;font-size:14px;color:#5B5F6B;line-height:1.6;">
  An account has been created for you on CC Manager (username: <strong>{{username}}</strong>).
  Set your password to activate it — nobody else has access to it, including whoever created your account.
</p>
<a href="{{invite_url}}" style="display:inline-block;background:#3B6FFF;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">Set your password</a>
<p style="margin:24px 0 0;font-size:12px;color:#9A9DA8;">This link expires in 7 days. If the button doesn't work, copy this into your browser:<br>{{invite_url}}</p>`
  },
  due_reminder: {
    subject: 'CC Manager: Payment Due Reminder',
    body: `<p style="margin:0 0 16px;font-size:15px;color:#15171D;">Dear {{holder_name}},</p>
<div style="background:#F6F7F9;border-radius:10px;padding:20px;margin-bottom:20px;">
  <div style="font-size:12px;color:#5B5F6B;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Payment Due</div>
  <div style="font-size:15px;font-weight:700;color:#15171D;margin-bottom:12px;">{{bank_name}} {{masked_card}}</div>
  <div style="display:flex;justify-content:space-between;font-size:13px;color:#5B5F6B;margin-bottom:6px;">
    <span>Outstanding</span><strong style="color:#15171D;">{{currency}} {{amount}}</strong>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:13px;color:#5B5F6B;">
    <span>Due Date</span><strong>{{due_day}}th — {{days_remaining}} day(s)</strong>
  </div>
</div>
<p style="margin:0;font-size:13px;color:#5B5F6B;">Please ensure timely payment to avoid charges.</p>`
  },
  billing_reminder: {
    subject: 'CC Manager: Billing Date Reminder',
    body: `<p style="margin:0 0 16px;font-size:15px;color:#15171D;">Dear {{holder_name}},</p>
<div style="background:#F6F7F9;border-radius:10px;padding:20px;margin-bottom:20px;">
  <div style="font-size:12px;color:#5B5F6B;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Billing Date</div>
  <div style="font-size:15px;font-weight:700;color:#15171D;margin-bottom:12px;">{{bank_name}} {{masked_card}}</div>
  <div style="display:flex;justify-content:space-between;font-size:13px;color:#5B5F6B;margin-bottom:6px;">
    <span>Current Outstanding</span><strong style="color:#15171D;">{{currency}} {{amount}}</strong>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:13px;color:#5B5F6B;">
    <span>Billing Date</span><strong>{{billing_day}}th — {{days_remaining}} day(s)</strong>
  </div>
</div>
<p style="margin:0;font-size:13px;color:#5B5F6B;">Your statement will be generated soon.</p>`
  },
  test: {
    subject: 'CC Manager Test Notification',
    body: `<p style="margin:0 0 16px;font-size:15px;color:#15171D;">This is a test notification.</p>
<div style="background:#F6F7F9;border-radius:10px;padding:16px 20px;margin-bottom:20px;font-size:13px;color:#5B5F6B;">{{message}}</div>
<p style="margin:0;font-size:12px;color:#9A9DA8;">Sent by {{actor_name}} from Settings → Notification Channels. If this arrived looking right, your email setup is working.</p>`
  }
};

// Sample data for the preview pane — fake, but realistic-looking.
const SAMPLE_DATA = {
  invite: { full_name: 'Yaser Arafath', username: 'yaser_ceo', invite_url: 'https://your-app.com/accept-invite?token=sample123' },
  due_reminder: { holder_name: 'Yaser Arafath', bank_name: 'Emirates NBD', masked_card: '****4972', amount: '42,500', currency: 'AED', due_day: '25', days_remaining: '3' },
  billing_reminder: { holder_name: 'Yaser Arafath', bank_name: 'Emirates NBD', masked_card: '****4972', amount: '42,500', currency: 'AED', billing_day: '1', days_remaining: '1' },
  test: { actor_name: 'hr_admin', message: 'This is a test email from CC Manager.' }
};

function wrapper(bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F6F7F9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E3E5EA;">
        <tr><td style="background:${BRAND.color};padding:24px 32px;">
          <span style="color:#fff;font-size:18px;font-weight:700;">${BRAND.name}</span>
        </td></tr>
        <tr><td style="padding:32px;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 32px;background:#F6F7F9;color:#9A9DA8;font-size:11px;">
          This is an automated message from ${BRAND.name}. Do not reply to this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

// Replaces {{key}} tokens. Unknown/missing keys are left as literal text
// rather than silently becoming blank — makes typos in a custom template
// obvious instead of invisible.
function substitute(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

// Strips HTML tags for a plain-text fallback (some mail clients need one).
function toPlainText(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function renderTemplate(templateKey, vars, override) {
  const tpl = override && override.subject && override.body ? override : DEFAULT_TEMPLATES[templateKey];
  if (!tpl) throw new Error(`Unknown email template: ${templateKey}`);
  const subject = substitute(tpl.subject, vars);
  const html = wrapper(substitute(tpl.body, vars));
  const text = toPlainText(substitute(tpl.body, vars));
  return { subject, html, text };
}

// Looks for a saved custom template for this office; falls back to the
// hardcoded default if none exists. Renders with the given vars either way.
async function loadAndRender(pool, templateKey, vars, officeId) {
  let override = null;
  if (officeId) {
    const officeRow = await pool.query(
      `SELECT value FROM settings WHERE category = 'email_templates' AND key = $1 AND office_id = $2`,
      [templateKey, officeId]
    );
    if (officeRow.rows.length > 0) override = officeRow.rows[0].value;
  }
  return renderTemplate(templateKey, vars, override);
}

module.exports = { DEFAULT_TEMPLATES, VARIABLES, SAMPLE_DATA, renderTemplate, loadAndRender, substitute, wrapper };
