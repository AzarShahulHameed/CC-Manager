-- ============================================================
-- Migration 001: Multi-office scoping + real auth + settings
-- Run once against your Neon Postgres DB:
--   psql "$DATABASE_URL" -f migrations/001_init_multi_office.sql
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS).
-- ============================================================

-- ── OFFICES (replaces the cosmetic client-side country selector) ──
CREATE TABLE IF NOT EXISTS offices (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(10) UNIQUE NOT NULL,      -- 'UAE', 'IN'
  name          VARCHAR(100) NOT NULL,             -- 'UAE Office', 'India Office'
  currency      VARCHAR(3) NOT NULL,               -- 'AED', 'INR'
  locale        VARCHAR(10) NOT NULL DEFAULT 'en-US',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO offices (code, name, currency, locale)
VALUES ('UAE', 'UAE Office', 'AED', 'en-AE'),
       ('IN',  'India Office', 'INR', 'en-IN')
ON CONFLICT (code) DO NOTHING;

-- ── USERS (real auth: bcrypt hash + role + office assignment) ──
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'viewer', -- 'admin' | 'manager' | 'viewer'
  office_id     INTEGER REFERENCES offices(id),          -- NULL = access to all offices (admin)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── SETTINGS (key/value, replaces hardcoded constants in App.js) ──
CREATE TABLE IF NOT EXISTS settings (
  id            SERIAL PRIMARY KEY,
  office_id     INTEGER REFERENCES offices(id),  -- NULL = global setting
  category      VARCHAR(30) NOT NULL,              -- 'banks' | 'notifications' | 'company'
  key           VARCHAR(50) NOT NULL,
  value         JSONB NOT NULL,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(office_id, category, key)
);

-- Seed bank lists per office so they're editable, not hardcoded
INSERT INTO settings (office_id, category, key, value)
SELECT id, 'banks', 'list',
  CASE code
    WHEN 'UAE' THEN '["Emirates NBD","ADCB","FAB","Mashreq","HSBC","Standard Chartered","Citibank","RAK Bank","DIB","Emirates Islamic","Other"]'::jsonb
    WHEN 'IN'  THEN '["SBI","HDFC Bank","ICICI Bank","Axis Bank","Kotak Mahindra","IndusInd Bank","Yes Bank","HSBC India","Standard Chartered India","Citi India","Other"]'::jsonb
  END
FROM offices
ON CONFLICT (office_id, category, key) DO NOTHING;

-- Notification channel prefs per office (both on by default; toggled from Settings UI)
INSERT INTO settings (office_id, category, key, value)
SELECT id, 'notifications', 'channels', '{"whatsapp": true, "email": true}'::jsonb
FROM offices
ON CONFLICT (office_id, category, key) DO NOTHING;

-- ── Add office_id to existing tables ──
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS office_id INTEGER REFERENCES offices(id);
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS notify_email VARCHAR(255);
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channel VARCHAR(10) DEFAULT 'whatsapp'; -- 'whatsapp' | 'email'

-- Backfill: existing cards with no office assigned default to UAE so nothing disappears
UPDATE credit_cards SET office_id = (SELECT id FROM offices WHERE code = 'UAE') WHERE office_id IS NULL;
ALTER TABLE credit_cards ALTER COLUMN office_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cards_office ON credit_cards(office_id);
CREATE INDEX IF NOT EXISTS idx_users_office ON users(office_id);
