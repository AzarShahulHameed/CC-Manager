/**
 * Template for the one-time user seed script.
 *
 * Copy this file to seed.users.js (already in .gitignore — never commit
 * that copy), fill in real passwords, run it once to create your first
 * admin account, then delete or ignore it going forward.
 *
 * After the first admin exists, don't edit this file again — create every
 * other user through Settings → Users → Add User in the app instead. That
 * flow emails the person a link to set their own password; nobody should
 * be typing passwords into a script for anyone but the very first account.
 *
 * Run:  NODE_ENV=seed node seed.users.js
 */

if (process.env.NODE_ENV !== 'seed') {
  console.error('❌ Seed blocked. Use: NODE_ENV=seed node seed.users.js');
  process.exit(1);
}

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

const USERS = [
  // username, plaintext password (change before running), full_name, role, office_code (null = all offices)
  { username: 'admin', password: 'CHANGE_ME_BEFORE_RUNNING', full_name: 'Your Name', role: 'admin', office_code: null },
];

async function seed() {
  console.log('🌱 Seeding users...');
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 12);

    let officeId = null;
    if (u.office_code) {
      const off = await pool.query('SELECT id FROM offices WHERE code = $1', [u.office_code]);
      if (off.rows.length === 0) throw new Error(`Office ${u.office_code} not found — run migration 001 first`);
      officeId = off.rows[0].id;
    }

    await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, office_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO NOTHING`,
      [u.username, hash, u.full_name, u.role, officeId]
    );
    console.log(`  ✅ ${u.username} (${u.role}${u.office_code ? ', ' + u.office_code : ', all offices'})`);
  }
  console.log('✅ Done. Log in and change this password immediately.');
  process.exit(0);
}

seed().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
