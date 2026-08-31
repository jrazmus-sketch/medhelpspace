"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CaseDocSchema, ConfidenceSchema } from "@/lib/clinact/schemas";
import { parseCaseFile, resolveTaxonomy, type Issue } from "@/lib/clinact/parse";
import { validateForPublish, publishBlockers } from "@/lib/clinact/validate";
import { getCaseDoc, getTaxonomy, probeMedia, getOpenAttempt, type AttemptRow } from "@/lib/clinact/queries";
import { collectMedia, mediaKey } from "@/lib/clinact/media";
import { slugifyTitle } from "@/lib/clinact/slug";
import { createPreviewToken } from "@/lib/clinact/preview-token";
import { onCaseFinished } from "@/lib/clinact/review";
import { caseScore } from "@/lib/clinact/scoring";
import {
  buildScreens,
  applyDecision,
  advance,
  emptyState,
  earnedWeights,
  buildReveal,
  stepKey,
  type Decision,
  type Reveal,
} from "@/lib/clinact/engine";
import { CLINACT_CDN_BASE, CLINACT_MEDIA_PREFIX, type AttemptState, type CaseDoc, type CaseFormat, type ClueDoc } from "@/lib/clinact/types";

// Conventions (same as actions/ambassadors.ts):
//   1. Only async functions are exported.
//   2. Expected outcomes are RETURNED as discriminated values, never thrown —
//      Next.js redacts thrown Server Action messages in production.

const CONTENT_ROLES = ["super_admin", "content_admin"];
const ANY_ADMIN = ["super_admin", "content_admin", "support_admin", "billing_admin"];

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return { userId: user.id, role: (profile?.role as string) ?? "member", admin };
}

async function requireContentAdmin() {
  const ctx = await currentUser();
  if (!CONTENT_ROLES.includes(ctx.role)) throw new Error("Unauthorized");
  return ctx;
}

async function writeAudit(actorId: string, action: string, details: Record<string, unknown>) {
  const admin = createAdminClient();
  const { error } = await admin.from("admin_audit_log").insert({ actor_user_id: actorId, action, details });
  if (error) console.error("clinact audit failed", action, error);
}

function revalidateAdmin(id?: number) {
  revalidatePath("/admin/clinact");
  if (id) revalidatePath(`/admin/clinact/${id}`);
  revalidatePath("/clinact/treinar");
}

// ── Editor ────────────────────────────────────────────────────────────────────

export type SaveResult = { ok: true; id: number; slug: string } | { ok: false; error: "invalid" | "slug_taken"; detail?: string };

/** Save draft — no validation beyond shape (§3: "Always saves incomplete"). */
export async function saveCaseDraft(input: unknown): Promise<SaveResult> {
  const { userId, admin } = await requireContentAdmin();
  const parsed = CaseDocSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", detail: parsed.error.issues[0]?.message };
  const doc = parsed.data as CaseDoc;
  doc.slug = doc.slug?.trim() || slugifyTitle(doc.title);
  if (!doc.slug) return { ok: false, error: "invalid", detail: "slug" };

  const { data: clash } = await admin.from("clinact_cases").select("id").eq("slug", doc.slug).maybeSingle();
  if (clash && clash.id !== doc.id) return { ok: false, error: "slug_taken" };

  const { data, error } = await admin.rpc("clinact_save_case", { p_case: doc, p_actor: userId });
  if (error) {
    console.error("clinact_save_case", error);
    return { ok: false, error: "invalid", detail: error.message };
  }
  const id = data as number;
  revalidateAdmin(id);
  return { ok: true, id, slug: doc.slug };
}

export type PublishResult = { ok: true; revision: number } | { ok: false; error: "blocked" | "not_found"; blockers?: string[] };

/**
 * Validate an UNSAVED document (with the CDN media probe) so the editor can
 * refuse before anything lands — on a published case the save itself is the
 * republish, so validating after saving would be too late.
 */
export async function validateCaseDoc(input: unknown): Promise<{ blockers: string[] }> {
  await requireContentAdmin();
  const parsed = CaseDocSchema.safeParse(input);
  if (!parsed.success) return { blockers: [parsed.error.issues[0]?.message ?? "Documento inválido"] };
  const doc = parsed.data as CaseDoc;
  const exists = await probeMedia(doc);
  return { blockers: publishBlockers(validateForPublish(doc, (url) => exists.get(url) ?? false)) };
}

