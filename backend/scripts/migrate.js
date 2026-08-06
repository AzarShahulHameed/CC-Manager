/**
 * Runs all .sql files in /migrations that haven't been applied yet, in
 * filename order (001_, 002_, ...). Tracks what's been applied in a
 * schema_migrations table so re-running this is always safe.
 *
 * Usage:  node scripts/migrate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set.');
    process.exit(1);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(
    (await pool.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename)
  );

  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  const pending = files.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log('✅ No pending migrations. Database is up to date.');
    process.exit(0);
  }

  for (const file of pending) {
    console.log(`▶ Running ${file}...`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`✅ ${file} applied`);
    } catch (err) {
      console.error(`❌ ${file} failed:`, err.message);
      console.error('Migration stopped. Fix the error above and re-run — already-applied migrations will be skipped.');
      process.exit(1);
    }
  }

  console.log(`✅ ${pending.length} migration(s) applied.`);
  process.exit(0);
}

migrate();
