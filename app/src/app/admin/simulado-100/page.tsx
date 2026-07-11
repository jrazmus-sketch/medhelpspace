import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIMULADO_BLOCOS } from "@/lib/magnet/simulado-questions";
import { SimuladoReviewClient, type ReviewQuestion } from "./review-client";

export const metadata = { title: "Revisão — Simulado 100Q" };

// Pre-launch review of the free 100-question simulado (/simulado-revalida).
// Content-capable roles only — mirrors the estudio gate (defense-in-depth on
// top of the admin layout fence; direct URL hits redirect).
const REVIEW_ROLES = ["super_admin", "content_admin"];

// "Questão 99 (Revalida 2020)" / "Questão 38 · Revalida 2020" → "2020" etc.
// Same tolerant match as scripts/build-simulado-100.js.
function editionOf(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, " ");
  const m = text.match(/Quest[aã]o\s+\d+[\s\S]{0,12}?Revalida\s+(20\d\d(?:\.[12])?)/i);
  return m ? m[1] : null;
}

export default async function SimuladoReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!REVIEW_ROLES.includes((profile?.role as string) ?? "member")) {
    redirect("/admin");
  }

  // Content reads via the service-role client (quiz_questions RLS is
  // member-gated; the flags table is deny-all).
  const admin = createAdminClient();
  const allIds = SIMULADO_BLOCOS.flatMap((b) => b.questionIds);

  const [{ data: questions }, { data: flags }] = await Promise.all([
    admin
      .from("quiz_questions")
      .select("id, question, answers, media_url, explanation_html, page_id")
      .in("id", allIds),
    admin.from("simulado_review_flags").select("question_id, note"),
  ]);

  const pageIds = [...new Set((questions ?? []).map((q) => q.page_id as number))];
  const { data: topics } = await admin
    .from("topics")
    .select("source_page_id, name, incidence_count, priority_tier")
    .in("source_page_id", pageIds);

  // Best topic per source page (highest incidence wins — matches the builder).
  const topicByPage = new Map<number, { name: string; tier: string | null }>();
  for (const t of topics ?? []) {
    const pid = t.source_page_id as number;
    const cur = topicByPage.get(pid);
    if (!cur || (t.incidence_count as number) > 0) {
      if (!cur) topicByPage.set(pid, { name: t.name as string, tier: (t.priority_tier as string) ?? null });
    }
  }

  const flagByQuestion = new Map<number, string | null>(
    (flags ?? []).map((f) => [f.question_id as number, (f.note as string | null) ?? null]),
  );

  const byId = new Map((questions ?? []).map((q) => [q.id as number, q]));
  const blocos = SIMULADO_BLOCOS.map((b) => ({
    key: b.key,
    label: b.label,
    questions: b.questionIds
      .map((id): ReviewQuestion | null => {
        const q = byId.get(id);
        if (!q) return null;
        const topic = topicByPage.get(q.page_id as number);
        return {
          id,
          question: q.question as string,
          answers: (q.answers as { text: string; correct: boolean }[]).map((a) => ({
            text: a.text,
            correct: Boolean(a.correct),
          })),
          media_url: (q.media_url as string | null) ?? null,
          explanation_html: (q.explanation_html as string | null) ?? null,
          edition: editionOf(q.question as string),
          topicName: topic?.name ?? null,
          tier: topic?.tier ?? null,
          flagged: flagByQuestion.has(id),
          note: flagByQuestion.get(id) ?? null,
        };
      })
      .filter((q): q is ReviewQuestion => q !== null),
  }));

  return <SimuladoReviewClient blocos={blocos} />;
}
