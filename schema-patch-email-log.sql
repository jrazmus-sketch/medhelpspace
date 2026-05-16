-- Email log: prevents duplicate transactional emails when the
-- lifecycle notifications script runs multiple times per day.
-- Run with: node scripts/run-sql.js schema-patch-email-log.sql

CREATE TABLE IF NOT EXISTS email_log (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT         NOT NULL,    -- '60d-unlock', 'expiry-warning-7d', 'expiry-notice'
  context_id  TEXT,                     -- e.g., cohort_id, for idempotency keying
  sent_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, context_id)
);

CREATE INDEX IF NOT EXISTS email_log_user_kind_idx ON email_log(user_id, kind);
