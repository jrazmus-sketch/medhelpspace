-- ClinAct — case engine schema (build step 1).
--
-- Companion to CLINACT-BUILD-SPEC.md (§1 access, §2 schema). Seven `clinact_`
-- tables plus the product-scoped access table from §1:
--
--   user_product_access     — access is a TIMESTAMP that only moves forward
--   clinact_cases           — the ficha: one row per case
--   clinact_steps           — ordered block stack; `content` is JSONB per kind
--   clinact_options         — alternatives / conducts of a decision step
--   clinact_clues           — pistas (Código Clínico); `media` is the JSONB shape
--   clinact_attempts        — one row per run; `state` folds the runtime
--   clinact_step_events     — one row per decision the student made
--   clinact_case_versions   — full snapshot per published revision
--
-- Four tables describe the case, two record what the student did, one preserves
-- history. `clinact_case_versions` exists so that `attempts.case_revision` always
-- points at content that still exists — a revision number alone would point at
-- content that may have been rewritten. It cannot be retrofitted.
--
-- One RPC, `clinact_save_case(jsonb, uuid)`, is the ONLY write path for case
-- content: the editor and the bulk importer both call it, so every case lands
-- through the same atomic replace (one transaction per case, never per batch).
-- It is server-only (EXECUTE revoked from anon/authenticated).
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact.sql                       # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact.sql                     # local
--   then locally: NOTIFY pgrst, 'reload schema';
--
-- Rollback (order matters — FKs):
--   DROP FUNCTION IF EXISTS clinact_save_case(jsonb, uuid);
--   DROP FUNCTION IF EXISTS user_has_product_access(text);
--   DROP TABLE IF EXISTS clinact_step_events, clinact_attempts, clinact_case_versions,
--     clinact_clues, clinact_options, clinact_steps, clinact_cases, user_product_access;

BEGIN;

-- ── §1 Product access ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_product_access (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product      text        NOT NULL CHECK (product IN ('revalida', 'clinact')),
  source       text        NOT NULL,   -- 'subscription' | 'pix_oneoff' | 'bundle' | 'grant'
  starts_at    timestamptz NOT NULL DEFAULT now(),
  -- THE authority. Invariant: only ever moves forward on a confirmed payment.
  paid_until   timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product)
);

ALTER TABLE user_product_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_product_access_select_own ON user_product_access;
CREATE POLICY user_product_access_select_own ON user_product_access
  FOR SELECT USING (user_id = auth.uid() OR current_user_role() IN ('super_admin', 'support_admin', 'billing_admin'));

-- Writes only through the service role (payment finalisers, admin grants).

