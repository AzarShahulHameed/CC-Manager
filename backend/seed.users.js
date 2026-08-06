/**
 * One-time user seed script. Creates the first admin + one user per office.
 * CHANGE THESE PASSWORDS before running, and again immediately after first login.
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
  { username: 'Saraswathy',    password: 'cat@2026',   full_name: 'Saraswathy N',        role: 'admin',   office_code: 'IN'  },
  { username: 'Yaser', password: 'cat@2026',     full_name: 'Yaser Arafath',  role: 'admin', office_code: 'UAE' },
  { username: 'Arun Kumar',  password: 'cat@2026',   full_name: 'Arun Kumar Kapali', role: 'admin', office_code: 'IN' },
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
  console.log('✅ Done. Log in and change these passwords immediately.');
  process.exit(0);
}

seed().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
