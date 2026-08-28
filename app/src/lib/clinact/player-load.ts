/**
 * Builds the payload the client player needs, WITHOUT answers for decisions
 * not yet taken. Reveals for already-answered decisions are reconstructed so a
 * resumed attempt shows its feedback again (§2.4).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { buildScreens, buildReveal, emptyState, stepKey, stripAnswers, type PublicStep, type Reveal, type Screen } from "./engine";
import { getOpenAttempt, type AttemptRow } from "./queries";
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
  /** True when the student already has a finished, canonical attempt (§2.3 UI rule). */
  hasCanonical: boolean;
};

export async function loadPlayer(doc: CaseDoc, userId: string, isPreview: boolean): Promise<PlayerPayload> {
  const admin = createAdminClient();
  let attempt = await getOpenAttempt(userId, doc.id!, isPreview);
  if (!attempt) {
    const { data, error } = await admin
      .from("clinact_attempts")
      .insert({ user_id: userId, case_id: doc.id, case_revision: doc.revision ?? 0, is_preview: isPreview, state: emptyState() })
      .select("*")
      .single();
    if (error) throw error;
    attempt = data as AttemptRow;
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

  return {
    attemptId: attempt.id,
    caseId: doc.id!,
    slug: doc.slug,
    title: doc.title,
    format: doc.format,
    estMinutes: doc.est_minutes ?? null,
    isPreview,
    screens: publicScreens,
    clues: doc.clues,
    state,
    reveals,
    finished: !!attempt.finished_at,
    score: attempt.score,
    takeaway: doc.takeaway ?? null,
    hasCanonical,
  };
}
