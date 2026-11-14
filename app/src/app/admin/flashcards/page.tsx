import { createAdminClient } from "@/lib/supabase/admin";
import { AudiocardSyncPanel, type SyncRow, type SyncChange, type SyncDecision } from "./audiocard-sync-panel";
import { FlashcardsHeader } from "./flashcards-header";

export const metadata = { title: "Flashcards" };

// Statuses that need no action (the panel lists everything else). "alteracao_conferida" = every change since
// the recording got her decision "o áudio continua adequado" — it stops being a pending item (Karina 2026-11-14).
const OK_STATUSES = new Set(["em_dia", "alteracao_conferida"]);

const plain = (h: string | null) =>
  (h ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const brDateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

export default async function FlashcardsPage() {
  const admin = createAdminClient();
  const { count } = await admin
    .from("flashcard_items")
    .select("*", { count: "exact", head: true });

  // Single source (TEST): the status view only exists where the patch is applied; elsewhere the panel hides.
  const { data: status, error } = await admin
    .from("audiocard_sync_status")
    .select("group_id, label, deck_page_id, lesson_id, recorded_at, status, changed_since_recording, asr_mismatch_count, changes, audio_suspended, suspended_reason");
  let panel = null;
  if (!error && status) {
    const open = status.filter((s) => !OK_STATUSES.has(s.status as string));
    const decks = [...new Set(open.map((s) => s.deck_page_id as number))];
    const { data: pages } = decks.length ? await admin.from("pages").select("id, title").in("id", decks) : { data: [] };
    const deckTitle = new Map((pages ?? []).map((p) => [p.id as number, p.title as string]));

    // The logged changes behind each open group (since its latest recording), with author names.
    const groupIds = open.map((s) => s.group_id as number);
    const { data: logRows } = groupIds.length
      ? await admin
          .from("flashcard_item_changes")
          .select("id, group_id, position, op, old_text, new_text, old_answer, new_answer, change_kind, source, changed_by, changed_at, reviewed_by, reviewed_at, review_decision")
          .in("group_id", groupIds)
          .order("changed_at", { ascending: false })
      : { data: [] };
    // Her decisions on these AudioCards (latest first) — kept, suspended, lifted — with date and cards.
    const lessonIds = open.map((s) => s.lesson_id as number | null).filter((n): n is number => n !== null);
    const { data: decisionRows } = lessonIds.length
      ? await admin
          .from("audiocard_audio_decisions")
          .select("id, lesson_id, decision, reason, positions, decided_by, decided_at")
          .in("lesson_id", lessonIds)
          .order("decided_at", { ascending: false })
      : { data: [] };
    const authors = [...new Set([
      ...(logRows ?? []).flatMap((r) => [r.changed_by as string | null, r.reviewed_by as string | null]),
      ...(decisionRows ?? []).map((d) => d.decided_by as string | null),
    ].filter(Boolean))] as string[];
    const { data: profiles } = authors.length
      ? await admin.from("profiles").select("id, display_name, email").in("id", authors)
      : { data: [] };
    const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, (p.display_name as string) || (p.email as string) || ""]));

    const rows: SyncRow[] = open.map((s) => {
      const recordedAt = s.recorded_at ? new Date(s.recorded_at as string).getTime() : 0;
      const changed = new Set((s.changed_since_recording ?? []) as number[]);
      const changes: SyncChange[] = (logRows ?? [])
        .filter((r) => r.group_id === s.group_id && changed.has(r.position as number)
          && new Date(r.changed_at as string).getTime() > recordedAt)
        .map((r) => ({
          id: r.id as number,
          position: r.position as number,
          op: r.op as SyncChange["op"],
          question: r.old_text !== r.new_text ? { before: plain(r.old_text as string), after: plain(r.new_text as string) } : null,
          answer: r.old_answer !== r.new_answer ? { before: plain(r.old_answer as string), after: plain(r.new_answer as string) } : null,
          kind: r.change_kind as SyncChange["kind"],
          reviewed: !!r.reviewed_at,
          decision: r.reviewed_at
            ? {
                kind: (r.review_decision ?? "audio_mantido") as "audio_mantido" | "audio_suspenso",
                who: r.reviewed_by ? nameOf.get(r.reviewed_by as string) || null : null,
                when: brDateTime(r.reviewed_at as string),
              }
            : null,
          author: r.changed_by ? nameOf.get(r.changed_by as string) || null : null,
          when: brDateTime(r.changed_at as string),
          source: r.source as string,
        }));
      return {
        group_id: s.group_id as number,
        lesson_id: (s.lesson_id ?? null) as number | null,
        label: s.label as string,
        deck: deckTitle.get(s.deck_page_id as number) ?? "",
        status: s.status as string,
        changed_since_recording: [...changed],
        unlogged: [...changed].filter((p) => !changes.some((c) => c.position === p)),
        asr_mismatch_count: (s.asr_mismatch_count ?? 0) as number,
        audio_suspended: !!s.audio_suspended,
        suspended_reason: (s.suspended_reason ?? null) as string | null,
        changes,
        decisions: (decisionRows ?? [])
          .filter((d) => d.lesson_id === s.lesson_id)
          .slice(0, 5)
          .map((d) => ({
            id: d.id as number,
            decision: d.decision as SyncDecision["decision"],
            reason: (d.reason ?? null) as string | null,
            positions: (d.positions ?? []) as number[],
            who: d.decided_by ? nameOf.get(d.decided_by as string) || null : null,
            when: brDateTime(d.decided_at as string),
          })),
      };
    });
    panel = <AudiocardSyncPanel rows={rows} okCount={status.length - rows.length} total={status.length} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <FlashcardsHeader count={count ?? 0} />
      {panel}
    </div>
  );
}
