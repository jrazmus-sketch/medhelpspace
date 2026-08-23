import { createAdminClient } from "@/lib/supabase/admin";
import { SIMULADO_SET_VERSION } from "@/lib/magnet/simulado";

// Keeps the free funnel's copy of the 100-question simulado in step with the
// member copy that admins actually edit.
//
// WHY THIS EXISTS. The set lives in two tables on purpose (see the MEMBER MIRROR
// note in scripts/import-simulado-100.js): members read `quiz_questions` — that
// is what the quiz player, progress stats, Revisão and the page editor all
// expect — while /simulado-revalida reads the funnel-owned `simulado_questions`,
// whose loaders guarantee the exam payload can never carry the gabarito. The
// importer writes BOTH from Karina's source JSON, so a fix made there lands in
// both places.
//
// Editing in the app was the hole. Every editing surface writes the member copy
// only — the inline editor's whitelist has `quiz_questions.question` and
// `.explanation_html` but no `simulado_questions` entry at all, and
// updateQuizQuestions writes quiz_questions directly. So a comentário corrected
// in /admin changed the 60D simulado and left free leads reading the old text,
// with nothing to tell anyone the two had drifted apart. This module closes it:
// the member copy stays the single place to edit, and every write to it is
// mirrored back into the funnel row at the same position.
//
// DIRECTION IS DELIBERATE: member → funnel, never the reverse. The funnel copy
// has no editing surface, so it can only ever be older.

// The member-side page holding the funnel's 100 questions. This is the same slug
// the importer is invoked with (`--member-page simulado-100q-3`); if a second
// mirrored set is ever added, this becomes a lookup rather than a constant.
export const SIMULADO_MEMBER_PAGE_SLUG = "simulado-100q-3";

type QuizAnswer = { text: string; correct: boolean; feedback: string };

type FunnelFields = {
  enunciado: string;
  alternatives: string[];
  correct_index: number;
  comentario: string;
  distratores: string;
  conceito_chave: string;
};

export type MirrorResult = {
  /** Rows written to `simulado_questions`. */
  mirrored: number;
  /**
   * Positions whose member row could not be converted back (see
   * `toFunnelFields`). Left untouched rather than half-written — a funnel row
   * with an empty comentário is worse than a stale one.
   */
  skipped: number[];
};

const EMPTY: MirrorResult = { mirrored: 0, skipped: [] };

// ── HTML → the plain text the funnel columns hold ────────────────────────────

// `safe()` re-encodes on every inline save, so by the time text comes back out
// it may carry entities the funnel (which renders as plain text in JSX) must not
// show literally. &amp; is decoded last so "&amp;lt;" survives as "&lt;".
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

// Block ends become newlines so an enunciado's paragraphing survives — the exam
// renders it with `whitespace-pre-line`, so those breaks are load-bearing.
function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(?:p|div|li|h[1-6]|tr)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  ).replace(/ /g, " ");
}

