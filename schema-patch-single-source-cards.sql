-- ============================================================================
-- Single source for Flashcards × AudioCards (Karina 2026-11-13, item 3 — TEST ONLY, not for production
-- until she approves the test report).
--
-- Today every card's text lives twice: flashcard_items (Flashcards) and lessons.body_html on the
-- `<spec>-audiocards` page (the AudioCard transcript), tied only by the group label = lesson title.
-- After this patch:
--   • flashcard_groups is the group entity (deck page, position, label) and holds the DIRECT link to
--     its AudioCard lesson (audiocard_lesson_id) — no more matching by title.
--   • flashcard_items.group_id → flashcard_groups. The legacy columns (page_id, group_position,
--     group_label) stay and are kept in sync by trigger, so every existing reader keeps working.
--   • The AudioCard transcript (lessons.body_html) is GENERATED from the group's cards, in the exact
--     format the AudioCards page already renders (<h3 class="ac-card">Card N</h3><p class="ac-q">…
--     </p><p class="ac-a">…</p>). Editing a card regenerates its AudioCard; editing the transcript
--     directly is refused (edit the Flashcard instead).
--   • audiocard_recordings keeps, per audio file, the text the narration was recorded from, so the
--     admin can see "texto alterado depois da gravação", and the result of the automatic
--     transcription check (narration × text).
-- Card ids never change → flashcard_progress / flashcard_attempts / review_schedule are preserved.
--
-- Idempotent. Rollback: schema-patch-single-source-cards-rollback.sql (restores body_html from the
-- backup table this patch writes first).
-- ============================================================================

begin;

-- 0. Backup of every AudioCard transcript as it is before the switch (rollback source). Every run adds a
-- dated snapshot; the rollback restores the most recent one.
create table if not exists public.lessons_audiocards_bk_single_source (
  id bigint not null, page_id bigint, position smallint, title text, body_html text, audio_url text,
  backed_up_at timestamptz not null default now()
);
alter table public.lessons_audiocards_bk_single_source enable row level security;
insert into public.lessons_audiocards_bk_single_source (id, page_id, position, title, body_html, audio_url, backed_up_at)
  select l.id, l.page_id, l.position, l.title, l.body_html, l.audio_url, now()
  from public.lessons l join public.pages p on p.id = l.page_id
  where p.slug like '%-audiocards' and p.slug <> 'audiocards';

-- 1. Group entity -------------------------------------------------------------------------------
create table if not exists public.flashcard_groups (
  id                  bigint generated always as identity primary key,
  page_id             bigint not null references public.pages(id) on delete restrict,
  position            smallint not null,
  label               text not null,
  audiocard_lesson_id bigint unique references public.lessons(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint flashcard_groups_page_position_key unique (page_id, position) deferrable initially immediate
);
alter table public.flashcard_groups enable row level security;
drop policy if exists flashcard_groups_read on public.flashcard_groups;
create policy flashcard_groups_read on public.flashcard_groups for select to authenticated using (true);

insert into public.flashcard_groups (page_id, position, label)
select distinct f.page_id, f.group_position, f.group_label
from public.flashcard_items f
where not exists (select 1 from public.flashcard_groups g where g.page_id = f.page_id and g.position = f.group_position);

alter table public.flashcard_items add column if not exists group_id bigint references public.flashcard_groups(id) on delete restrict;
update public.flashcard_items f set group_id = g.id
from public.flashcard_groups g
where f.group_id is null and g.page_id = f.page_id and g.position = f.group_position;
alter table public.flashcard_items alter column group_id set not null;
create index if not exists flashcard_items_group_id_idx on public.flashcard_items (group_id);
-- The old uniqueness (deck, group position, card position) becomes DEFERRABLE so a group can be moved
-- inside one transaction (positions shift). Nothing uses it as an ON CONFLICT target (checked).
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'flashcard_items_page_id_group_position_position_key' and not condeferrable) then
    alter table public.flashcard_items drop constraint flashcard_items_page_id_group_position_position_key;
    alter table public.flashcard_items add constraint flashcard_items_page_id_group_position_position_key
      unique (page_id, group_position, position) deferrable initially immediate;
  end if;
end $$;
-- One card per position inside a group: a future import can never create a duplicate.
create unique index if not exists flashcard_items_group_position_key on public.flashcard_items (group_id, position);

