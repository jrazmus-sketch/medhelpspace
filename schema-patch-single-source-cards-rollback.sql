-- Rollback of schema-patch-single-source-cards.sql (TEST). Restores every AudioCard transcript from the
-- backup taken by the patch and removes the single-source structure. Card ids and histories are untouched.
begin;
drop trigger if exists lessons_guard_generated_transcript on public.lessons;
drop trigger if exists flashcard_items_refresh_ins on public.flashcard_items;
drop trigger if exists flashcard_items_refresh_upd on public.flashcard_items;
drop trigger if exists flashcard_items_refresh_del on public.flashcard_items;
drop trigger if exists flashcard_items_sync_group on public.flashcard_items;
drop trigger if exists flashcard_items_touch on public.flashcard_items;
drop trigger if exists flashcard_groups_propagate on public.flashcard_groups;
drop trigger if exists flashcard_groups_touch on public.flashcard_groups;
update public.lessons l set body_html = b.body_html, title = b.title
  from (select distinct on (id) * from public.lessons_audiocards_bk_single_source order by id, backed_up_at desc) b where b.id = l.id
   and (l.body_html, l.title) is distinct from (b.body_html, b.title);
drop view if exists public.audiocard_sync_status;
drop function if exists public.move_flashcard_group(bigint, bigint, smallint);
drop function if exists public.flashcard_items_refresh_audiocards();
drop function if exists public.refresh_audiocard_transcripts(bigint[]);
drop function if exists public.lessons_guard_generated_transcript();
drop function if exists public.flashcard_items_sync_group();
drop function if exists public.flashcard_items_touch();
drop function if exists public.flashcard_groups_propagate();
drop function if exists public.flashcard_groups_touch();
drop function if exists public.audiocard_transcript_html(bigint);
drop function if exists public.audiocard_card_text(text);
drop table if exists public.audiocard_recordings;
drop index if exists public.flashcard_items_group_position_key;
drop index if exists public.flashcard_items_group_id_idx;
alter table public.flashcard_items drop column if exists group_id;
alter table public.flashcard_items drop column if exists updated_at;
drop table if exists public.flashcard_groups;
alter table public.flashcard_items drop constraint if exists flashcard_items_page_id_group_position_position_key;
alter table public.flashcard_items add constraint flashcard_items_page_id_group_position_position_key unique (page_id, group_position, position);
-- lessons_audiocards_bk_single_source is kept on purpose (drop by hand once the rollback is confirmed).
commit;
