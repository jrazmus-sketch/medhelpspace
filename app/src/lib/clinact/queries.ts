/**
 * Server-only reads for ClinAct. Uses the service-role client (same posture as
 * the member content route — gating happens in app code via
 * `requireProductAccess`, never by leaning on RLS from the browser).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { CaseDocSchema } from "./schemas";
import { collectMedia } from "./media";
import { type CaseDoc, type CaseListRow } from "./types";

export async function listCases(): Promise<CaseListRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clinact_cases")
    .select("id, slug, format, title, specialty_id, topic_id, specialty_text, topic_text, difficulty, est_minutes, summary, status, revision, published_at, is_free, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CaseListRow[];
}

export async function listPublishedCases(): Promise<CaseListRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clinact_cases")
    .select("id, slug, format, title, specialty_id, topic_id, specialty_text, topic_text, difficulty, est_minutes, summary, status, revision, published_at, is_free, updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CaseListRow[];
}

/** The full document (ficha + steps + options + clues) via the DB function. */
export async function getCaseDoc(caseId: number): Promise<CaseDoc | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("clinact_case_document", { p_case_id: caseId });
  if (error) throw error;
  if (!data) return null;
  // The DB function returns the validated shape plus status/revision/published_at.
  const parsed = CaseDocSchema.safeParse(data);
  if (!parsed.success) {
    console.error("clinact_case_document shape mismatch", parsed.error.issues.slice(0, 3));
  }
  return data as CaseDoc;
}

export async function getCaseDocBySlug(slug: string): Promise<CaseDoc | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("clinact_cases").select("id").eq("slug", slug).maybeSingle();
  if (!data) return null;
  return getCaseDoc(data.id as number);
}

export async function getTaxonomy(): Promise<{
  specialties: { id: number; name: string }[];
  topics: { id: number; name: string; specialty_id: number | null }[];
}> {
  const admin = createAdminClient();
  const [{ data: specialties }, { data: topics }] = await Promise.all([
    admin.from("specialties").select("id, name").eq("active", true).order("display_order"),
    admin.from("topics").select("id, name, specialty_id").order("name"),
  ]);
  return {
    specialties: (specialties ?? []) as { id: number; name: string }[],
    topics: (topics ?? []) as { id: number; name: string; specialty_id: number | null }[],
  };
}

/**
 * HEAD every media URL of a document against the CDN. Returns url → exists.
 * Bounded concurrency; a network failure counts as "missing" (publish must
 * fail closed — a student must never meet a dead media slot).
 */
export async function probeMedia(doc: CaseDoc): Promise<Map<string, boolean>> {
  const urls = [...new Set(collectMedia(doc).map((m) => m.media.url).filter(Boolean))];
  const out = new Map<string, boolean>();
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift()!;
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        out.set(url, res.ok);
      } catch {
        out.set(url, false);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
  return out;
}

export type AttemptRow = {
  id: number;
  user_id: string;
  case_id: number;
  case_revision: number;
  is_preview: boolean;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  duration_ms: number | null;
  state: Record<string, unknown>;
};

export async function getOpenAttempt(userId: string, caseId: number, isPreview: boolean): Promise<AttemptRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("clinact_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("case_id", caseId)
    .eq("is_preview", isPreview)
    .is("finished_at", null)
    .order("started_at", { ascending: false })
    .limit(5);
  // "Reiniciar" leaves the old attempt open but flagged abandoned (§2.4): it
  // must never resume and never become canonical.
  const open = ((data ?? []) as AttemptRow[]).find((a) => !(a.state as { abandoned?: boolean })?.abandoned);
  return open ?? null;
}

/** First completed attempt per case for a user (§2.3) — the canonical one. */
export async function getCanonicalAttempts(userId: string): Promise<Map<number, AttemptRow>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("clinact_attempts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_preview", false)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: true });
  const map = new Map<number, AttemptRow>();
  for (const row of (data ?? []) as AttemptRow[]) {
    if (!map.has(row.case_id)) map.set(row.case_id, row);
  }
  return map;
}
