-- Rollback of schema-patch-single-source-change-log.sql (TEST ONLY).
-- Drops the change log, the tier functions and the suspension columns; restores the status view of
-- schema-patch-single-source-cards.sql exactly. Cards, AudioCards, audio and recordings are untouched.
-- NOTE: the change history recorded meanwhile is LOST — export flashcard_item_changes first if it matters.
begin;
drop view if exists public.audiocard_sync_status;
drop trigger if exists flashcard_items_log_change on public.flashcard_items;
drop function if exists public.flashcard_items_log_change();
drop function if exists public.edit_flashcard_card(bigint, text, text, text, uuid, text);
drop function if exists public.stamp_flashcard_changes(bigint[], uuid, text, timestamptz);
drop function if exists public.classify_flashcard_changes(bigint[], text, uuid);
drop function if exists public.confirm_audiocard_editorial(bigint, uuid);
drop function if exists public.set_audiocard_suspension(bigint, boolean, text, uuid);
drop table if exists public.flashcard_item_changes;
alter table public.audiocard_recordings drop column if exists suspended_at;
alter table public.audiocard_recordings drop column if exists suspended_by;
alter table public.audiocard_recordings drop column if exists suspended_reason;

-- Original status view (schema-patch-single-source-cards.sql §7)
create or replace view public.audiocard_sync_status with (security_invoker = true) as
with cur as (
  select g.id as group_id, g.label, g.page_id as deck_page_id, l.id as lesson_id, l.audio_url,
         (select r.id from public.audiocard_recordings r where r.lesson_id = l.id order by r.recorded_at desc, r.id desc limit 1) as recording_id
  from public.flashcard_groups g
  left join public.lessons l on l.id = g.audiocard_lesson_id
)
select c.group_id, c.label, c.deck_page_id, c.lesson_id, c.audio_url, c.recording_id, r.recorded_at, r.asr_checked_at,
       coalesce((
         select jsonb_agg(x.position order by x.position) from (
           select f.position from public.flashcard_items f
           left join lateral (select e from jsonb_array_elements(r.recorded_cards) e where (e->>'position')::int = f.position) rc on true
           where f.group_id = c.group_id
             and (rc.e is null or public.audiocard_card_text(f.text) <> rc.e->>'text'
                  or public.audiocard_card_text(f.answer) <> rc.e->>'answer')
           union
           select (e->>'position')::int from jsonb_array_elements(r.recorded_cards) e
           where not exists (select 1 from public.flashcard_items f where f.group_id = c.group_id and f.position = (e->>'position')::int)
         ) x), '[]'::jsonb) as changed_since_recording,
       coalesce(jsonb_array_length(r.asr_mismatches), 0) as asr_mismatch_count,
       case
         when c.lesson_id is null then 'sem_audiocard'
         when c.audio_url is null then 'sem_audio'
         when r.id is null then 'sem_gravacao_registrada'
         when r.audio_url is distinct from c.audio_url then 'audio_trocado_sem_registro'
         when exists (
           select 1 from public.flashcard_items f
           left join lateral (select e from jsonb_array_elements(r.recorded_cards) e where (e->>'position')::int = f.position) rc on true
           where f.group_id = c.group_id
             and (rc.e is null or public.audiocard_card_text(f.text) <> rc.e->>'text'
                  or public.audiocard_card_text(f.answer) <> rc.e->>'answer'))
           or jsonb_array_length(r.recorded_cards) <> (select count(*) from public.flashcard_items f where f.group_id = c.group_id)
           then 'texto_alterado_apos_gravacao'
         when coalesce(jsonb_array_length(r.asr_mismatches), 0) > 0 then 'narracao_difere_do_texto'
         else 'em_dia'
       end as status
from cur c left join public.audiocard_recordings r on r.id = c.recording_id;

commit;
