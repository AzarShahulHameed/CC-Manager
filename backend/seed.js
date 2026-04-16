/**
 * Seed the database with sample credit cards and transactions.
 * Run: node seed.js
 */

if (process.env.NODE_ENV !== 'seed') {
  console.error('❌ Seed script blocked. To run it intentionally, use: NODE_ENV=seed node seed.js');
  process.exit(1);
}

const { initDB } = require('./db.sqlite');

const db = initDB();

console.log('🌱 Seeding database...');

// Clear existing data
db.exec('DELETE FROM notifications; DELETE FROM transactions; DELETE FROM credit_cards;');

// Sample cards
const cards = [
  {
    card_number: '4532015112830366',
    holder_name: 'CEO Name',
    bank_name: 'Emirates NBD',
    credit_limit: 150000,
    outstanding_balance: 42500,
    billing_date: 1,
    due_date: 25,
    sms_phone: '+971501234567',
    color: '#c8a94a'
  },
  {
    card_number: '5425233430109903',
    holder_name: 'CEO Name',
    bank_name: 'ADCB',
    credit_limit: 100000,
    outstanding_balance: 18200,
    billing_date: 5,
    due_date: 28,
    sms_phone: '+971501234567',
    color: '#0052A5'
  },
  {
    card_number: '3714496353984312',
    holder_name: 'CEO Name',
    bank_name: 'FAB',
    credit_limit: 200000,
    outstanding_balance: 85000,
    billing_date: 15,
    due_date: 10,
    sms_phone: '+971501234567',
    color: '#1a4a2e'
  },
  {
    card_number: '6011111111111117',
    holder_name: 'CEO Name',
    bank_name: 'Mashreq',
    credit_limit: 75000,
    outstanding_balance: 5300,
    billing_date: 20,
    due_date: 15,
    sms_phone: '+971501234567',
    color: '#7a1a14'
  }
];

const insertCard = db.prepare(`
  INSERT INTO credit_cards (card_number, holder_name, bank_name, credit_limit, outstanding_balance, billing_date, due_date, sms_phone, color)
  VALUES (@card_number, @holder_name, @bank_name, @credit_limit, @outstanding_balance, @billing_date, @due_date, @sms_phone, @color)
`);

const cardIds = [];
for (const card of cards) {
  const result = insertCard.run(card);
  cardIds.push(result.lastInsertRowid);
  console.log(`  ✓ Added ${card.bank_name} card ****${card.card_number.slice(-4)}`);
}

// Sample transactions
const transactions = [
  { card_id: cardIds[0], amount: 12500, description: 'Business Class Flight - Dubai to London', type: 'charge' },
  { card_id: cardIds[0], amount: 8200, description: 'Hotel - Four Seasons London', type: 'charge' },
  { card_id: cardIds[0], amount: 3800, description: 'Business Dinner', type: 'charge' },
  { card_id: cardIds[0], amount: 20000, description: 'Payment - Emirates NBD', type: 'payment' },
  { card_id: cardIds[1], amount: 15000, description: 'Electronics - Apple Store', type: 'charge' },
  { card_id: cardIds[1], amount: 3200, description: 'Car Service', type: 'charge' },
  { card_id: cardIds[2], amount: 50000, description: 'Office Furniture', type: 'charge' },
  { card_id: cardIds[2], amount: 35000, description: 'Conference Registration', type: 'charge' },
  { card_id: cardIds[3], amount: 2500, description: 'Restaurant - Nobu', type: 'charge' },
  { card_id: cardIds[3], amount: 2800, description: 'Spa & Wellness', type: 'charge' },
];

const insertTxn = db.prepare(`
  INSERT INTO transactions (card_id, amount, description, type, transaction_date)
  VALUES (@card_id, @amount, @description, @type, datetime('now', '-' || @daysAgo || ' days'))
`);

transactions.forEach((txn, i) => {
  insertTxn.run({ ...txn, daysAgo: i * 2 });
});

console.log(`  ✓ Added ${transactions.length} sample transactions`);
console.log('\n✅ Seed complete! Run "npm start" to start the server.');