-- When a card's text last changed. Every existing card is stamped with the switch time, so a delivery
-- dated earlier is always "older than the platform" and can never overwrite a card (importer rule).
alter table public.flashcard_items add column if not exists updated_at timestamptz;
update public.flashcard_items set updated_at = now() where updated_at is null;
alter table public.flashcard_items alter column updated_at set default now();
alter table public.flashcard_items alter column updated_at set not null;
create or replace function public.flashcard_items_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.text, new.answer) is distinct from (old.text, old.answer) then new.updated_at := now(); end if;
  return new;
end $$;
drop trigger if exists flashcard_items_touch on public.flashcard_items;
create trigger flashcard_items_touch before update on public.flashcard_items
  for each row execute function public.flashcard_items_touch();

-- Direct AudioCard link: the `<spec>-audiocards` lesson of the deck's specialty with the group's label.
-- Matched ONCE here; from now on the link is the id, never the title.
update public.flashcard_groups g set audiocard_lesson_id = l.id
from public.pages deck, public.pages acp, public.lessons l
where g.audiocard_lesson_id is null
  and deck.id = g.page_id
  and acp.slug = regexp_replace(deck.slug, '-flashcards$', '-audiocards')
  and l.page_id = acp.id and l.title = g.label;

-- 2. Text helpers + generator ----------------------------------------------------------------------
-- A card side as transcript text: inline edits wrap text in <p>…</p>; the transcript paragraph is plain.
create or replace function public.audiocard_card_text(t text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(regexp_replace(coalesce(t, ''), '</p>\s*<p>', ' ', 'g'), '</?p>', '', 'g'))
$$;

create or replace function public.audiocard_transcript_html(p_group_id bigint) returns text
language sql stable set search_path = public as $$
  select string_agg(
           format('<h3 class="ac-card">Card %s</h3><p class="ac-q">%s</p><p class="ac-a">%s</p>',
                  f.position, public.audiocard_card_text(f.text), public.audiocard_card_text(f.answer)),
           '' order by f.position)
  from public.flashcard_items f where f.group_id = p_group_id
$$;

-- Regenerate the AudioCard of the given groups (only rows whose text actually changes).
create or replace function public.refresh_audiocard_transcripts(p_group_ids bigint[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform set_config('app.audiocard_refresh', 'on', true);
  update public.lessons l
     set body_html = coalesce(public.audiocard_transcript_html(g.id), '')
    from public.flashcard_groups g
   where g.id = any(p_group_ids) and l.id = g.audiocard_lesson_id
     and l.body_html is distinct from coalesce(public.audiocard_transcript_html(g.id), '');
  get diagnostics n = row_count;
  perform set_config('app.audiocard_refresh', 'off', true);
  return n;
end $$;

-- 3. Keep the legacy columns in sync (every existing reader uses page_id / group_position / group_label).
create or replace function public.flashcard_items_sync_group() returns trigger
language plpgsql set search_path = public as $$
declare g public.flashcard_groups;
begin
  if new.group_id is null then
    -- Legacy writers (old import scripts) still send page_id + group_position + group_label.
    select * into g from public.flashcard_groups where page_id = new.page_id and position = new.group_position;
    if not found then
      insert into public.flashcard_groups (page_id, position, label)
      values (new.page_id, new.group_position, coalesce(new.group_label, 'Grupo ' || new.group_position))
      returning * into g;
    end if;
    new.group_id := g.id;
  else
    select * into g from public.flashcard_groups where id = new.group_id;
  end if;
  new.page_id := g.page_id;
  new.group_position := g.position;
  new.group_label := g.label;
  return new;
end $$;
drop trigger if exists flashcard_items_sync_group on public.flashcard_items;
create trigger flashcard_items_sync_group before insert or update of group_id, page_id, group_position, group_label
  on public.flashcard_items for each row execute function public.flashcard_items_sync_group();

create or replace function public.flashcard_groups_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists flashcard_groups_touch on public.flashcard_groups;
create trigger flashcard_groups_touch before update on public.flashcard_groups
  for each row execute function public.flashcard_groups_touch();

-- AFTER the group row changed, so flashcard_items_sync_group reads the NEW values.
create or replace function public.flashcard_groups_propagate() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.page_id, new.position, new.label) is distinct from (old.page_id, old.position, old.label) then
    update public.flashcard_items set page_id = new.page_id, group_position = new.position, group_label = new.label
     where group_id = new.id;
  end if;
  if new.label is distinct from old.label and new.audiocard_lesson_id is not null then
    update public.lessons set title = new.label where id = new.audiocard_lesson_id;
  end if;
  if new.audiocard_lesson_id is distinct from old.audiocard_lesson_id and new.audiocard_lesson_id is not null then
    perform public.refresh_audiocard_transcripts(array[new.id]);
  end if;
  return null;
end $$;
drop trigger if exists flashcard_groups_propagate on public.flashcard_groups;
create trigger flashcard_groups_propagate after update on public.flashcard_groups
  for each row execute function public.flashcard_groups_propagate();

-- 4. Any card change regenerates its AudioCard (statement level: one refresh per group per statement).
create or replace function public.flashcard_items_refresh_audiocards() returns trigger
language plpgsql set search_path = public as $$
declare ids bigint[];
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct group_id) into ids from old_rows;
  elsif tg_op = 'INSERT' then
    select array_agg(distinct group_id) into ids from new_rows;
  else
    select array_agg(distinct x) into ids from (select group_id x from new_rows union select group_id from old_rows) s;
  end if;
  if ids is not null then perform public.refresh_audiocard_transcripts(ids); end if;
  return null;
