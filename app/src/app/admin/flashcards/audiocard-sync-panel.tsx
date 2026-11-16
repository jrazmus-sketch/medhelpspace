"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import "@/lib/i18n";
import { classifyCardChanges, confirmAudiocardChanges, setAudiocardSuspension } from "@/actions/audiocard-sync";
import { CARD_CHANGE_KINDS, type CardChangeKind } from "@/lib/card-change-kind";

export type SyncChange = {
  id: number;
  position: number;
  op: "insert" | "update" | "delete";
  question: { before: string; after: string } | null;
  answer: { before: string; after: string } | null;
  kind: CardChangeKind;
  reviewed: boolean;
  /** Her decision on this change (null = still pending). */
  decision: { kind: "audio_mantido" | "audio_suspenso"; who: string | null; when: string } | null;
  author: string | null;
  when: string;
  source: string;
};

export type SyncDecision = {
  id: number;
  decision: "audio_mantido" | "audio_suspenso" | "audio_liberado";
  reason: string | null;
  positions: number[];
  who: string | null;
  when: string;
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
  decisions: SyncDecision[];
};

// Status → visual weight. A clinical change and a suspended audio read as alerts; the rest as a warning.
// Nothing here ever suspends an audio by itself — only her button does (Karina 2026-11-14).
const TONE: Record<string, string> = {
  revisao_clinica_pendente: "border-destructive/50 bg-destructive/5",
  audio_suspenso: "border-destructive/40 bg-destructive/5",
  avaliacao_pendente: "border-brand/40 bg-brand/5",
  texto_alterado_apos_gravacao: "border-brand/30",
};

/** Single source (TEST): AudioCards whose audio may no longer match the text of their Flashcards group. */
export function AudiocardSyncPanel({ rows, okCount, total, retired = [] }: {
  rows: SyncRow[]; okCount: number; total: number;
  /** Groups kept on a draft page, out of the published area (not counted above). */
  retired?: string[];
}) {
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
      {retired.length > 0 && (
        <p className="break-words text-sm text-muted-foreground">
          {t("flashcardsAdmin.retired", { count: retired.length, list: retired.join("; ") })}
        </p>
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

  const pendingChanges = r.changes.filter((c) => !c.reviewed);
  const hasClinicalPending = pendingChanges.some((c) => c.kind === "clinica");
  const awaitingDecision = pendingChanges.length > 0 || r.unlogged.length > 0;

  return (
    <li className={`space-y-3 rounded-lg border p-3 ${TONE[r.status] ?? "border-border"}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="font-medium break-words">{r.label}</p>
          <p className="text-sm text-muted-foreground">{r.deck}</p>
        </div>
        <div className="text-sm sm:text-right">
          <p className={`font-medium ${r.status === "revisao_clinica_pendente" ? "text-destructive" : ""}`}>
            {t(`flashcardsAdmin.status.${r.status}`)}
          </p>
          {r.changed_since_recording.length > 0 && (
            <p className="text-muted-foreground">
              {t("flashcardsAdmin.changedCards", { list: r.changed_since_recording.join(", ") })}
            </p>
          )}
          {r.asr_mismatch_count > 0 && (
            <p className="text-muted-foreground">{t("flashcardsAdmin.asrCards", { count: r.asr_mismatch_count })}</p>
          )}
          {r.audio_suspended && r.suspended_reason && (
            <p className="text-muted-foreground break-words">{t("flashcardsAdmin.suspendedBecause", { reason: r.suspended_reason })}</p>
          )}
        </div>
      </div>

      {hasClinicalPending && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-foreground">
          {t("flashcardsAdmin.clinicalAlert")}
        </p>
      )}

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
              </p>
              {c.decision ? (
                <p className="text-muted-foreground">
                  {t(`flashcardsAdmin.decision.${c.decision.kind}`, {
                    who: c.decision.who || t("flashcardsAdmin.unknownAuthor"), when: c.decision.when,
                  })}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t("flashcardsAdmin.awaiting")}</span>
                  {r.lesson_id !== null && pendingChanges.length > 1 && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => confirmAudiocardChanges(r.lesson_id as number, [c.id]))}
                      className="min-h-11 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-50"
                    >
                      {t("flashcardsAdmin.keepThisCard")}
                    </button>
                  )}
                </div>
              )}
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
          {pendingChanges.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => confirmAudiocardChanges(r.lesson_id as number))}
              className="min-h-11 rounded-md bg-brand px-3 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
            >
              {t("flashcardsAdmin.confirmKeep")}
            </button>
          )}
          {r.audio_suspended ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setAudiocardSuspension(r.lesson_id as number, false, ""))}
              className="min-h-11 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-50"
            >
              {t("flashcardsAdmin.lift")}
            </button>
          ) : reasonOpen ? (
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
      {awaitingDecision && !r.audio_suspended && (
        <p className="text-sm text-muted-foreground">{t("flashcardsAdmin.stillPublished")}</p>
      )}

      {r.decisions.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2 text-sm">
          <p className="font-medium">{t("flashcardsAdmin.decisionsTitle")}</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {r.decisions.map((d) => (
              <li key={d.id} className="break-words">
                {t(`flashcardsAdmin.decisionLog.${d.decision}`, {
                  who: d.who || t("flashcardsAdmin.unknownAuthor"), when: d.when,
                })}
                {d.positions.length > 0 && ` · ${t("flashcardsAdmin.cardsList", { list: d.positions.join(", ") })}`}
                {d.reason && ` · ${d.reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
