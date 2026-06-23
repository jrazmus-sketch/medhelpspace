-- Unified spaced-repetition scheduling for the Revisão (review) feature.
-- Generalizes flashcard_progress SM-2 state to ANY reviewable item type
-- (flashcard / quiz_question / memorecard). One row per (user, item).
-- Run with: node scripts/run-sql.js schema-patch-review-schedule.sql

CREATE TABLE IF NOT EXISTS review_schedule (
  id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- polymorphic target: flashcard_items / quiz_questions / presentation_slides.
  -- No FK because item_id points at a different table per item_type.
  item_type        TEXT         NOT NULL CHECK (item_type IN ('flashcard', 'quiz_question', 'memorecard')),
  item_id          BIGINT       NOT NULL,
  -- Denormalized for weak-area / per-specialty filtering (resolved at write time).
  specialty_id     INT          REFERENCES specialties(id),
  ease_factor      NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  interval_days    INT          NOT NULL DEFAULT 1,
  repetitions      INT          NOT NULL DEFAULT 0,
  due_date         DATE         NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at TIMESTAMPTZ,
  lapses           INT          NOT NULL DEFAULT 0,   -- times forgotten → leech/remediation signal
  suspended        BOOLEAN      NOT NULL DEFAULT false, -- "já domino isto" → out of the queue
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

-- Hot path: "what's due for me today" (excludes suspended via partial index).
CREATE INDEX IF NOT EXISTS review_schedule_user_due_idx
  ON review_schedule(user_id, due_date) WHERE suspended = false;

CREATE INDEX IF NOT EXISTS review_schedule_user_type_idx
  ON review_schedule(user_id, item_type);

CREATE INDEX IF NOT EXISTS review_schedule_user_specialty_idx
  ON review_schedule(user_id, specialty_id);

ALTER TABLE review_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_schedule_own_all ON review_schedule;
DROP POLICY IF EXISTS review_schedule_admin_select ON review_schedule;

CREATE POLICY review_schedule_own_all ON review_schedule
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY review_schedule_admin_select ON review_schedule
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'support_admin')
  );

-- One-time backfill: import existing flashcard SM-2 state as item_type='flashcard'
-- so no review history is lost. Resolves specialty via
-- flashcard_items.page_id -> pages.specialty_id. Idempotent (ON CONFLICT DO NOTHING);
-- flashcard_progress is left fully intact.
INSERT INTO review_schedule
  (user_id, item_type, item_id, specialty_id, ease_factor, interval_days, repetitions, due_date, last_reviewed_at)
SELECT
  fp.user_id,
  'flashcard',
  fp.flashcard_item_id,
  p.specialty_id,
  fp.ease_factor,
  fp.interval_days,
  fp.repetitions,
  fp.due_date,
  fp.last_reviewed_at
FROM flashcard_progress fp
LEFT JOIN flashcard_items fi ON fi.id = fp.flashcard_item_id
LEFT JOIN pages p ON p.id = fi.page_id
ON CONFLICT (user_id, item_type, item_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- Rollback (manual):
--   DROP TABLE IF EXISTS review_schedule;   -- also drops its policies + indexes
-- flashcard_progress is untouched by this patch, so no restore is needed there.