end $$;
drop trigger if exists flashcard_items_refresh_ins on public.flashcard_items;
drop trigger if exists flashcard_items_refresh_upd on public.flashcard_items;
drop trigger if exists flashcard_items_refresh_del on public.flashcard_items;
create trigger flashcard_items_refresh_ins after insert on public.flashcard_items
  referencing new table as new_rows for each statement execute function public.flashcard_items_refresh_audiocards();
create trigger flashcard_items_refresh_upd after update on public.flashcard_items
  referencing new table as new_rows old table as old_rows for each statement execute function public.flashcard_items_refresh_audiocards();
create trigger flashcard_items_refresh_del after delete on public.flashcard_items
  referencing old table as old_rows for each statement execute function public.flashcard_items_refresh_audiocards();

-- 5. The transcript of a linked AudioCard is written ONLY by the generator.
create or replace function public.lessons_guard_generated_transcript() returns trigger
language plpgsql set search_path = public as $$
declare lbl text;
begin
  if new.body_html is distinct from old.body_html
     and coalesce(current_setting('app.audiocard_refresh', true), '') <> 'on' then
    select label into lbl from public.flashcard_groups where audiocard_lesson_id = new.id;
    if found then
      raise exception 'audiocard_transcript_generated'
        using detail = format('A transcrição do AudioCard "%s" é gerada a partir do grupo de Flashcards de mesmo nome.', lbl),
              hint = 'Edite os cartões em Flashcards; a transcrição é atualizada automaticamente.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lessons_guard_generated_transcript on public.lessons;
create trigger lessons_guard_generated_transcript before update of body_html on public.lessons
  for each row execute function public.lessons_guard_generated_transcript();

-- 5b. Refuse to switch on while Flashcards and AudioCards still differ: the generator would silently make
-- the Flashcards win. Resolve the differences first (Karina decides, card by card).
do $$
declare bad text;
begin
  select string_agg(g.label, ', ' order by g.label) into bad
    from public.flashcard_groups g join public.lessons l on l.id = g.audiocard_lesson_id
   where l.body_html is distinct from coalesce(public.audiocard_transcript_html(g.id), '');
  if bad is not null and coalesce(current_setting('app.single_source_allow_divergent', true), '') <> 'on' then
    raise exception 'Flashcards e AudioCards ainda divergem em: %. Resolva antes de ativar a fonte única.', bad;
  end if;
end $$;

-- 6. What the narration was recorded from, and the automatic transcription check.
create table if not exists public.audiocard_recordings (
  id              bigint generated always as identity primary key,
  lesson_id       bigint not null references public.lessons(id) on delete cascade,
  audio_url       text not null,
  recorded_cards  jsonb not null,   -- [{"position":1,"text":"…","answer":"…"}] as narrated
  recorded_at     timestamptz not null,
  source          text not null,    -- 'baseline' (state before the switch) | 'import' | 'manual'
  asr_checked_at  timestamptz,
  asr_model       text,
  asr_mismatches  jsonb,            -- [{"position":5,"side":"answer","expected":"…","heard":"…","score":0.71}]
  created_at      timestamptz not null default now()
);
create index if not exists audiocard_recordings_lesson_idx on public.audiocard_recordings (lesson_id, recorded_at desc);
alter table public.audiocard_recordings enable row level security;

