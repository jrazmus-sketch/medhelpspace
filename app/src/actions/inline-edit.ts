"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safe } from "@/lib/sanitize";

// (table, field) pairs that EditableText is allowed to write to.
// Membership in this set is the single source of truth — adding a new
// editable field requires adding an entry here.
const SCALAR_ALLOWED = new Set<string>([
  "pages.title",
  "lessons.title",
  "lessons.body_html",
  "quiz_questions.question",
  "quiz_questions.explanation_html",
  "flashcard_items.text",
  "flashcard_items.answer",
  "nav_items.label",
]);

// Plain-text fields trim + reject empty; everything else is HTML and goes through safe().
const PLAIN_FIELDS = new Set<string>([
  "pages.title",
  "lessons.title",
  "nav_items.label",
]);

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "member") throw new Error("Sem permissão");
  return { user, role: profile.role as string };
}

async function writeAudit(actorId: string, details: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_user_id: actorId,
    action: "inline_edit",
    target_user_id: null,
    details,
  });
}

export async function updateScalarField(
  table: string,
  id: number,
  field: string,
  rawValue: string,
): Promise<void> {
  const { user } = await requireAdmin();
  const key = `${table}.${field}`;
  if (!SCALAR_ALLOWED.has(key)) {
    throw new Error(`Campo não editável: ${key}`);
  }

  const isPlain = PLAIN_FIELDS.has(key);
  const cleanValue = isPlain ? rawValue.trim() : safe(rawValue);

  if (isPlain && cleanValue.length === 0) {
    throw new Error("O campo não pode ficar vazio");
  }

  const admin = createAdminClient();

  const { data: before, error: readErr } = await admin
    .from(table)
    .select(field)
    .eq("id", id)
    .single();
  if (readErr) throw new Error(readErr.message);
  const beforeValue = before
    ? (before as unknown as Record<string, unknown>)[field]
    : null;
  if (beforeValue === cleanValue) return;

  const { error } = await admin
    .from(table)
    .update({ [field]: cleanValue })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit(user.id, {
    table,
    id,
    field,
    before: beforeValue,
    after: cleanValue,
  });

  revalidatePath("/app", "layout");
}

interface QuizAnswer {
  text: string;
  correct: boolean;
  feedback: string;
}

export async function updateQuizAnswerField(
  questionId: number,
  answerIdx: number,
  field: "text" | "feedback",
  rawValue: string,
): Promise<void> {
  const { user } = await requireAdmin();
  const admin = createAdminClient();

  const { data: row, error: readErr } = await admin
    .from("quiz_questions")
    .select("answers")
    .eq("id", questionId)
    .single();
  if (readErr || !row) throw new Error("Questão não encontrada");

  const answers = ((row.answers as QuizAnswer[]) ?? []).map((a) => ({ ...a }));
  if (answerIdx < 0 || answerIdx >= answers.length) {
    throw new Error("Índice de alternativa inválido");
  }

  const cleanValue = safe(rawValue);
  const beforeValue = answers[answerIdx][field];
  if (beforeValue === cleanValue) return;

  answers[answerIdx] = { ...answers[answerIdx], [field]: cleanValue };

  const { error } = await admin
    .from("quiz_questions")
    .update({ answers })
    .eq("id", questionId);
  if (error) throw new Error(error.message);

  await writeAudit(user.id, {
    table: "quiz_questions",
    id: questionId,
    field: `answers[${answerIdx}].${field}`,
    before: beforeValue,
    after: cleanValue,
  });

  revalidatePath("/app", "layout");
}
