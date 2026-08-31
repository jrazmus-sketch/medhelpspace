-- ClinAct — free sample cases (Karina, 2026-08-31, e-mail "Alterações").
--
-- Commercial change: instead of no free content (the 2026-08-27 decision) or a
-- time-limited trial, exactly FOUR cases — one per format, chosen editorially —
-- are permanently free for any logged-in user. Full experience, everything else
-- stays behind the subscription. This patch adds the flag; the gate lives in
-- app code (lib/clinact/access.ts posture), and the RLS read policies gain a
-- matching clause as defense-in-depth.
--
-- The flag is EDITORIAL, not authored content: the import format does not carry
-- it, so clinact_save_case preserves the current value when the document omits
-- it — a re-import must never silently un-free a case.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-free-cases.sql              # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-free-cases.sql            # local
--
-- Rollback:
--   ALTER TABLE clinact_cases DROP COLUMN IF EXISTS is_free;
--   (and re-run schema-patch-clinact.sql's policy + function definitions)

BEGIN;

ALTER TABLE clinact_cases ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

-- ── Read policies: published free cases are readable by any signed-in user ───

DROP POLICY IF EXISTS clinact_cases_read ON clinact_cases;
CREATE POLICY clinact_cases_read ON clinact_cases FOR SELECT USING (
  current_user_role() IN ('super_admin', 'content_admin')
  OR (status = 'published' AND (user_has_product_access('clinact') OR (is_free AND auth.uid() IS NOT NULL)))
);

DROP POLICY IF EXISTS clinact_steps_read ON clinact_steps;
CREATE POLICY clinact_steps_read ON clinact_steps FOR SELECT USING (
  current_user_role() IN ('super_admin', 'content_admin')
  OR EXISTS (
    SELECT 1 FROM clinact_cases c WHERE c.id = case_id AND c.status = 'published'
      AND (user_has_product_access('clinact') OR (c.is_free AND auth.uid() IS NOT NULL)))
);

DROP POLICY IF EXISTS clinact_options_read ON clinact_options;
CREATE POLICY clinact_options_read ON clinact_options FOR SELECT USING (
  current_user_role() IN ('super_admin', 'content_admin')
  OR EXISTS (
    SELECT 1 FROM clinact_steps s JOIN clinact_cases c ON c.id = s.case_id
    WHERE s.id = step_id AND c.status = 'published'
      AND (user_has_product_access('clinact') OR (c.is_free AND auth.uid() IS NOT NULL)))
);

DROP POLICY IF EXISTS clinact_clues_read ON clinact_clues;
CREATE POLICY clinact_clues_read ON clinact_clues FOR SELECT USING (
  current_user_role() IN ('super_admin', 'content_admin')
  OR EXISTS (
    SELECT 1 FROM clinact_cases c WHERE c.id = case_id AND c.status = 'published'
      AND (user_has_product_access('clinact') OR (c.is_free AND auth.uid() IS NOT NULL)))
);

-- ── clinact_case_document: carry the flag ────────────────────────────────────

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
    'revision', c.revision, 'published_at', c.published_at, 'is_free', c.is_free,
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

-- ── clinact_save_case: persist is_free, preserving it when absent ────────────
-- (Full replacement of the function from schema-patch-clinact.sql; the only
-- changes are the two is_free lines marked below.)

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
      difficulty, primary_skill, est_minutes, summary, takeaway, final_key, notes,
      is_free, created_by)                                             -- is_free
    VALUES (
      p_case->>'slug', p_case->>'format', p_case->>'title',
      NULLIF(p_case->>'specialty_id', '')::smallint, NULLIF(p_case->>'topic_id', '')::bigint,
      p_case->>'specialty_text', p_case->>'topic_text',
      COALESCE(p_case->>'difficulty', 'intermediaria'), p_case->>'primary_skill',
      NULLIF(p_case->>'est_minutes', '')::smallint,
      p_case->>'summary', p_case->>'takeaway', p_case->>'final_key', p_case->>'notes',
      COALESCE((p_case->>'is_free')::boolean, false), p_actor)         -- is_free
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
      -- Editorial flag: an import document without it must not reset it.
      is_free       = COALESCE((p_case->>'is_free')::boolean, is_free),
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

REVOKE EXECUTE ON FUNCTION clinact_save_case(jsonb, uuid)     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION clinact_case_document(bigint)      FROM anon, authenticated, public;

COMMIT;