export async function publishCase(caseId: number): Promise<PublishResult> {
  const { userId, admin } = await requireContentAdmin();
  const doc = await getCaseDoc(caseId);
  if (!doc) return { ok: false, error: "not_found" };
  const exists = await probeMedia(doc);
  const checks = validateForPublish(doc, (url) => exists.get(url) ?? false);
  const blockers = publishBlockers(checks);
  if (blockers.length) return { ok: false, error: "blocked", blockers };

  const { data, error } = await admin.rpc("clinact_publish_case", { p_case_id: caseId, p_actor: userId });
  if (error) throw error;
  const revision = data as number;
  await writeAudit(userId, "clinact_publish", { case_id: caseId, slug: doc.slug, title: doc.title, revision });
  revalidateAdmin(caseId);
  return { ok: true, revision };
}

export async function unpublishCase(caseId: number): Promise<{ ok: boolean }> {
  const { userId, admin } = await requireContentAdmin();
  const { data } = await admin.from("clinact_cases").update({ status: "draft" }).eq("id", caseId).eq("status", "published").select("slug, title").maybeSingle();
  if (data) await writeAudit(userId, "clinact_unpublish", { case_id: caseId, slug: data.slug, title: data.title });
  revalidateAdmin(caseId);
  return { ok: !!data };
}

export async function archiveCase(caseId: number): Promise<{ ok: boolean }> {
  const { userId, admin } = await requireContentAdmin();
  const { data } = await admin.from("clinact_cases").update({ status: "archived" }).eq("id", caseId).select("slug, title").maybeSingle();
  if (data) await writeAudit(userId, "clinact_archive", { case_id: caseId, slug: data.slug, title: data.title });
  revalidateAdmin(caseId);
  return { ok: !!data };
}

/**
 * Hard delete (rule updated per Karina 2026-08-31): allowed for any case that
 * is not currently published AND has no REAL student attempts. Preview
 * attempts never protect a case; a real attempt always does — those cases can
 * only be archived, preserving attempts, revisions and history.
 */
export async function deleteDraft(caseId: number): Promise<{ ok: true } | { ok: false; error: "published" | "has_attempts" | "not_found" }> {
  const { userId, admin } = await requireContentAdmin();
  const { data: c } = await admin.from("clinact_cases").select("id, slug, title, status, revision").eq("id", caseId).maybeSingle();
  if (!c) return { ok: false, error: "not_found" };
  if (c.status === "published") return { ok: false, error: "published" };
  const { count } = await admin
    .from("clinact_attempts")
    .select("id", { count: "exact", head: true })
    .eq("case_id", caseId)
    .eq("is_preview", false);
  if ((count ?? 0) > 0) return { ok: false, error: "has_attempts" };
  await admin.from("clinact_cases").delete().eq("id", caseId);
  await writeAudit(userId, "clinact_delete_case", { case_id: caseId, slug: c.slug, title: c.title, revision: c.revision });
  revalidateAdmin();
  return { ok: true };
}

export async function duplicateCase(caseId: number): Promise<{ ok: true; id: number } | { ok: false }> {
  const { userId, admin } = await requireContentAdmin();
  const doc = await getCaseDoc(caseId);
  if (!doc) return { ok: false };
  const copy: CaseDoc = {
    ...doc,
    id: undefined,
    title: `${doc.title} (cópia)`,
    slug: "",
    status: undefined,
    revision: undefined,
    published_at: undefined,
    steps: doc.steps.map((s) => ({ ...s, id: undefined, options: s.options.map((o) => ({ ...o, id: undefined })) })),
    clues: doc.clues.map((c) => ({ ...c, id: undefined })),
  };
  let base = slugifyTitle(copy.title);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await admin.from("clinact_cases").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }
  copy.slug = slug;
  const { data, error } = await admin.rpc("clinact_save_case", { p_case: copy, p_actor: userId });
  if (error) throw error;
  base = "";
  revalidateAdmin();
  return { ok: true, id: data as number };
}

export async function createPreviewLink(caseId: number): Promise<{ url: string }> {
  const { userId } = await requireContentAdmin();
  const token = createPreviewToken(caseId, userId);
  return { url: `/clinact/preview/${token}` };
}

