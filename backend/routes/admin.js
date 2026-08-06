const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const { requireAuth, requireRole, resolveOfficeScope } = require('../middleware/auth');
const { sendEmail } = require('../services/notificationService');
const { loadAndRender } = require('../services/emailTemplates');
const { logAudit } = require('../services/auditLog');

router.use(requireAuth, resolveOfficeScope);
// From here on, req.officeScope is null only for a true global admin (role
// admin AND office_id null on their account). Everyone else — including an
// admin-role user who's assigned to one office — is locked to that office
// for every route below, the same way cards/transactions already work.

// ── Offices ──
router.get('/offices', async (req, res) => {
  const result = await pool.query('SELECT * FROM offices ORDER BY id');
  res.json(result.rows);
});

// ── Users ──
router.get('/users', requireRole('admin'), async (req, res) => {
  const params = [];
  let query = `SELECT u.id, u.username, u.email, u.full_name, u.role, u.office_id, u.is_active, u.avatar_url,
      (u.password_hash IS NULL) AS pending_invite,
      o.name AS office_name
     FROM users u LEFT JOIN offices o ON u.office_id = o.id`;
  if (req.officeScope !== null) {
    params.push(req.officeScope);
    query += ` WHERE u.office_id = $${params.length}`;
  }
  query += ' ORDER BY u.id';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

router.post('/users', requireRole('admin'), async (req, res) => {
  const { username, email, full_name, role, office_id } = req.body;
  if (!username || !email || !full_name || !role) {
    return res.status(400).json({ error: 'username, email, full_name, role required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  // Office-scoped admins can only create users inside their own office, and
  // can't mint a global admin (office_id null) — only a true global admin can.
  let targetOfficeId;
  if (req.officeScope !== null) {
    if (!office_id || Number(office_id) !== req.officeScope) {
      return res.status(403).json({ error: 'You can only create users in your own office' });
    }
    targetOfficeId = req.officeScope;
  } else {
    if (role !== 'admin' && !office_id) {
      return res.status(400).json({ error: 'Non-admin users must be assigned an office' });
    }
    targetOfficeId = role === 'admin' && !office_id ? null : office_id;
  }

  try {
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const insert = await pool.query(
      `INSERT INTO users (username, email, full_name, role, office_id, invite_token, invite_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, username, email, full_name, role, office_id`,
      [username, email, full_name, role, targetOfficeId, inviteToken, inviteExpires]
    );
    const newUser = insert.rows[0];

    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${inviteToken}`;
    let emailWarning = null;
    try {
      const { subject, html, text } = await loadAndRender(pool, 'invite', { full_name, username, invite_url: inviteUrl }, targetOfficeId);
      await sendEmail(email, subject, text, html);
    } catch (emailErr) {
      console.error('[INVITE] Failed to send invite email:', emailErr.message);
      emailWarning = emailErr.message; // User is still created — admin can resend, but they should know it didn't go out.
    }

    await logAudit(pool, {
      userId: req.user.id, actorName: req.user.username, action: 'user.create',
      entityType: 'user', entityId: newUser.id,
      details: { username, email, role, office_id: targetOfficeId },
      officeId: targetOfficeId
    });

    res.status(201).json({ ...newUser, email_warning: emailWarning });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username or email already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:id', requireRole('admin'), async (req, res) => {
  const { full_name, email, role, office_id, is_active } = req.body;
  try {
    const existing = await pool.query('SELECT office_id FROM users WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (req.officeScope !== null && existing.rows[0].office_id !== req.officeScope) {
      return res.status(403).json({ error: 'That user belongs to a different office' });
    }
    // Office-scoped admins can't reassign someone out of their own office or grant global-admin access
    const newOfficeId = req.officeScope !== null ? req.officeScope : (role === 'admin' && !office_id ? null : office_id);

    const update = await pool.query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        role = COALESCE($3, role),
        office_id = $4,
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, username, email, full_name, role, office_id, is_active`,
      [full_name, email, role, newOfficeId, is_active, req.params.id]
    );

    await logAudit(pool, {
      userId: req.user.id, actorName: req.user.username, action: 'user.update',
      entityType: 'user', entityId: req.params.id,
      details: { full_name, email, role, office_id: newOfficeId, is_active },
      officeId: newOfficeId
    });

    res.json(update.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resend an invite — new token, new 7-day window, in case the first email
// bounced or the link expired before the person got to it.
router.post('/users/:id/resend-invite', requireRole('admin'), async (req, res) => {
  const existing = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  const u = existing.rows[0];
  if (req.officeScope !== null && u.office_id !== req.officeScope) {
    return res.status(403).json({ error: 'That user belongs to a different office' });
  }
  if (u.password_hash) return res.status(400).json({ error: 'This user has already set a password' });
  if (!u.email) return res.status(400).json({ error: 'This user has no email on file' });

  const inviteToken = crypto.randomBytes(32).toString('hex');
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query('UPDATE users SET invite_token = $1, invite_expires_at = $2 WHERE id = $3', [inviteToken, inviteExpires, u.id]);

  const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/accept-invite?token=${inviteToken}`;
  try {
    const { subject, html, text } = await loadAndRender(pool, 'invite', { full_name: u.full_name, username: u.username, invite_url: inviteUrl }, u.office_id);
    await sendEmail(u.email, subject, text, html);
    res.json({ message: 'Invite resent' });
  } catch (err) {
    res.status(500).json({ error: 'Could not send email: ' + err.message });
  }
});

router.post('/users/:id/reset-password', requireRole('admin'), async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const existing = await pool.query('SELECT office_id FROM users WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  if (req.officeScope !== null && existing.rows[0].office_id !== req.officeScope) {
    return res.status(403).json({ error: 'That user belongs to a different office' });
  }
  const hash = await bcrypt.hash(new_password, 12);
  await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [hash, req.params.id]
  );
  await logAudit(pool, {
    userId: req.user.id, actorName: req.user.username, action: 'user.reset_password',
    entityType: 'user', entityId: req.params.id, officeId: existing.rows[0].office_id
  });
  res.json({ message: 'Password reset' });
});

router.delete('/users/:id', requireRole('admin'), async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }
  const existing = await pool.query('SELECT office_id, username FROM users WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  if (req.officeScope !== null && existing.rows[0].office_id !== req.officeScope) {
    return res.status(403).json({ error: 'That user belongs to a different office' });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  await logAudit(pool, {
    userId: req.user.id, actorName: req.user.username, action: 'user.delete',
    entityType: 'user', entityId: req.params.id,
    details: { deleted_username: existing.rows[0].username }, officeId: existing.rows[0].office_id
  });
  res.json({ message: 'User deleted' });
});

// ── Settings ──
router.get('/settings', async (req, res) => {
  const { category } = req.query;
  // A client-supplied office_id is ignored for anyone but a global admin —
  // office-scoped users always get their own office's settings, never one they ask for.
  const effectiveOfficeId = req.officeScope !== null ? req.officeScope : req.query.office_id;

  const params = [];
  let query = 'SELECT * FROM settings WHERE 1=1';
  if (category) { params.push(category); query += ` AND category = $${params.length}`; }
  if (effectiveOfficeId) { params.push(effectiveOfficeId); query += ` AND (office_id = $${params.length} OR office_id IS NULL)`; }
  query += ' ORDER BY office_id NULLS FIRST, category, key';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

router.put('/settings/:category/:key', requireRole('admin', 'manager'), async (req, res) => {
  const { category, key } = req.params;
  const { office_id, value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value required' });

  // Same rule as everywhere else: office-scoped users can only write their own
  // office's settings, no matter what office_id they pass in the body.
  const targetOfficeId = req.officeScope !== null ? req.officeScope : (office_id || null);
  if (req.officeScope !== null && office_id && Number(office_id) !== req.officeScope) {
    return res.status(403).json({ error: 'You can only edit settings for your own office' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO settings (office_id, category, key, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (office_id, category, key)
       DO UPDATE SET value = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [targetOfficeId, category, key, JSON.stringify(value)]
    );
    await logAudit(pool, {
      userId: req.user.id, actorName: req.user.username, action: 'settings.update',
      entityType: 'settings', entityId: `${category}.${key}`,
      details: { category, key, value }, officeId: targetOfficeId
    });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Audit Log ──
router.get('/audit-log', requireRole('admin'), async (req, res) => {
  const params = [];
  let query = `SELECT a.*, o.name AS office_name FROM audit_log a LEFT JOIN offices o ON a.office_id = o.id WHERE 1=1`;
  if (req.officeScope !== null) {
    params.push(req.officeScope);
    query += ` AND a.office_id = $${params.length}`;
  }
  query += ' ORDER BY a.created_at DESC LIMIT 200';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

module.exports = router;
