-- ============================================================
-- Migration 003: Card replacement (lost/reissued cards)
-- Run:  npm run migrate
-- ============================================================

ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS replaced_by_card_id INTEGER REFERENCES credit_cards(id);

CREATE INDEX IF NOT EXISTS idx_cards_archived ON credit_cards(is_archived);