/** Collapse runs of spaces but keep line breaks (for `whitespace-pre-line` text). */
function tidyMultiline(s: string): string {
  return s
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Collapse all whitespace to single spaces (for the one-paragraph fields). */
function tidyInline(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// The three gabarito parts, as the importer folds them into one blob:
//   <p><strong>Comentário.</strong> …</p>
//   <p><strong>Por que as outras estão erradas.</strong> …</p>
//   <p><strong>Conceito-chave:</strong> …</p>
// Matched on the label text rather than the exact markup, so an edit that
// reflows the tags still round-trips.
const RE_COMENTARIO = /Coment[áa]rio\s*[.:]/i;
const RE_DISTRATORES = /Por que as outras est[ãa]o erradas\s*[.:]/i;
const RE_CONCEITO = /Conceito[-\s]?chave\s*[.:]/i;

/**
 * Split a member `explanation_html` back into the funnel's three columns.
 * Returns null when the blob doesn't carry all three labels in order — an admin
 * is free to rewrite the explanation into any shape they like, and a mangled
 * guess is worse than leaving the funnel row alone.
 */
export function parseExplanation(
  explanationHtml: string | null,
): Pick<FunnelFields, "comentario" | "distratores" | "conceito_chave"> | null {
  if (!explanationHtml) return null;
  const text = htmlToText(explanationHtml);

  const c = RE_COMENTARIO.exec(text);
  const d = RE_DISTRATORES.exec(text);
  const k = RE_CONCEITO.exec(text);
  if (!c || !d || !k) return null;
  if (!(c.index < d.index && d.index < k.index)) return null;

  const comentario = tidyInline(text.slice(c.index + c[0].length, d.index));
  const distratores = tidyInline(text.slice(d.index + d[0].length, k.index));
  const conceito_chave = tidyInline(text.slice(k.index + k[0].length));
  if (!comentario || !distratores || !conceito_chave) return null;

  return { comentario, distratores, conceito_chave };
}

/** Invert the importer's funnel → member transform. Null = don't touch the row. */
export function toFunnelFields(row: {
  question: string | null;
  answers: QuizAnswer[] | null;
  explanation_html: string | null;
}): FunnelFields | null {
  const enunciado = tidyMultiline(htmlToText(row.question ?? ""));
  if (!enunciado) return null;

  const answers = row.answers ?? [];
  const alternatives = answers.map((a) => tidyInline(htmlToText(a?.text ?? "")));
  const correct_index = answers.findIndex((a) => a?.correct);
  // The funnel grades from correct_index alone; a set with no key, a short set
  // or a blank alternative would break grading for every lead, not just this row.
  if (alternatives.length !== 4 || alternatives.some((t) => !t)) return null;
  if (correct_index < 0) return null;

  const parts = parseExplanation(row.explanation_html);
  if (!parts) return null;

  return { enunciado, alternatives, correct_index, ...parts };
}

// ── Mirroring ────────────────────────────────────────────────────────────────

type Admin = ReturnType<typeof createAdminClient>;

async function memberPageId(admin: Admin): Promise<number | null> {
  const { data } = await admin
    .from("pages")
    .select("id")
    .eq("slug", SIMULADO_MEMBER_PAGE_SLUG)
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

/**
 * Push every given member row into its funnel twin, matched on `position`.
 * Only ever UPDATEs: a member row at a position the funnel set doesn't have is
 * skipped rather than inserted, so a stray edit can't grow the exam past 100.
 */
async function writeRows(
  admin: Admin,
  rows: { position: number; question: string | null; answers: QuizAnswer[] | null; explanation_html: string | null }[],
): Promise<MirrorResult> {
  const skipped: number[] = [];
  let mirrored = 0;

  for (const row of rows) {
    const fields = toFunnelFields(row);
    if (!fields) {
      skipped.push(row.position);
      continue;
    }
    const { data, error } = await admin
      .from("simulado_questions")
      .update(fields)
      .eq("set_version", SIMULADO_SET_VERSION)
      .eq("position", row.position)
      .select("id");
    if (error || !data?.length) {
      skipped.push(row.position);
      continue;
    }
    mirrored += 1;
  }

  return { mirrored, skipped };
}

/**
 * Mirror one edited question. No-op unless it belongs to the mirrored page, so
 * this is safe to call after any quiz_questions write anywhere in the admin.
 */
export async function mirrorQuizQuestionToFunnel(questionId: number): Promise<MirrorResult> {
  const admin = createAdminClient();
  const pageId = await memberPageId(admin);
  if (!pageId) return EMPTY;

  const { data } = await admin
    .from("quiz_questions")
    .select("position, question, answers, explanation_html, page_id")
    .eq("id", questionId)
    .maybeSingle();
  if (!data || (data.page_id as number) !== pageId) return EMPTY;

  return writeRows(admin, [
    {
      position: data.position as number,
      question: data.question as string | null,
      answers: data.answers as QuizAnswer[] | null,
      explanation_html: data.explanation_html as string | null,
    },
  ]);
}

/**
 * Mirror a whole page after a bulk save. No-op for any page but the mirrored one.
 */
export async function mirrorQuizPageToFunnel(pageId: number): Promise<MirrorResult> {
  const admin = createAdminClient();
  const mirroredPageId = await memberPageId(admin);
  if (!mirroredPageId || mirroredPageId !== pageId) return EMPTY;

  const { data } = await admin
    .from("quiz_questions")
    .select("position, question, answers, explanation_html")
    .eq("page_id", pageId)
    .order("position", { ascending: true });
  if (!data?.length) return EMPTY;

  return writeRows(
    admin,
    data.map((r) => ({
      position: r.position as number,
      question: r.question as string | null,
      answers: r.answers as QuizAnswer[] | null,
      explanation_html: r.explanation_html as string | null,
    })),
  );
}
