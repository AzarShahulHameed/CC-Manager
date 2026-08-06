-- ============================================================
-- Migration 002: Invite-based accounts + audit log
-- Run:  npm run migrate
-- ============================================================

-- ── Users can now be created without a password — they set their own
--    via an emailed invite link, instead of an admin typing one for them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMP;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_token ON users(invite_token) WHERE invite_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- ── Audit log: who did what, when. office_id is nullable — global actions
--    (e.g. an action by a global admin not tied to one office) leave it null;
--    office-scoped admins only ever see entries matching their own office.
CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name    VARCHAR(100),               -- snapshot, so the log still reads fine if the user is later deleted
  action        VARCHAR(50) NOT NULL,        -- 'user.create', 'user.delete', 'settings.update', 'card.create', ...
  entity_type   VARCHAR(30),                 -- 'user' | 'card' | 'settings' | 'office'
  entity_id     VARCHAR(50),
  details       JSONB,
  office_id     INTEGER REFERENCES offices(id),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_office ON audit_log(office_id);
