"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import "@/lib/i18n";
import { classifyCardChanges, confirmAudiocardEditorial, setAudiocardSuspension } from "@/actions/audiocard-sync";
import { CARD_CHANGE_KINDS, type CardChangeKind } from "@/lib/card-change-kind";

export type SyncChange = {
  id: number;
  position: number;
  op: "insert" | "update" | "delete";
  question: { before: string; after: string } | null;
  answer: { before: string; after: string } | null;
  kind: CardChangeKind;
  reviewed: boolean;
  author: string | null;
  when: string;
  source: string;
};

export type SyncRow = {
  group_id: number;
  lesson_id: number | null;
  label: string;
  deck: string;
  status: string;
  changed_since_recording: number[];
  /** Changed cards with no logged change (differences older than the log). */
  unlogged: number[];
  asr_mismatch_count: number;
  audio_suspended: boolean;
  suspended_reason: string | null;
  changes: SyncChange[];
};

// Status → visual weight. Clinical / suspended read as alerts; pending as a warning; editorial as info.
const TONE: Record<string, string> = {
  regravacao_necessaria: "border-destructive/40 bg-destructive/5",
  audio_suspenso: "border-destructive/40 bg-destructive/5",
  avaliacao_pendente: "border-brand/40 bg-brand/5",
};

/** Single source (TEST): AudioCards whose audio may no longer match the text of their Flashcards group. */
export function AudiocardSyncPanel({ rows, okCount, total }: { rows: SyncRow[]; okCount: number; total: number }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("flashcardsAdmin.syncTitle")}</h2>
        <span className="text-sm text-muted-foreground">{t("flashcardsAdmin.okCount", { count: okCount })}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t("flashcardsAdmin.syncIntro")}</p>
      <p className="text-sm text-muted-foreground">{t("flashcardsAdmin.tierHelp")}</p>
      {rows.length === 0 ? (
        <p className="text-sm">{t("flashcardsAdmin.allOk", { count: total })}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => <GroupRow key={r.group_id} row={r} />)}
        </ul>
      )}
    </section>
  );
}

function GroupRow({ row: r }: { row: SyncRow }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try { await fn(); toast.success(t("flashcardsAdmin.saved")); router.refresh(); }
      catch (e) { toast.error(e instanceof Error ? e.message : t("flashcardsAdmin.saveError")); }
    });

  const hasEditorialPending = r.changes.some((c) => c.kind === "editorial" && !c.reviewed);
  const manuallySuspended = r.status === "audio_suspenso" || (r.audio_suspended && !!r.suspended_reason);

  return (
    <li className={`space-y-3 rounded-lg border p-3 ${TONE[r.status] ?? "border-border"}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="font-medium break-words">{r.label}</p>
          <p className="text-sm text-muted-foreground">{r.deck}</p>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-medium">{t(`flashcardsAdmin.status.${r.status}`)}</p>
          {r.changed_since_recording.length > 0 && (
            <p className="text-muted-foreground">
              {t("flashcardsAdmin.changedCards", { list: r.changed_since_recording.join(", ") })}
            </p>
          )}
          {r.asr_mismatch_count > 0 && (
            <p className="text-muted-foreground">{t("flashcardsAdmin.asrCards", { count: r.asr_mismatch_count })}</p>
          )}
          {r.suspended_reason && (
            <p className="text-muted-foreground break-words">{t("flashcardsAdmin.suspendedBecause", { reason: r.suspended_reason })}</p>
          )}
        </div>
      </div>

      {r.changes.length > 0 && (
        <ul className="space-y-2">
          {r.changes.map((c) => (
            <li key={c.id} className="space-y-1 rounded-md border border-border bg-background p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {t("flashcardsAdmin.card", { n: c.position })}
                  {c.op === "insert" && ` · ${t("flashcardsAdmin.opInsert")}`}
                  {c.op === "delete" && ` · ${t("flashcardsAdmin.opDelete")}`}
                </span>
                <label className="flex items-center gap-2 text-muted-foreground">
                  <span className="sr-only sm:not-sr-only">{t("flashcardsAdmin.classifyAs")}</span>
                  <select
                    value={c.kind}
                    disabled={pending}
                    onChange={(e) => run(() => classifyCardChanges([c.id], e.target.value))}
                    aria-label={t("flashcardsAdmin.classifyAs")}
                    className="min-h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {CARD_CHANGE_KINDS.map((k) => (
                      <option key={k} value={k}>{t(`flashcardsAdmin.kind.${k}`)}</option>
                    ))}
                  </select>
                </label>
              </div>
              {(["question", "answer"] as const).map((side) => {
                const d = c[side];
                if (!d) return null;
                return (
                  <div key={side} className="space-y-0.5 break-words">
                    <p className="text-muted-foreground">
                      {t(side === "question" ? "flashcardsAdmin.sideQ" : "flashcardsAdmin.sideA")}
                    </p>
                    {d.before && <p><span className="text-muted-foreground">{t("flashcardsAdmin.before")}: </span><del>{d.before}</del></p>}
                    {d.after && <p><span className="text-muted-foreground">{t("flashcardsAdmin.after")}: </span>{d.after}</p>}
                  </div>
                );
              })}
              <p className="text-muted-foreground">
                {t("flashcardsAdmin.by", { who: c.author || t("flashcardsAdmin.unknownAuthor"), when: c.when })}
                {c.reviewed && ` · ${t("flashcardsAdmin.kind.editorial_conferida")}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {r.unlogged.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("flashcardsAdmin.noLog")}: {r.unlogged.join(", ")}
        </p>
      )}

      {r.lesson_id !== null && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {hasEditorialPending && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmAudiocardEditorial(r.group_id))}
              className="min-h-11 rounded-md bg-brand px-3 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
            >
              {t("flashcardsAdmin.confirmEditorial")}
            </button>
          )}
          {manuallySuspended ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setAudiocardSuspension(r.lesson_id as number, false, ""))}
              className="min-h-11 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-50"
            >
              {t("flashcardsAdmin.lift")}
            </button>
          ) : r.audio_suspended ? null /* already suspended by a clinical change: re-record or reclassify */ : reasonOpen ? (
            <form
              className="flex w-full flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => { await setAudiocardSuspension(r.lesson_id as number, true, reason); setReasonOpen(false); setReason(""); });
              }}
            >
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("flashcardsAdmin.suspendReason")}
                aria-label={t("flashcardsAdmin.suspendReason")}
                required
                className="min-h-11 flex-1 rounded-md border border-border bg-background px-3 text-base sm:text-sm"
              />
              <button
                type="submit"
                disabled={pending || !reason.trim()}
                className="min-h-11 rounded-md border border-destructive/50 px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                {t("flashcardsAdmin.suspendConfirm")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => setReasonOpen(true)}
              className="min-h-11 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-50"
            >
              {t("flashcardsAdmin.suspend")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
