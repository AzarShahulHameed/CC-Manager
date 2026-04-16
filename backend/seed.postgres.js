/**
 * One-time PostgreSQL seed script
 * Run intentionally only:
 *   NODE_ENV=seed node seed.postgres.js
 */

if (process.env.NODE_ENV !== 'seed') {
  console.error('❌ Seed blocked. Use: NODE_ENV=seed node seed.postgres.js');
  process.exit(1);
}

const pool = require('./db');

async function seed() {
  console.log('🌱 Seeding PostgreSQL database...');

  await pool.query('BEGIN');

  try {
    // Clear existing data
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM transactions');
    await pool.query('DELETE FROM credit_cards');

    // Sample cards
    const cards = [
      ['4532015112830366', 'CEO Name', 'Emirates NBD', 150000, 42500, 1, 25, '+971501234567', '#c8a94a'],
      ['5425233430109903', 'CEO Name', 'ADCB', 100000, 18200, 5, 28, '+971501234567', '#0052A5'],
      ['3714496353984312', 'CEO Name', 'FAB', 200000, 85000, 15, 10, '+971501234567', '#1a4a2e'],
      ['6011111111111117', 'CEO Name', 'Mashreq', 75000, 5300, 20, 15, '+971501234567', '#7a1a14']
    ];

    const cardIds = [];

    for (const c of cards) {
      const result = await pool.query(
        `
        INSERT INTO credit_cards
        (card_number, holder_name, bank_name, credit_limit, outstanding_balance,
         billing_date, due_date, sms_phone, color)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
        `,
        c
      );
      cardIds.push(result.rows[0].id);
    }

    // Sample transactions
    const txns = [
      [cardIds[0], 12500, 'Business Class Flight', 'charge'],
      [cardIds[0], 20000, 'Payment - Emirates NBD', 'payment'],
      [cardIds[1], 15000, 'Apple Store', 'charge'],
      [cardIds[2], 50000, 'Office Furniture', 'charge']
    ];

    for (const t of txns) {
      await pool.query(
        `
        INSERT INTO transactions (card_id, amount, description, type)
        VALUES ($1,$2,$3,$4)
        `,
        t
      );
    }

    await pool.query('COMMIT');
    console.log('✅ PostgreSQL seed complete');

  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
  } finally {
    process.exit(0);
  }
}

seed();
