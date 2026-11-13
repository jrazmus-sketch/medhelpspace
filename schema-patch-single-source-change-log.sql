-- Single source, part 2 (TEST ONLY — Karina 2026-11-13: production NOT authorized).
-- Requires schema-patch-single-source-cards.sql. Rollback: schema-patch-single-source-change-log-rollback.sql
--
-- 1. Change log: every change to a card's text (insert / update / delete) is recorded with WHO, WHEN,
--    the text before and after, WHERE it came from (editor, import, page editor, sql) and its TYPE:
--      editorial        — punctuation, accents, agreement, formatting, equivalent terminology
--      clinica          — doses, diagnostic criteria, treatment, contraindications, conduct…
--      nao_esclarecida  — not stated (the default): goes to Karina, never decided automatically
-- 2. Audio vs text, Karina's three tiers (her e-mail of 2026-11-13 21:31 UTC):
--      A editorial → the audio stays; the panel warns until someone confirms the narration is coherent
--      B clinica   → re-recording needed; the audio player is SUSPENDED for students (file kept, nothing
--                    deleted) until a new recording is registered or the change is reclassified
--      C nao_esclarecida → pending her evaluation; the audio stays until she classifies it
--    An admin can also suspend an audio by hand (e.g. the narration itself says something clinically
--    different), and lift it. A new recording clears everything recorded before it.
-- Idempotent: safe to re-run.

begin;

do $$ begin
  if to_regclass('public.flashcard_groups') is null or to_regclass('public.audiocard_recordings') is null then
    raise exception 'Aplique schema-patch-single-source-cards.sql antes deste patch.';
  end if;
end $$;

-- 1. The log ----------------------------------------------------------------------------------------
create table if not exists public.flashcard_item_changes (
  id            bigint generated always as identity primary key,
  item_id       bigint not null,            -- no FK: the history outlives a removed card
  group_id      bigint,
  position      smallint,
  op            text not null check (op in ('insert', 'update', 'delete')),
  old_text      text,
  new_text      text,
  old_answer    text,
  new_answer    text,
  change_kind   text not null default 'nao_esclarecida'
                check (change_kind in ('editorial', 'clinica', 'nao_esclarecida')),
  source        text not null default 'sql',  -- editor | page_editor | import | sql
  changed_by    uuid references auth.users(id) on delete set null,
  changed_at    timestamptz not null default now(),
  classified_by uuid references auth.users(id) on delete set null,
  classified_at timestamptz,
  reviewed_by   uuid references auth.users(id) on delete set null,  -- editorial: narration confirmed coherent
  reviewed_at   timestamptz
);
create index if not exists flashcard_item_changes_item_idx  on public.flashcard_item_changes (item_id, changed_at desc);
create index if not exists flashcard_item_changes_group_idx on public.flashcard_item_changes (group_id, changed_at desc);
alter table public.flashcard_item_changes enable row level security;   -- service role only, no policies
revoke all on public.flashcard_item_changes from anon, authenticated;

create or replace function public.flashcard_items_log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text := nullif(current_setting('app.change_kind', true), '');
  s text := coalesce(nullif(current_setting('app.change_source', true), ''), 'sql');
  a uuid := coalesce(nullif(current_setting('app.actor_id', true), '')::uuid, auth.uid());
begin
  if k is not null and k not in ('editorial', 'clinica', 'nao_esclarecida') then
    raise exception 'tipo de alteração inválido: %', k;
  end if;
  if tg_op = 'UPDATE' then
    if new.text is not distinct from old.text and new.answer is not distinct from old.answer then return null; end if;
    insert into public.flashcard_item_changes (item_id, group_id, position, op, old_text, new_text, old_answer, new_answer, change_kind, source, changed_by)
    values (new.id, new.group_id, new.position, 'update', old.text, new.text, old.answer, new.answer, coalesce(k, 'nao_esclarecida'), s, a);
  elsif tg_op = 'INSERT' then
    insert into public.flashcard_item_changes (item_id, group_id, position, op, new_text, new_answer, change_kind, source, changed_by)
    values (new.id, new.group_id, new.position, 'insert', new.text, new.answer, coalesce(k, 'nao_esclarecida'), s, a);
  else
    insert into public.flashcard_item_changes (item_id, group_id, position, op, old_text, old_answer, change_kind, source, changed_by)
    values (old.id, old.group_id, old.position, 'delete', old.text, old.answer, coalesce(k, 'nao_esclarecida'), s, a);
  end if;
  return null;
end $$;
drop trigger if exists flashcard_items_log_change on public.flashcard_items;
create trigger flashcard_items_log_change after insert or update of text, answer or delete on public.flashcard_items
  for each row execute function public.flashcard_items_log_change();