// ── Media upload (Bunny) ──────────────────────────────────────────────────────

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

export async function uploadClinactMedia(formData: FormData): Promise<{ url: string; key: string } | { error: string }> {
  await requireContentAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "no_file" };
  if (file.size === 0) return { error: "empty_file" };
  if (file.size > MAX_MEDIA_BYTES) return { error: "too_large" };

  const endpoint = process.env.BUNNY_STORAGE_ENDPOINT;
  const accessKey = process.env.BUNNY_STORAGE_PASSWORD || process.env.BUNNY_API_KEY;
  if (!endpoint || !accessKey) return { error: "bunny_not_configured" };

  const key = mediaKey(file.name || "arquivo");
  const remotePath = `${CLINACT_MEDIA_PREFIX}/${key}`;
  const res = await fetch(`${endpoint.replace(/\/$/, "")}/${remotePath}`, {
    method: "PUT",
    headers: { AccessKey: accessKey, "Content-Type": file.type || "application/octet-stream" },
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!res.ok) {
    console.error(`[uploadClinactMedia] Bunny PUT ${res.status}`, await res.text().catch(() => ""));
    return { error: "upload_failed" };
  }
  return { url: `${CLINACT_CDN_BASE}/${remotePath}`, key };
}

// ── Bulk importer (§3.2) ──────────────────────────────────────────────────────

export type ImportRow = {
  index: number;
  file: string;
  title: string;
  slug: string;
  format: CaseFormat | null;
  specialty: string | null;
  blockCount: number;
  errors: Issue[];
  warnings: Issue[];
  /** What would happen on commit. */
  action: "create" | "replace_draft" | "skip_published" | "update_published" | "error";
  existingId: number | null;
};

export type ImportReport = { version: number; rows: ImportRow[] };

async function analyze(files: { name: string; text: string }[], updatePublished: boolean) {
  const admin = createAdminClient();
  const { specialties, topics } = await getTaxonomy();
  const rows: ImportRow[] = [];
  const docs: (CaseDoc | null)[] = [];
  let index = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const { version, cases } = parseCaseFile(f.text);
    for (const c of cases) {
      resolveTaxonomy(c, specialties, topics);
      if (c.slug && seen.has(c.slug)) {
        c.errors.push({ line: c.startLine, message: `Título repetido entre arquivos ("${c.title}").` });
        c.doc = null;
      }
      if (c.slug) seen.add(c.slug);

      let action: ImportRow["action"] = "error";
      let existingId: number | null = null;
      if (c.doc) {
        // Media: warning at import, never an error (§2).
        const exists = await probeMedia(c.doc);
        for (const { media, where } of collectMedia(c.doc)) {
          if (exists.get(media.url) === false) {
            c.warnings.push({ line: null, message: `Arquivo "${media.file ?? media.url}" (${where}) ainda não foi enviado — o caso entra com o espaço reservado.` });
          }
        }
        const { data: existing } = await admin.from("clinact_cases").select("id, status").eq("slug", c.slug).maybeSingle();
        if (!existing) action = "create";
        else {
          existingId = existing.id as number;
          if (existing.status === "published") action = updatePublished ? "update_published" : "skip_published";
          else action = "replace_draft";
        }
      }
      rows.push({
        index: index++,
        file: f.name,
        title: c.title || "(sem título)",
        slug: c.slug,
        format: c.format,
        specialty: c.specialtyText,
        blockCount: c.blockCount,
        errors: c.errors,
        warnings: c.warnings,
        action,
        existingId,
      });
      docs.push(c.doc);
      void version;
    }
  }
  return { rows, docs };
}

export async function dryRunImport(files: { name: string; text: string }[], updatePublished: boolean): Promise<ImportReport> {
  await requireContentAdmin();
  const { rows } = await analyze(files, updatePublished);
  return { version: 1, rows };
}

export type CommitResult = {
  imported: { slug: string; id: number; action: ImportRow["action"] }[];
  skipped: { slug: string; reason: string }[];
  failed: { slug: string; title: string; errors: Issue[] }[];
};

