import { createAdminClient } from "@/lib/supabase/admin";
import { AudiocardSyncPanel, type SyncRow } from "./audiocard-sync-panel";
import { FlashcardsHeader } from "./flashcards-header";

export const metadata = { title: "Flashcards" };

export default async function FlashcardsPage() {
  const admin = createAdminClient();
  const { count } = await admin
    .from("flashcard_items")
    .select("*", { count: "exact", head: true });

  // Single source (TEST): the status view only exists where the patch is applied; elsewhere the panel hides.
  const { data: status, error } = await admin
    .from("audiocard_sync_status")
    .select("group_id, label, deck_page_id, status, changed_since_recording, asr_mismatch_count");
  let panel = null;
  if (!error && status) {
    const decks = [...new Set(status.map((s) => s.deck_page_id as number))];
    const { data: pages } = await admin.from("pages").select("id, title").in("id", decks);
    const deckTitle = new Map((pages ?? []).map((p) => [p.id as number, p.title as string]));
    const rows: SyncRow[] = status
      .filter((s) => s.status !== "em_dia")
      .map((s) => ({
        group_id: s.group_id as number,
        label: s.label as string,
        deck: deckTitle.get(s.deck_page_id as number) ?? "",
        status: s.status as string,
        changed_since_recording: (s.changed_since_recording ?? []) as number[],
        asr_mismatch_count: (s.asr_mismatch_count ?? 0) as number,
      }));
    panel = <AudiocardSyncPanel rows={rows} okCount={status.length - rows.length} total={status.length} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <FlashcardsHeader count={count ?? 0} />
      {panel}
    </div>
  );
}