-- The editor's write path: one card field, with its type and author, in one transaction.
create or replace function public.edit_flashcard_card(p_item_id bigint, p_field text, p_value text, p_kind text,
                                                      p_actor uuid, p_source text default 'editor')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_field not in ('text', 'answer') then raise exception 'campo inválido: %', p_field; end if;
  if p_kind not in ('editorial', 'clinica', 'nao_esclarecida') then raise exception 'tipo de alteração inválido: %', p_kind; end if;
  perform set_config('app.change_kind', p_kind, true);
  perform set_config('app.change_source', coalesce(p_source, 'editor'), true);
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  if p_field = 'text' then
    update public.flashcard_items set text = p_value where id = p_item_id;
  else
    update public.flashcard_items set answer = p_value where id = p_item_id;
  end if;
  if not found then raise exception 'cartão % não encontrado', p_item_id; end if;
  perform set_config('app.change_kind', '', true);
  perform set_config('app.change_source', '', true);
  perform set_config('app.actor_id', '', true);
end $$;

-- Writes that cannot carry the author (page editor bulk save through the REST client): stamp it right after.
create or replace function public.stamp_flashcard_changes(p_item_ids bigint[], p_actor uuid, p_source text, p_since timestamptz)
returns integer language sql security definer set search_path = public as $$
  with u as (
    update public.flashcard_item_changes set changed_by = p_actor, source = p_source
     where item_id = any(p_item_ids) and changed_by is null and changed_at >= p_since and source = 'sql'
    returning 1)
  select count(*)::int from u;
$$;