/** Re-parses server-side (trusts nothing from the dry run), one transaction per case. */
export async function commitImport(files: { name: string; text: string }[], updatePublished: boolean): Promise<CommitResult> {
  const { userId, admin } = await requireContentAdmin();
  const { rows, docs } = await analyze(files, updatePublished);
  const result: CommitResult = { imported: [], skipped: [], failed: [] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const doc = docs[i];
    if (!doc || row.action === "error") {
      result.failed.push({ slug: row.slug, title: row.title, errors: row.errors });
      continue;
    }
    if (row.action === "skip_published") {
      result.skipped.push({ slug: row.slug, reason: "published" });
      continue;
    }
    if (row.existingId) doc.id = row.existingId;
    const { data, error } = await admin.rpc("clinact_save_case", { p_case: doc, p_actor: userId });
    if (error) {
      console.error("clinact import save failed", row.slug, error);
      result.failed.push({ slug: row.slug, title: row.title, errors: [{ line: null, message: `Erro ao gravar: ${error.message}` }] });
      continue;
    }
    result.imported.push({ slug: row.slug, id: data as number, action: row.action });
  }
  await writeAudit(userId, "clinact_import", {
    files: files.map((f) => f.name),
    imported: result.imported.length,
    skipped: result.skipped.length,
    failed: result.failed.length,
    slugs: result.imported.map((r) => r.slug),
    update_published: updatePublished,
  });
  revalidateAdmin();
  return result;
}

// ── Player ────────────────────────────────────────────────────────────────────

async function loadAttemptForUser(attemptId: number) {
  const ctx = await currentUser();
  const { data } = await ctx.admin.from("clinact_attempts").select("*").eq("id", attemptId).maybeSingle();
  const attempt = data as AttemptRow | null;
  if (!attempt || attempt.user_id !== ctx.userId) throw new Error("Unauthorized");
  const doc = await getCaseDoc(attempt.case_id);
  if (!doc) throw new Error("Case not found");
  // Non-preview attempts require the case to still be published, and a live
  // entitlement (admins pass). Preview attempts are the admin's own.
  if (!attempt.is_preview) {
    if (doc.status !== "published") throw new Error("Unavailable");
    if (!ANY_ADMIN.includes(ctx.role)) {
      const supabase = await createClient();
      const { data: has } = await supabase.rpc("user_has_product_access", { p: "clinact" });
      if (!has) throw new Error("Unauthorized");
    }
  }
  return { ...ctx, attempt, doc };
}

export type DecisionResult = { ok: true; reveal: Reveal; state: AttemptState } | { ok: false; error: string };