-- Baseline: one recording per AudioCard with audio = the transcript as it was before this patch
-- (the text delivered with that audio). Only when the lesson has no recording yet.
insert into public.audiocard_recordings (lesson_id, audio_url, recorded_cards, recorded_at, source)
select l.id, l.audio_url,
       (select coalesce(jsonb_agg(jsonb_build_object('position', (m.c)[1]::int, 'text', (m.c)[2], 'answer', (m.c)[3])
                                  order by (m.c)[1]::int), '[]'::jsonb)
          from regexp_matches(b.body_html,
               '<h3 class="ac-card">Card ([0-9]+)</h3><p class="ac-q">([^<]*)</p><p class="ac-a">([^<]*)</p>', 'g') as m(c)),
       coalesce(l.audio_added_at, l.updated_at, now()), 'baseline'
from public.flashcard_groups g
join public.lessons l on l.id = g.audiocard_lesson_id
join public.lessons_audiocards_bk_single_source b on b.id = l.id and b.backed_up_at = now()
where l.audio_url is not null
  and not exists (select 1 from public.audiocard_recordings r where r.lesson_id = l.id);

-- 7. Status per AudioCard, for the admin.
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

-- 8. Move a group (Flashcards + its AudioCard together, same ids) — the tool for reorganizations.
create or replace function public.move_flashcard_group(p_group_id bigint, p_target_deck bigint, p_target_position smallint)
returns void language plpgsql security definer set search_path = public as $$
declare g public.flashcard_groups; tgt_ac bigint; src_ac bigint; lpos smallint;
begin
  select * into g from public.flashcard_groups where id = p_group_id for update;
  if not found then raise exception 'group % not found', p_group_id; end if;
  set constraints flashcard_groups_page_position_key, flashcard_items_page_id_group_position_position_key deferred;
  -- close the gap in the source deck, open one in the target deck
  update public.flashcard_groups set position = position - 1 where page_id = g.page_id and position > g.position;
  update public.flashcard_groups set position = position + 1 where page_id = p_target_deck and position >= p_target_position and id <> g.id;
  update public.flashcard_groups set page_id = p_target_deck, position = p_target_position where id = g.id;
  -- the AudioCard follows to the target specialty's AudioCards page, same lesson id
  if g.audiocard_lesson_id is not null then
    select acp.id into tgt_ac from public.pages deck join public.pages acp
      on acp.slug = regexp_replace(deck.slug, '-flashcards$', '-audiocards') where deck.id = p_target_deck;
    select page_id into src_ac from public.lessons where id = g.audiocard_lesson_id;
    if tgt_ac is null then raise exception 'target deck has no AudioCards page'; end if;
    select position into lpos from public.lessons where id = g.audiocard_lesson_id;
    -- dodge the (page_id, position) unique: park both pages on distinct negative ranges
    update public.lessons set position = case when page_id = tgt_ac and tgt_ac <> src_ac then -position - 1000 else -position end
     where page_id in (src_ac, tgt_ac);
    update public.lessons set page_id = tgt_ac where id = g.audiocard_lesson_id;
    -- AudioCards follow the group order of their deck
    update public.lessons l set position = gg.position
      from public.flashcard_groups gg where gg.audiocard_lesson_id = l.id and l.page_id in (src_ac, tgt_ac);
    -- unlinked leftovers (none today) go after the linked ones, in their previous order
    update public.lessons l set position = x.rn from (
      select id, (select coalesce(max(position), 0) from public.lessons where page_id = l2.page_id and position > 0)
                 + row_number() over (partition by page_id order by position desc) as rn
        from public.lessons l2 where page_id in (src_ac, tgt_ac) and position < 0) x
     where l.id = x.id;
  end if;
  -- Revisão keeps its rows (same item ids); only the denormalised specialty follows the deck.
  update public.review_schedule r set specialty_id = (select specialty_id from public.pages where id = p_target_deck)
   where r.item_type = 'flashcard' and r.item_id in (select id from public.flashcard_items where group_id = g.id);
end $$;
revoke execute on function public.move_flashcard_group(bigint, bigint, smallint) from public, anon, authenticated;
revoke execute on function public.refresh_audiocard_transcripts(bigint[]) from public, anon, authenticated;

commit;
