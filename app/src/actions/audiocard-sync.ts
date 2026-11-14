"use server";

/**
 * Single source (TEST): actions behind the AudioCards × Flashcards panel — Karina's three tiers.
 * Rule (Karina 2026-11-14): the system identifies and alerts; SHE decides whether the audio stays or is suspended.
 * Content roles only (super_admin, content_admin). Every action is written to admin_audit_log.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCardChangeKind } from "@/lib/card-change-kind";

async function requireContentAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["super_admin", "content_admin"].includes(profile.role as string)) throw new Error("Sem permissão");
  return user;
}

async function audit(actorId: string, action: string, details: Record<string, unknown>) {
  await createAdminClient().from("admin_audit_log").insert({ actor_user_id: actorId, action, target_user_id: null, details });
}

function done() {
  revalidatePath("/admin/flashcards");
  revalidatePath("/app", "layout");
}

/** Classify logged card changes (editorial / clinica / nao_esclarecida). */
export async function classifyCardChanges(changeIds: number[], kind: string): Promise<void> {
  const user = await requireContentAdmin();
  if (!isCardChangeKind(kind)) throw new Error("Tipo de alteração inválido");
  const ids = changeIds.filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return;
  const { error } = await createAdminClient().rpc("classify_flashcard_changes", { p_change_ids: ids, p_kind: kind, p_actor: user.id });
  if (error) throw new Error(error.message);
  await audit(user.id, "flashcard_change_classify", { change_ids: ids, kind });
  done();
}

/**
 * Her decision "o áudio continua adequado": keeps the audio published and clears the pending changes of one
 * AudioCard (all of them, or the ones given), whatever their type. Recorded with date, author and cards.
 */
export async function confirmAudiocardChanges(lessonId: number, changeIds?: number[]): Promise<void> {
  const user = await requireContentAdmin();
  if (!Number.isInteger(lessonId) || lessonId <= 0) throw new Error("AudioCard inválido");
  const ids = changeIds?.filter((n) => Number.isInteger(n) && n > 0);
  const { data, error } = await createAdminClient().rpc("confirm_audiocard_changes", {
    p_lesson_id: lessonId, p_actor: user.id, p_change_ids: ids && ids.length ? ids : null,
  });
  if (error) throw new Error(error.message);
  await audit(user.id, "audiocard_audio_keep", { lesson_id: lessonId, change_ids: ids ?? null, covered: data });
  done();
}

/** Suspend (with a reason) or restore an AudioCard's audio. The file and URL are never touched. */
export async function setAudiocardSuspension(lessonId: number, suspend: boolean, reason: string): Promise<void> {
  const user = await requireContentAdmin();
  const why = reason.trim();
  if (suspend && !why) throw new Error("Informe o motivo da suspensão");
  const { error } = await createAdminClient().rpc("set_audiocard_suspension", {
    p_lesson_id: lessonId, p_suspend: suspend, p_reason: suspend ? why : null, p_actor: user.id,
  });
  if (error) throw new Error(error.message);
  await audit(user.id, suspend ? "audiocard_audio_suspend" : "audiocard_audio_restore", { lesson_id: lessonId, reason: suspend ? why : null });
  done();
}