CREATE OR REPLACE FUNCTION user_has_product_access(p text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p = 'revalida' THEN
      user_has_active_membership()
      OR EXISTS (
        SELECT 1 FROM user_product_access a
        WHERE a.user_id = auth.uid() AND a.product = 'revalida' AND a.paid_until > now()
      )
    WHEN p = 'clinact' THEN
      EXISTS (
        SELECT 1 FROM user_product_access a
        WHERE a.user_id = auth.uid() AND a.product = 'clinact' AND a.paid_until > now()
      )
    ELSE false
  END;
$$;

-- ── §2 Cases ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinact_cases (
  id             bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug           text         NOT NULL UNIQUE,
  format         text         NOT NULL CHECK (format IN ('codigo_clinico', 'clinica_em_cena', 'decisao_30s', 'ponto_de_virada')),
  title          text         NOT NULL,
  specialty_id   smallint     REFERENCES specialties(id) ON DELETE SET NULL,
  topic_id       bigint       REFERENCES topics(id) ON DELETE SET NULL,
  -- Free text as authored, kept even when the FK could not be resolved so the
  -- panel can show "tema não encontrado: X" and link it later.
  specialty_text text,
  topic_text     text,
  difficulty     text         NOT NULL DEFAULT 'intermediaria' CHECK (difficulty IN ('basica', 'intermediaria', 'avancada')),
  primary_skill  text         NOT NULL CHECK (primary_skill IN ('conectar', 'conduzir', 'priorizar', 'reavaliar')),
  est_minutes    smallint,
  summary        text,
  takeaway       text,
  final_key      text,
  -- Author notes (NOTA: paragraphs from the import) — never rendered to students.
  notes          text,
  status         text         NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  revision       integer      NOT NULL DEFAULT 0,
  published_at   timestamptz,
  created_by     uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinact_cases_status_idx ON clinact_cases (status, format);
CREATE INDEX IF NOT EXISTS clinact_cases_specialty_idx ON clinact_cases (specialty_id);

CREATE OR REPLACE FUNCTION clinact_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinact_cases_updated_at ON clinact_cases;
CREATE TRIGGER clinact_cases_updated_at
  BEFORE UPDATE ON clinact_cases
  FOR EACH ROW EXECUTE FUNCTION clinact_touch_updated_at();

-- ── Steps ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinact_steps (
  id         bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id    bigint   NOT NULL REFERENCES clinact_cases(id) ON DELETE CASCADE,
  position   integer  NOT NULL,
  kind       text     NOT NULL CHECK (kind IN (
               'narrativa', 'pistas', 'pergunta', 'ordenar', 'cena_conduta', 'novo_dado',
               'reavaliacao', 'confianca', 'feedback', 'seducao', 'custo_do_atraso', 'midia',
               'cronometro', 'leve_deste_caso', 'prontuario', 'codigo_decifrado')),
  enabled    boolean  NOT NULL DEFAULT true,
  scene_key  text,
  skill      text     CHECK (skill IS NULL OR skill IN ('conectar', 'conduzir', 'priorizar', 'reavaliar')),
  content    jsonb    NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (case_id, position)
);

CREATE INDEX IF NOT EXISTS clinact_steps_case_idx ON clinact_steps (case_id, position);

-- ── Options ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinact_options (
  id             bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  step_id        bigint   NOT NULL REFERENCES clinact_steps(id) ON DELETE CASCADE,
  position       integer  NOT NULL,
  label          text     NOT NULL,
  is_correct     boolean  NOT NULL DEFAULT false,
  -- Nullable on purpose (§2.2): null → falls back to is_correct (1.0 / 0.0).
  quality        text     CHECK (quality IS NULL OR quality IN ('ideal', 'aceitavel', 'inadequada', 'prejudicial')),
  feedback       text,
  seduction      text,
  -- { revela: [{cat, texto, midia?}], estado: {...}, relogio: n }
  effect         jsonb    NOT NULL DEFAULT '{}'::jsonb,
  -- NULL = fall through to the next scene (convergence is the default).
  next_scene_key text,
  UNIQUE (step_id, position)
);

-- ── Clues ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinact_clues (
  id             bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id        bigint   NOT NULL REFERENCES clinact_cases(id) ON DELETE CASCADE,
  position       integer  NOT NULL,
  label          text     NOT NULL,
  detail         text,
  media          jsonb,
  category       text,
  is_red_herring boolean  NOT NULL DEFAULT false,
  -- The reason a red herring does not close the case (shown dimmed on the map).
  red_herring_reason text,
  cluster        text,
  UNIQUE (case_id, position)
);

-- ── Versions ──────────────────────────────────────────────────────────────────
-- One row per revision that students could have seen. `snapshot` is the full
-- case document (ficha + steps + options + clues) in the same JSON shape the
-- editor and importer produce, so a historical attempt can always be replayed
-- against exactly what the student read.

CREATE TABLE IF NOT EXISTS clinact_case_versions (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id      bigint      NOT NULL REFERENCES clinact_cases(id) ON DELETE CASCADE,
  revision     integer     NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  snapshot     jsonb       NOT NULL,
  UNIQUE (case_id, revision)
);

-- ── Attempts ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinact_attempts (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id       bigint      NOT NULL REFERENCES clinact_cases(id) ON DELETE CASCADE,
  case_revision integer     NOT NULL,
  -- Admin preview runs are stored (the player is the real one) but excluded
  -- from every statistic.
  is_preview    boolean     NOT NULL DEFAULT false,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  -- Case score, 0–100. Mean of the chosen options' weights (§2.2), computed
  -- once at finish. Aggregation across cases happens over THIS column, never
  -- over step events (§2.2.1).
  score         numeric(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  duration_ms   integer,
  state         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinact_attempts_user_case_idx
  ON clinact_attempts (user_id, case_id, finished_at);
CREATE INDEX IF NOT EXISTS clinact_attempts_open_idx
  ON clinact_attempts (user_id, case_id) WHERE finished_at IS NULL;

DROP TRIGGER IF EXISTS clinact_attempts_updated_at ON clinact_attempts;
CREATE TRIGGER clinact_attempts_updated_at
  BEFORE UPDATE ON clinact_attempts
  FOR EACH ROW EXECUTE FUNCTION clinact_touch_updated_at();

-- ── Step events ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinact_step_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id  bigint      NOT NULL REFERENCES clinact_attempts(id) ON DELETE CASCADE,
  step_id     bigint      NOT NULL REFERENCES clinact_steps(id) ON DELETE CASCADE,
  option_id   bigint      REFERENCES clinact_options(id) ON DELETE SET NULL,
  skill       text        CHECK (skill IS NULL OR skill IN ('conectar', 'conduzir', 'priorizar', 'reavaliar')),
  is_correct  boolean     NOT NULL,
  -- Weight actually earned (§2.2): quality weight, or 1.0 / 0.0 from is_correct.
  weight      numeric(3,2) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 1),
  confidence  text        CHECK (confidence IS NULL OR confidence IN ('baixa', 'media', 'alta')),
  time_ms     integer,
  -- For `ordenar` steps (no option_id): the submitted order.
  payload     jsonb,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, step_id)
);

CREATE INDEX IF NOT EXISTS clinact_step_events_attempt_idx ON clinact_step_events (attempt_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Content is read by the member route through the service-role client (same
-- posture as /app/[slug]); these policies are defense-in-depth for any direct
-- PostgREST access.

ALTER TABLE clinact_cases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinact_steps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinact_options       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinact_clues         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinact_case_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinact_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinact_step_events   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinact_cases_read ON clinact_cases;
CREATE POLICY clinact_cases_read ON clinact_cases FOR SELECT USING (
  current_user_role() IN ('super_admin', 'content_admin')
  OR (status = 'published' AND user_has_product_access('clinact'))
);
DROP POLICY IF EXISTS clinact_cases_admin ON clinact_cases;
CREATE POLICY clinact_cases_admin ON clinact_cases FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

DROP POLICY IF EXISTS clinact_steps_read ON clinact_steps;
CREATE POLICY clinact_steps_read ON clinact_steps FOR SELECT USING (
  current_user_role() IN ('super_admin', 'content_admin')
  OR EXISTS (SELECT 1 FROM clinact_cases c WHERE c.id = case_id AND c.status = 'published' AND user_has_product_access('clinact'))
);
DROP POLICY IF EXISTS clinact_steps_admin ON clinact_steps;
CREATE POLICY clinact_steps_admin ON clinact_steps FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

DROP POLICY IF EXISTS clinact_options_read ON clinact_options;
CREATE POLICY clinact_options_read ON clinact_options FOR SELECT USING (
  current_user_role() IN ('super_admin', 'content_admin')
  OR EXISTS (
    SELECT 1 FROM clinact_steps s JOIN clinact_cases c ON c.id = s.case_id
    WHERE s.id = step_id AND c.status = 'published' AND user_has_product_access('clinact'))
);
DROP POLICY IF EXISTS clinact_options_admin ON clinact_options;
CREATE POLICY clinact_options_admin ON clinact_options FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

DROP POLICY IF EXISTS clinact_clues_read ON clinact_clues;
CREATE POLICY clinact_clues_read ON clinact_clues FOR SELECT USING (
  current_user_role() IN ('super_admin', 'content_admin')
  OR EXISTS (SELECT 1 FROM clinact_cases c WHERE c.id = case_id AND c.status = 'published' AND user_has_product_access('clinact'))
);
DROP POLICY IF EXISTS clinact_clues_admin ON clinact_clues;
CREATE POLICY clinact_clues_admin ON clinact_clues FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

DROP POLICY IF EXISTS clinact_versions_admin ON clinact_case_versions;
CREATE POLICY clinact_versions_admin ON clinact_case_versions FOR ALL
  USING (current_user_role() IN ('super_admin', 'content_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'content_admin'));

DROP POLICY IF EXISTS clinact_attempts_own ON clinact_attempts;
CREATE POLICY clinact_attempts_own ON clinact_attempts FOR SELECT
  USING (user_id = auth.uid() OR current_user_role() IN ('super_admin', 'content_admin', 'support_admin'));

DROP POLICY IF EXISTS clinact_step_events_own ON clinact_step_events;
CREATE POLICY clinact_step_events_own ON clinact_step_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM clinact_attempts a WHERE a.id = attempt_id
      AND (a.user_id = auth.uid() OR current_user_role() IN ('super_admin', 'content_admin', 'support_admin'))
  ));

-- Attempt/event writes go through server actions with the service role.

-- ── The one write path ────────────────────────────────────────────────────────
-- p_case shape (the same document the editor edits and the importer parses):
-- {
--   id?: number, slug, format, title, specialty_id?, topic_id?, specialty_text?,
--   topic_text?, difficulty, primary_skill, est_minutes?, summary?, takeaway?,
--   final_key?, notes?,
--   steps: [{ position, kind, enabled, scene_key?, skill?, content,
--             options: [{ position, label, is_correct, quality?, feedback?,
--                         seduction?, effect, next_scene_key? }] }],
--   clues: [{ position, label, detail?, media?, category?, is_red_herring,
--             red_herring_reason?, cluster? }]
-- }
--
-- Matches an existing case by `id` when given, else by `slug`. Steps, options
-- and clues are fully replaced. If the case is currently PUBLISHED the
-- revision is bumped and the NEW content is snapshotted into
-- clinact_case_versions in the same transaction, so every revision a student
-- can meet has a frozen copy. Draft saves never bump the revision.
--
-- Returns the case id. Runs as one transaction: any failure rolls back the
-- whole case and nothing else.

CREATE OR REPLACE FUNCTION clinact_save_case(p_case jsonb, p_actor uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id       bigint;
  v_status   text;
  v_revision integer;
  v_step     jsonb;
  v_opt      jsonb;
  v_clue     jsonb;
  v_step_id  bigint;
BEGIN
  IF p_case->>'id' IS NOT NULL THEN
    SELECT id, status, revision INTO v_id, v_status, v_revision
      FROM clinact_cases WHERE id = (p_case->>'id')::bigint FOR UPDATE;
  END IF;
  IF v_id IS NULL THEN
    SELECT id, status, revision INTO v_id, v_status, v_revision
      FROM clinact_cases WHERE slug = p_case->>'slug' FOR UPDATE;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO clinact_cases (
      slug, format, title, specialty_id, topic_id, specialty_text, topic_text,
      difficulty, primary_skill, est_minutes, summary, takeaway, final_key, notes, created_by)
    VALUES (
      p_case->>'slug', p_case->>'format', p_case->>'title',
      NULLIF(p_case->>'specialty_id', '')::smallint, NULLIF(p_case->>'topic_id', '')::bigint,
      p_case->>'specialty_text', p_case->>'topic_text',
      COALESCE(p_case->>'difficulty', 'intermediaria'), p_case->>'primary_skill',
      NULLIF(p_case->>'est_minutes', '')::smallint,
      p_case->>'summary', p_case->>'takeaway', p_case->>'final_key', p_case->>'notes', p_actor)
    RETURNING id, status, revision INTO v_id, v_status, v_revision;
  ELSE
    IF v_status = 'published' THEN
      v_revision := v_revision + 1;
    END IF;
    UPDATE clinact_cases SET
      slug          = p_case->>'slug',
      format        = p_case->>'format',
      title         = p_case->>'title',
      specialty_id  = NULLIF(p_case->>'specialty_id', '')::smallint,
      topic_id      = NULLIF(p_case->>'topic_id', '')::bigint,
      specialty_text = p_case->>'specialty_text',
      topic_text    = p_case->>'topic_text',
      difficulty    = COALESCE(p_case->>'difficulty', 'intermediaria'),
      primary_skill = p_case->>'primary_skill',
      est_minutes   = NULLIF(p_case->>'est_minutes', '')::smallint,
      summary       = p_case->>'summary',
      takeaway      = p_case->>'takeaway',
      final_key     = p_case->>'final_key',
      notes         = p_case->>'notes',
      revision      = v_revision
    WHERE id = v_id;
    DELETE FROM clinact_steps WHERE case_id = v_id;   -- cascades options
    DELETE FROM clinact_clues WHERE case_id = v_id;
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(COALESCE(p_case->'steps', '[]'::jsonb)) LOOP
    INSERT INTO clinact_steps (case_id, position, kind, enabled, scene_key, skill, content)
    VALUES (
      v_id, (v_step->>'position')::integer, v_step->>'kind',
      COALESCE((v_step->>'enabled')::boolean, true),
      NULLIF(v_step->>'scene_key', ''), NULLIF(v_step->>'skill', ''),
      COALESCE(v_step->'content', '{}'::jsonb))
    RETURNING id INTO v_step_id;

    FOR v_opt IN SELECT * FROM jsonb_array_elements(COALESCE(v_step->'options', '[]'::jsonb)) LOOP
      INSERT INTO clinact_options (step_id, position, label, is_correct, quality, feedback, seduction, effect, next_scene_key)
      VALUES (
        v_step_id, (v_opt->>'position')::integer, v_opt->>'label',
        COALESCE((v_opt->>'is_correct')::boolean, false),
        NULLIF(v_opt->>'quality', ''), v_opt->>'feedback', v_opt->>'seduction',
        COALESCE(v_opt->'effect', '{}'::jsonb), NULLIF(v_opt->>'next_scene_key', ''));
    END LOOP;
  END LOOP;

  FOR v_clue IN SELECT * FROM jsonb_array_elements(COALESCE(p_case->'clues', '[]'::jsonb)) LOOP
    INSERT INTO clinact_clues (case_id, position, label, detail, media, category, is_red_herring, red_herring_reason, cluster)
    VALUES (
      v_id, (v_clue->>'position')::integer, v_clue->>'label', v_clue->>'detail',
      CASE WHEN v_clue ? 'media' AND jsonb_typeof(v_clue->'media') = 'object' THEN v_clue->'media' ELSE NULL END,
      v_clue->>'category', COALESCE((v_clue->>'is_red_herring')::boolean, false),
      v_clue->>'red_herring_reason', NULLIF(v_clue->>'cluster', ''));
  END LOOP;

  IF v_status = 'published' THEN
    INSERT INTO clinact_case_versions (case_id, revision, published_by, snapshot)
    VALUES (v_id, v_revision, p_actor, clinact_case_document(v_id));
  END IF;

  RETURN v_id;
END;
$$;

-- Full case document, used for snapshots and for the round-trip export.
CREATE OR REPLACE FUNCTION clinact_case_document(p_case_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'format', c.format, 'title', c.title,
    'specialty_id', c.specialty_id, 'topic_id', c.topic_id,
    'specialty_text', c.specialty_text, 'topic_text', c.topic_text,
    'difficulty', c.difficulty, 'primary_skill', c.primary_skill,
    'est_minutes', c.est_minutes, 'summary', c.summary, 'takeaway', c.takeaway,
    'final_key', c.final_key, 'notes', c.notes, 'status', c.status,
    'revision', c.revision, 'published_at', c.published_at,
    'steps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'position', s.position, 'kind', s.kind, 'enabled', s.enabled,
        'scene_key', s.scene_key, 'skill', s.skill, 'content', s.content,
        'options', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', o.id, 'position', o.position, 'label', o.label, 'is_correct', o.is_correct,
            'quality', o.quality, 'feedback', o.feedback, 'seduction', o.seduction,
            'effect', o.effect, 'next_scene_key', o.next_scene_key) ORDER BY o.position)
          FROM clinact_options o WHERE o.step_id = s.id), '[]'::jsonb)
      ) ORDER BY s.position)
      FROM clinact_steps s WHERE s.case_id = c.id), '[]'::jsonb),
    'clues', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'position', k.position, 'label', k.label, 'detail', k.detail,
        'media', k.media, 'category', k.category, 'is_red_herring', k.is_red_herring,
        'red_herring_reason', k.red_herring_reason, 'cluster', k.cluster) ORDER BY k.position)
      FROM clinact_clues k WHERE k.case_id = c.id), '[]'::jsonb)
  )
  FROM clinact_cases c WHERE c.id = p_case_id;
$$;

-- Publish: bump revision, stamp, snapshot — atomically. The app runs the
-- validator BEFORE calling this; the function only does the state change.
CREATE OR REPLACE FUNCTION clinact_publish_case(p_case_id bigint, p_actor uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revision integer;
BEGIN
  UPDATE clinact_cases
     SET status = 'published',
         revision = revision + 1,
         published_at = COALESCE(published_at, now())
   WHERE id = p_case_id
   RETURNING revision INTO v_revision;
  IF v_revision IS NULL THEN
    RAISE EXCEPTION 'clinact case % not found', p_case_id;
  END IF;
  INSERT INTO clinact_case_versions (case_id, revision, published_by, snapshot)
  VALUES (p_case_id, v_revision, p_actor, clinact_case_document(p_case_id));
  RETURN v_revision;
END;
$$;

-- Server-only RPCs: the service-role client calls them; browsers never can.
REVOKE EXECUTE ON FUNCTION clinact_save_case(jsonb, uuid)      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION clinact_publish_case(bigint, uuid)  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION clinact_case_document(bigint)       FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION user_has_product_access(text)       TO authenticated;

COMMIT;