export async function submitDecision(attemptId: number, stepId: number, decisionInput: unknown): Promise<DecisionResult> {
  const { admin, attempt, doc } = await loadAttemptForUser(attemptId);
  if (attempt.finished_at) return { ok: false, error: "finished" };
  const screens = buildScreens(doc.steps);
  const state = (Object.keys(attempt.state).length ? attempt.state : emptyState()) as AttemptState;
  const screen = screens[state.cursor];
  if (!screen?.decision || screen.decision.id !== stepId) return { ok: false, error: "wrong_step" };

  const raw = (decisionInput ?? {}) as Record<string, unknown>;
  const confidence = raw.confidence == null ? null : ConfidenceSchema.safeParse(raw.confidence).data ?? null;
  const timeMs = typeof raw.time_ms === "number" && raw.time_ms >= 0 ? Math.round(raw.time_ms) : null;
  let decision: Decision;
  if (Array.isArray(raw.order)) decision = { order: raw.order.map(Number), confidence, time_ms: timeMs };
  else if (typeof raw.option_id === "number") decision = { option_id: raw.option_id, confidence, time_ms: timeMs };
  else return { ok: false, error: "invalid" };

  let applied;
  try {
    applied = applyDecision(state, screen, decision);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { error: evErr } = await admin.from("clinact_step_events").insert({
    attempt_id: attemptId,
    step_id: stepId,
    option_id: "option_id" in decision ? decision.option_id : null,
    skill: screen.decision.skill ?? doc.primary_skill,
    is_correct: applied.answered.is_correct,
    weight: applied.answered.weight,
    confidence,
    time_ms: timeMs,
    payload: "order" in decision ? { order: decision.order } : null,
  });
  if (evErr) {
    if (evErr.code === "23505") return { ok: false, error: "Decisão já registrada." };
    throw evErr;
  }
  // Autosave (§2.4): state is written on every event, server-side.
  await admin.from("clinact_attempts").update({ state: applied.state }).eq("id", attemptId);
  return { ok: true, reveal: buildReveal(screen, applied), state: applied.state };
}

export type AdvanceResult = { ok: true; state: AttemptState; finished: boolean; score: number | null; clues?: ClueDoc[]; finalKey?: string | null };

export async function advanceAttempt(attemptId: number): Promise<AdvanceResult> {
  const { admin, attempt, doc } = await loadAttemptForUser(attemptId);
  const screens = buildScreens(doc.steps);
  const state = (Object.keys(attempt.state).length ? attempt.state : emptyState()) as AttemptState;
  if (attempt.finished_at) return { ok: true, state, finished: true, score: attempt.score, clues: doc.clues, finalKey: doc.final_key ?? null };
  const current = screens[state.cursor];
  if (current?.decision && !state.answered[stepKey(current.decision)]) {
    // Cannot skip a decision.
    return { ok: true, state, finished: false, score: null };
  }
  const next = advance(state, screens);
  const reachedClosing = screens[next.cursor]?.closing === true;
  if (reachedClosing) {
    const score = caseScore(earnedWeights(next, screens));
    const duration = Date.now() - new Date(attempt.started_at).getTime();
    const { data: closed } = await admin
      .from("clinact_attempts")
      .update({ state: next, finished_at: new Date().toISOString(), score, duration_ms: Math.max(0, Math.min(duration, 2_147_483_647)) })
      .eq("id", attemptId)
      .is("finished_at", null)
      .select("id")
      .maybeSingle();
    // Spaced review (frozen rule, Karina 2026-08-31). Never blocks the finish.
    if (closed && !attempt.is_preview) {
      try {
        const [{ count: earlier }, { count: hc }] = await Promise.all([
          admin
            .from("clinact_attempts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", attempt.user_id)
            .eq("case_id", attempt.case_id)
            .eq("is_preview", false)
            .not("finished_at", "is", null)
            .neq("id", attemptId),
          admin
            .from("clinact_step_events")
            .select("id", { count: "exact", head: true })
            .eq("attempt_id", attemptId)
            .eq("is_correct", false)
            .eq("confidence", "alta"),
        ]);
        await onCaseFinished({
          userId: attempt.user_id,
          caseId: attempt.case_id,
          specialtyId: doc.specialty_id ?? null,
          score,
          highConfidenceErrors: hc ?? 0,
          isFirstCompletion: (earlier ?? 0) === 0,
        });
      } catch (e) {
        console.error("clinact review scheduling failed", e);
      }
    }
    return { ok: true, state: next, finished: true, score, clues: doc.clues, finalKey: doc.final_key ?? null };
  }
  await admin.from("clinact_attempts").update({ state: next }).eq("id", attemptId);
  return { ok: true, state: next, finished: false, score: null };
}

/** "Reiniciar" — a deliberate new attempt; the original stays registered (§2.4). */
export async function restartAttempt(caseId: number, isPreview: boolean): Promise<{ attemptId: number }> {
  const ctx = await currentUser();
  const { data: c } = await ctx.admin.from("clinact_cases").select("id, status, revision").eq("id", caseId).maybeSingle();
  if (!c) throw new Error("Case not found");
  if (isPreview) {
    if (!CONTENT_ROLES.includes(ctx.role)) throw new Error("Unauthorized");
  } else {
    if (c.status !== "published") throw new Error("Unavailable");
    if (!ANY_ADMIN.includes(ctx.role)) {
      const supabase = await createClient();
      const { data: has } = await supabase.rpc("user_has_product_access", { p: "clinact" });
      if (!has) throw new Error("Unauthorized");
    }
  }
  // Abandon any open attempt of the same kind: it stays as a record, just not
  // resumable (finished_at stays null, so it never becomes canonical).
  const open = await getOpenAttempt(ctx.userId, caseId, isPreview);
  if (open) await ctx.admin.from("clinact_attempts").update({ state: { ...open.state, abandoned: true } }).eq("id", open.id);
  const { data, error } = await ctx.admin.rpc("clinact_open_attempt", {
    p_user: ctx.userId,
    p_case_id: caseId,
    p_is_preview: isPreview,
    p_revision: c.revision,
  });
  if (error) throw error;
  return { attemptId: (data as AttemptRow).id };
}
