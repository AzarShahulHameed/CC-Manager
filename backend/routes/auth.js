const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const result = await pool.query(
      `SELECT u.*, o.code AS office_code, o.name AS office_name
       FROM users u LEFT JOIN offices o ON u.office_id = o.id
       WHERE u.username = $1 AND u.is_active = true`,
      [username]
    );

    // Same error for "no such user" and "wrong password" — don't leak which one failed
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account hasn\'t been activated yet — check your email for the setup link, or ask an admin to resend it.' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, office_id: user.office_id },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        office_id: user.office_id,
        office_code: user.office_code,
        office_name: user.office_name,
        avatar_url: user.avatar_url
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — validates a stored token on app load
// POST /api/auth/accept-invite — public, no token yet: this is how a new user
// sets their own password for the first time instead of an admin choosing it.
router.post('/accept-invite', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const result = await pool.query(
      `SELECT id, username, invite_expires_at FROM users WHERE invite_token = $1`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already-used invite link' });
    }
    const user = result.rows[0];
    if (new Date(user.invite_expires_at) < new Date()) {
      return res.status(400).json({ error: 'This invite link has expired — ask an admin to resend it' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `UPDATE users SET password_hash = $1, invite_token = NULL, invite_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [hash, user.id]
    );
    res.json({ message: 'Password set — you can log in now', username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/invite/:token — lets the frontend show "Hi, <name>" on the
// set-password page before they've authenticated, and confirms the link is
// still valid before they even type a password.
router.get('/invite/:token', async (req, res) => {
  const result = await pool.query(
    `SELECT full_name, username, invite_expires_at FROM users WHERE invite_token = $1`,
    [req.params.token]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Invalid or already-used invite link' });
  const u = result.rows[0];
  if (new Date(u.invite_expires_at) < new Date()) {
    return res.status(400).json({ error: 'This invite link has expired' });
  }
  res.json({ full_name: u.full_name, username: u.username });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// PATCH /api/auth/me — update your own display name and/or username
router.patch('/me', requireAuth, async (req, res) => {
  const { full_name, username, avatar_url } = req.body;
  if (!full_name && !username && avatar_url === undefined) {
    return res.status(400).json({ error: 'Provide full_name, username, and/or avatar_url to update' });
  }
  if (username && !/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-50 characters (letters, numbers, _ . - only)' });
  }
  if (avatar_url && avatar_url.length > 2_000_000) {
    return res.status(400).json({ error: 'Photo is too large — try a smaller image' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        username = COALESCE($2, username),
        avatar_url = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE avatar_url END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, username, full_name, role, office_id, avatar_url`,
      [full_name || null, username || null, avatar_url !== undefined ? avatar_url : null, req.user.id]
    );
    const updated = result.rows[0];

    // office_name isn't in this table — pull it so the response matches what /login returns
    const office = updated.office_id
      ? await pool.query('SELECT code, name FROM offices WHERE id = $1', [updated.office_id])
      : null;

    res.json({
      user: {
        ...updated,
        office_code: office?.rows[0]?.code || null,
        office_name: office?.rows[0]?.name || null
      }
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, req.user.id]
    );
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
