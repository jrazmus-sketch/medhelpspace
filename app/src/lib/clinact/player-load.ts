/**
 * Builds the payload the client player needs, WITHOUT answers for decisions
 * not yet taken. Reveals for already-answered decisions are reconstructed so a
 * resumed attempt shows its feedback again (§2.4).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { buildScreens, buildReveal, emptyState, stepKey, stripAnswers, type PublicStep, type Reveal, type Screen } from "./engine";
import { type AttemptRow } from "./queries";
import { type AttemptState, type CaseDoc, type ClueDoc, type StepDoc } from "./types";

export type PublicScreen = Omit<Screen, "decision" | "after"> & {
  decision: PublicStep | null;
  /** Post-answer blocks are only shipped once answered (they may contain the answer). */
  after: StepDoc[] | null;
};

export type PlayerPayload = {
  attemptId: number;
  caseId: number;
  slug: string;
  title: string;
  format: CaseDoc["format"];
  estMinutes: number | null;
  isPreview: boolean;
  screens: PublicScreen[];
  clues: ClueDoc[];
  state: AttemptState;
  reveals: Record<string, Reveal>;
  finished: boolean;
  score: number | null;
  takeaway: string | null;
  /** Centre of the Código Decifrado map (codigo_clinico only). */
  finalKey: string | null;
  /**
   * TEMA — withheld until the case is over, like the map spoilers above. Seeing
   * "Pneumonia" before starting hands over the reasoning the case is meant to
   * train (Karina, 2026-09-02). It stays a full internal metadatum: filters,
   * Minha Evolução, the review queue and the admin all keep using it.
   */
  topic: string | null;
  /** True when the student already has a finished, canonical attempt (§2.3 UI rule). */
  hasCanonical: boolean;
};

export async function loadPlayer(doc: CaseDoc, userId: string, isPreview: boolean): Promise<PlayerPayload> {
  const admin = createAdminClient();
  // Idempotent: a partial unique index + ON CONFLICT DO NOTHING in the RPC
  // guarantee one resumable attempt per (user, case, preview) even when Next
  // prefetches or double-renders this page.
  const open = async () => {
    const { data, error } = await admin.rpc("clinact_open_attempt", {
      p_user: userId,
      p_case_id: doc.id,
      p_is_preview: isPreview,
      p_revision: doc.revision ?? 0,
    });
    if (error) throw error;
    return data as AttemptRow;
  };
  let attempt = await open();

  // A saved case REPLACES its steps, so every step gets a new id. An attempt
  // started before that edit still holds answers keyed by the OLD ids, plus the
  // revealed/estado/relogio it folded from them — resuming it shows a
  // Prontuário Vivo full of conducts from a run that no longer exists, and a
  // clock that already counted them (Karina, 2026-09-02, CEC-01). An attempt
  // with no answers yet has nothing to lose, so it still resumes.
  const liveStepIds = new Set(doc.steps.map((s) => String(s.id)));
  const answeredKeys = Object.keys((attempt.state as AttemptState | null)?.answered ?? {});
  const stale = answeredKeys.length > 0 && answeredKeys.some((k) => !liveStepIds.has(k));
  if (stale) {
    await admin
      .from("clinact_attempts")
      .update({ state: { ...(attempt.state ?? {}), abandoned: true } })
      .eq("id", attempt.id);
    attempt = await open();
  }

  const state = (Object.keys(attempt.state ?? {}).length ? attempt.state : emptyState()) as AttemptState;
  const screens = buildScreens(doc.steps);

  const reveals: Record<string, Reveal> = {};
  for (const sc of screens) {
    if (!sc.decision) continue;
    const key = stepKey(sc.decision);
    const a = state.answered[key];
    if (!a) continue;
    const chosen = a.option_id != null ? sc.decision.options.find((o) => (o.id ?? o.position) === a.option_id) ?? null : null;
    reveals[key] = buildReveal(sc, { state, answered: a, chosen, reveals: chosen?.effect?.revela ?? [] });
  }

  const publicScreens: PublicScreen[] = screens.map((sc) => {
    const answered = sc.decision ? !!state.answered[stepKey(sc.decision)] : false;
    return {
      ...sc,
      decision: sc.decision ? stripAnswers(sc.decision) : null,
      after: answered ? sc.after : null,
    };
  });

  let hasCanonical = false;
  if (!isPreview) {
    const { count } = await admin
      .from("clinact_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("case_id", doc.id!)
      .eq("is_preview", false)
      .not("finished_at", "is", null);
    hasCanonical = (count ?? 0) > 0;
  }

  // Clues before the case ends carry NO map spoilers: which clue is the
  // distrator (and why) and how they cluster is the Código Decifrado's
  // payoff, revealed by advanceAttempt when the attempt finishes.
  const finished = !!attempt.finished_at;
  const clues = finished
    ? doc.clues
    : doc.clues.map((c) => ({ ...c, cluster: null, is_red_herring: false, red_herring_reason: null }));

  return {
    attemptId: attempt.id,
    caseId: doc.id!,
    slug: doc.slug,
    title: doc.title,
    format: doc.format,
    estMinutes: doc.est_minutes ?? null,
    isPreview,
    screens: publicScreens,
    clues,
    state,
    reveals,
    finished,
    score: attempt.score,
    takeaway: doc.takeaway ?? null,
    finalKey: finished ? (doc.final_key ?? null) : null,
    topic: finished ? (doc.topic_text ?? null) : null,
    hasCanonical,
  };
}