-- Karina (or a content admin) classifies changes after the fact.
create or replace function public.classify_flashcard_changes(p_change_ids bigint[], p_kind text, p_actor uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_kind not in ('editorial', 'clinica', 'nao_esclarecida') then raise exception 'tipo de alteração inválido: %', p_kind; end if;
  update public.flashcard_item_changes
     set change_kind = p_kind, classified_by = p_actor, classified_at = now(),
         reviewed_by = case when p_kind = 'editorial' then reviewed_by end,
         reviewed_at = case when p_kind = 'editorial' then reviewed_at end
   where id = any(p_change_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Tier A: "I listened, the narration is still coherent" — clears the editorial warning of one AudioCard.
-- Never touches clinical or unclassified changes.
create or replace function public.confirm_audiocard_editorial(p_group_id bigint, p_actor uuid)
returns integer language sql security definer set search_path = public as $$
  with u as (
    update public.flashcard_item_changes set reviewed_by = p_actor, reviewed_at = now()
     where group_id = p_group_id and change_kind = 'editorial' and reviewed_at is null
    returning 1)
  select count(*)::int from u;
$$;

-- 2. Manual suspension of an audio (file and URL untouched) -----------------------------------------
alter table public.audiocard_recordings add column if not exists suspended_at timestamptz;
alter table public.audiocard_recordings add column if not exists suspended_by uuid references auth.users(id) on delete set null;
alter table public.audiocard_recordings add column if not exists suspended_reason text;

create or replace function public.set_audiocard_suspension(p_lesson_id bigint, p_suspend boolean, p_reason text, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  select id into rid from public.audiocard_recordings where lesson_id = p_lesson_id order by recorded_at desc, id desc limit 1;
  if rid is null then raise exception 'AudioCard % sem gravação registrada', p_lesson_id; end if;
  if p_suspend and coalesce(trim(p_reason), '') = '' then raise exception 'informe o motivo da suspensão'; end if;
  update public.audiocard_recordings
     set suspended_at = case when p_suspend then now() end,
         suspended_by = case when p_suspend then p_actor end,
         suspended_reason = case when p_suspend then p_reason end
   where id = rid;
end $$;

revoke execute on function public.edit_flashcard_card(bigint, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.stamp_flashcard_changes(bigint[], uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.classify_flashcard_changes(bigint[], text, uuid) from public, anon, authenticated;
revoke execute on function public.confirm_audiocard_editorial(bigint, uuid) from public, anon, authenticated;
revoke execute on function public.set_audiocard_suspension(bigint, boolean, text, uuid) from public, anon, authenticated;
revoke execute on function public.flashcard_items_log_change() from public, anon, authenticated;

-- 3. Status per AudioCard: same columns as before (same order), plus the tiers ------------------------
create or replace view public.audiocard_sync_status with (security_invoker = true) as
with cur as (
  select g.id as group_id, g.label, g.page_id as deck_page_id, l.id as lesson_id, l.audio_url,
         (select r.id from public.audiocard_recordings r where r.lesson_id = l.id order by r.recorded_at desc, r.id desc limit 1) as recording_id
  from public.flashcard_groups g
  left join public.lessons l on l.id = g.audiocard_lesson_id
),
diff as (   -- cards whose current text is not the text the latest recording narrates
  select c.group_id, r.recorded_at, x.position, x.item_id
  from cur c join public.audiocard_recordings r on r.id = c.recording_id
  cross join lateral (
    select f.position::int as position, f.id as item_id from public.flashcard_items f
      left join lateral (select e from jsonb_array_elements(r.recorded_cards) e where (e->>'position')::int = f.position) rc on true
     where f.group_id = c.group_id
       and (rc.e is null or public.audiocard_card_text(f.text) <> rc.e->>'text'
            or public.audiocard_card_text(f.answer) <> rc.e->>'answer')
    union all
    select (e->>'position')::int, null::bigint from jsonb_array_elements(r.recorded_cards) e
     where not exists (select 1 from public.flashcard_items f where f.group_id = c.group_id and f.position = (e->>'position')::int)
  ) x
),
judged as (  -- the most severe type among the changes logged since the recording; no log = not clarified
  select d.group_id, d.position,
         coalesce((
           select case max(case when ch.change_kind = 'clinica' then 3
                                when ch.change_kind = 'nao_esclarecida' then 2
                                when ch.reviewed_at is null then 1 else 0 end)
                    when 3 then 'clinica' when 2 then 'nao_esclarecida' when 1 then 'editorial' when 0 then 'editorial_conferida' end
             from public.flashcard_item_changes ch
            where ch.changed_at > d.recorded_at
              and ((d.item_id is not null and ch.item_id = d.item_id)
                   or (d.item_id is null and ch.group_id = d.group_id and ch.position = d.position and ch.op = 'delete'))
         ), 'nao_esclarecida') as kind
  from diff d
)
select c.group_id, c.label, c.deck_page_id, c.lesson_id, c.audio_url, c.recording_id, r.recorded_at, r.asr_checked_at,
       coalesce((select jsonb_agg(j.position order by j.position) from judged j where j.group_id = c.group_id), '[]'::jsonb)
         as changed_since_recording,
       coalesce(jsonb_array_length(r.asr_mismatches), 0) as asr_mismatch_count,
       case
         when c.lesson_id is null then 'sem_audiocard'
         when c.audio_url is null then 'sem_audio'
         when r.id is null then 'sem_gravacao_registrada'
         when r.audio_url is distinct from c.audio_url then 'audio_trocado_sem_registro'
         when exists (select 1 from judged j where j.group_id = c.group_id and j.kind = 'clinica') then 'regravacao_necessaria'
         when r.suspended_at is not null then 'audio_suspenso'
         when exists (select 1 from judged j where j.group_id = c.group_id and j.kind = 'nao_esclarecida') then 'avaliacao_pendente'
         when exists (select 1 from judged j where j.group_id = c.group_id and j.kind = 'editorial') then 'texto_alterado_apos_gravacao'
         when coalesce(jsonb_array_length(r.asr_mismatches), 0) > 0 then 'narracao_difere_do_texto'
         when exists (select 1 from judged j where j.group_id = c.group_id) then 'correcao_editorial_conferida'
         else 'em_dia'
       end as status,
       coalesce((select jsonb_agg(jsonb_build_object('position', j.position, 'kind', j.kind) order by j.position)
                   from judged j where j.group_id = c.group_id), '[]'::jsonb) as changes,
       (r.audio_url is not distinct from c.audio_url and c.audio_url is not null and
        (r.suspended_at is not null
         or exists (select 1 from judged j where j.group_id = c.group_id and j.kind = 'clinica'))) as audio_suspended,
       r.suspended_at, r.suspended_reason
from cur c left join public.audiocard_recordings r on r.id = c.recording_id;

-- 4. Differences that predate the log (e.g. edits made before this patch): one 'baseline' entry per card,
--    recorded text → current text, type 'nao_esclarecida', so Karina can classify it in the panel.
--    Only where the card has no logged change since its recording (re-run safe).
insert into public.flashcard_item_changes (item_id, group_id, position, op, old_text, new_text, old_answer, new_answer, change_kind, source)
select f.id, f.group_id, f.position, 'update', rc.e->>'text', f.text, rc.e->>'answer', f.answer, 'nao_esclarecida', 'baseline'
from public.audiocard_sync_status s
cross join lateral jsonb_array_elements(s.changes) ch
join public.flashcard_items f on f.group_id = s.group_id and f.position = (ch->>'position')::int
join public.audiocard_recordings r on r.id = s.recording_id
left join lateral (select e from jsonb_array_elements(r.recorded_cards) e where (e->>'position')::int = f.position) rc on true
where not exists (select 1 from public.flashcard_item_changes x where x.item_id = f.id and x.changed_at > r.recorded_at);

commit;
