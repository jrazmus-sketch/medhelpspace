-- In-app member support / contact tickets + threaded messages.
-- Members open a ticket from /suporte (auth-only, NOT membership-gated, so an
-- expired member with a billing problem can still reach it). Admins triage and
-- reply in-app from /admin/suporte. Replies notify the member (bell + email).
--
-- Run with: node scripts/run-sql.js schema-patch-support-tickets.sql
-- Idempotent: safe to re-run.

-- ── support_tickets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id                 BIGSERIAL    PRIMARY KEY,
  user_id            UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Snapshots taken at submit time so the inbox survives later profile edits.
  email              TEXT         NOT NULL,
  display_name       TEXT,
  category           TEXT         NOT NULL DEFAULT 'outro'
                       CHECK (category IN ('tecnico','pagamento','acesso','conteudo','outro')),
  subject            TEXT         NOT NULL,
  status             TEXT         NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','in_progress','resolved','closed')),
  -- Optional technical-triage context captured from the member's session.
  page_url           TEXT,
  user_agent         TEXT,
  cohort_id          SMALLINT     REFERENCES cohorts(id) ON DELETE SET NULL,
  handled_by         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Denormalised thread metadata so both the admin inbox and the member's
  -- "Meus chamados" list can sort + badge without joining messages per row.
  last_message_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_message_from  TEXT         NOT NULL DEFAULT 'member'
                       CHECK (last_message_from IN ('member','admin')),
  member_unread      BOOLEAN      NOT NULL DEFAULT FALSE, -- admin replied, member hasn't opened
  admin_unread       BOOLEAN      NOT NULL DEFAULT TRUE,  -- member wrote, admin hasn't opened
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx
  ON support_tickets(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON support_tickets(status, last_message_at DESC);

-- ── support_ticket_messages ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id           BIGSERIAL    PRIMARY KEY,
  ticket_id    BIGINT       NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  -- SET NULL (not CASCADE) so an admin author's account removal doesn't erase the
  -- thread; a member's removal cascades via support_tickets.user_id above.
  author_id    UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role  TEXT         NOT NULL CHECK (author_role IN ('member','admin')),
  body         TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON support_ticket_messages(ticket_id, created_at);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- App writes go through service-role route handlers/actions with explicit
-- ownership + role checks (mirrors the member content route). These policies are
-- defense-in-depth: members may only ever read/insert their own rows; staff
-- (super/support/billing) get full access. No member UPDATE policy — ticket
-- bookkeeping (status, unread flags) is service-role only.
ALTER TABLE support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_member_insert     ON support_tickets;
DROP POLICY IF EXISTS support_tickets_member_select_own ON support_tickets;
DROP POLICY IF EXISTS support_tickets_admin_all         ON support_tickets;

CREATE POLICY support_tickets_member_insert ON support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY support_tickets_member_select_own ON support_tickets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY support_tickets_admin_all ON support_tickets
  FOR ALL
  USING      (current_user_role() IN ('super_admin','support_admin','billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin','support_admin','billing_admin'));

DROP POLICY IF EXISTS support_messages_member_insert     ON support_ticket_messages;
DROP POLICY IF EXISTS support_messages_member_select_own ON support_ticket_messages;
DROP POLICY IF EXISTS support_messages_admin_all         ON support_ticket_messages;

CREATE POLICY support_messages_member_insert ON support_ticket_messages
  FOR INSERT WITH CHECK (
    author_role = 'member'
    AND EXISTS (SELECT 1 FROM support_tickets t
                WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );

CREATE POLICY support_messages_member_select_own ON support_ticket_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM support_tickets t
            WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );

CREATE POLICY support_messages_admin_all ON support_ticket_messages
  FOR ALL
  USING      (current_user_role() IN ('super_admin','support_admin','billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin','support_admin','billing_admin'));

-- ── ROLLBACK (manual) ─────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS support_ticket_messages;
-- DROP TABLE IF EXISTS support_tickets;
