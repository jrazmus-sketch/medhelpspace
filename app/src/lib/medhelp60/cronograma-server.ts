import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayKeyBR } from "@/lib/br-date";
import { settingsFromRow } from "@/lib/study-plan/settings";
import { fetchTopicContent } from "@/lib/study-plan/topic-content";
import { getStudyPlanPrefs } from "@/lib/study-plan/fetch";
import { countDays } from "@/lib/study-plan/availability";
import { themeSlug } from "@/lib/memorecards-shared";
import {
  buildCronograma, d60SettingsOf, matchFormulaPages,
  type D60Cronograma, type D60SimuladoInput, type D60Unit,
} from "./cronograma";

type Admin = ReturnType<typeof createAdminClient>;

export type D60Loaded = {
  cronograma: D60Cronograma;
  /** The exam date used is the turma's; false = the board has not confirmed it (shown as an estimate). */
  examConfirmed: boolean;
  /** A staff account without a turma: the schedule of the next turma, as a preview. */
  preview: boolean;
  checked: string[];
  todayKey: string;
  /** The student's availability, the same one Meu Plano uses. */
  dailyMinutes: number;
  studyDays: number;
  weeklyMinutes: number;
};

/** The turma whose exam date the 60 days count back from: the student's own, else (staff) the next one ahead. */
async function examOf(admin: Admin, userId: string, todayKey: string) {
  const { data } = await admin.from("user_cohort_memberships")
    .select("cohort:cohorts(test_date, date_confirmed, membership_starts_at, membership_ends_at)").eq("user_id", userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map((m) => m.cohort).filter((c) => c?.test_date);
  const now = new Date().toISOString();
  const own = rows.find((c) => c.membership_starts_at <= now && c.membership_ends_at >= now) ?? rows[rows.length - 1];
  if (own) return { examKey: String(own.test_date).slice(0, 10), confirmed: !!own.date_confirmed, preview: false };
  const { data: next } = await admin.from("cohorts").select("test_date, date_confirmed")
    .eq("active", true).gt("test_date", todayKey).order("test_date").limit(1).maybeSingle();
  if (!next?.test_date) return null;
  return { examKey: String(next.test_date).slice(0, 10), confirmed: !!next.date_confirmed, preview: true };
}

/**
 * Everything the MedHelp 60D schedule needs, for one student. Returns null when no exam date is known.
 * The schedule is rebuilt on every load from what exists — only the ticks are stored.
 */
export async function loadD60(userId: string, admin: Admin = createAdminClient()): Promise<D60Loaded | null> {
  const todayKey = todayKeyBR();
  const exam = await examOf(admin, userId, todayKey);
  if (!exam) return null;

  const pagesOf = (view: string) =>
    admin.from("pages").select("id, slug, title, type, status, specialty_id").eq("view", view).neq("type", "blurb-nav-hub");
  const [topicsRes, specsRes, tc, formulaRes, ruRes, quizRes, resumoRes, memoreRes, simRes, countsRes, settingsRes, checksRes, plan] =
    await Promise.all([
      admin.from("topics").select("id, name, slug, specialty_id, incidence_count, priority_tier"),
      admin.from("specialties").select("id, name, slug"),
      fetchTopicContent(admin),
      pagesOf("formula"), pagesOf("revalida-up"), pagesOf("quiz"), pagesOf("resumos"),
      admin.from("memorecard_items").select("topic_page_id"),
      admin.from("pages").select("id, slug, title").eq("content_module_id", 1).eq("view", "simulados").eq("type", "h5p-quiz")
        .eq("status", "publish").like("slug", "simulado-100q-%").order("slug"),
      admin.from("quiz_page_question_counts").select("page_id, question_count"),
      admin.from("study_plan_settings").select("*").maybeSingle(),
      admin.from("medhelp60_checks").select("item_key").eq("user_id", userId),
      getStudyPlanPrefs(userId),
    ]);

  type Page = { id: number; slug: string; title: string; type: string; status: string; specialty_id: number | null };
  const specs = new Map((specsRes.data ?? []).map((s) => [Number(s.id), s as { id: number; name: string; slug: string }]));
  const topics = (topicsRes.data ?? []).map((t) => ({ ...t, id: Number(t.id) })) as
    { id: number; name: string; slug: string; specialty_id: number | null; incidence_count: number; priority_tier: string | null }[];
  const pageById = new Map<number, Page>();
  for (const r of [formulaRes, ruRes, quizRes, resumoRes]) for (const p of (r.data ?? []) as Page[]) pageById.set(Number(p.id), { ...p, id: Number(p.id) });

  // topic → the addresses of its own pages (for the Fórmula match) and its Revalida Up page (for the MemoreCards)
  const topicPages: { topicId: number; slug: string }[] = [];
  const ruOfTopic = new Map<number, Page>();
  for (const c of tc.data) {
    const p = c.page_id == null ? undefined : pageById.get(Number(c.page_id));
    if (!p || p.status !== "publish") continue;
    topicPages.push({ topicId: Number(c.topic_id), slug: p.slug });
    if (c.resource_type === "revalida_up" && !ruOfTopic.has(Number(c.topic_id))) ruOfTopic.set(Number(c.topic_id), p);
  }
  const formulaPages = ((formulaRes.data ?? []) as Page[])
    .map((p) => ({ ...p, id: Number(p.id) }))
    .filter((p) => p.status === "publish" && p.slug !== "formula-medhelp");
  const { byTopic, unmatched } = matchFormulaPages(formulaPages, topics, topicPages);
  const cards = new Map<number, number>();
  for (const m of memoreRes.data ?? []) cards.set(Number(m.topic_page_id), (cards.get(Number(m.topic_page_id)) ?? 0) + 1);
  const specSlug = (id: number | null) => (id == null ? "geral" : specs.get(Number(id))?.slug ?? "geral");
  const specName = (id: number | null) => (id == null ? "" : specs.get(Number(id))?.name ?? "");

  const units: D60Unit[] = topics.map((t) => {
    const f = byTopic.get(t.id);
    const ru = ruOfTopic.get(t.id);
    const n = ru ? cards.get(ru.id) ?? 0 : 0;
    return {
      topicId: t.id, name: t.name, specialtyName: specName(t.specialty_id), frequency: Number(t.incidence_count) || 0, tier: t.priority_tier,
      formula: f ? { pageId: f.id, href: `/app/${specSlug(f.specialty_id)}/${f.slug}` } : null,
      memore: ru && n > 0 ? { pageId: ru.id, href: `/app/memorecards/${specSlug(ru.specialty_id)}?tema=${themeSlug(ru.slug)}`, cards: n } : null,
    };
  });
  for (const f of unmatched) {
    units.push({
      topicId: null, name: f.title.replace(/\s+F[oó]rmula$/i, ""), specialtyName: specName(f.specialty_id), frequency: 0, tier: null,
      formula: { pageId: f.id, href: `/app/${specSlug(f.specialty_id)}/${f.slug}` }, memore: null,
    });
  }

  const counts = new Map((countsRes.data ?? []).map((r) => [Number(r.page_id), Number(r.question_count)]));
  const simulados: D60SimuladoInput[] = (simRes.data ?? []).map((p) => ({
    n: Number(String(p.slug).replace("simulado-100q-", "")), title: String(p.title), href: `/app/geral/${p.slug}`,
    questions: counts.get(Number(p.id)) ?? 0,
  })).filter((s) => Number.isInteger(s.n) && s.n >= 1);

  const row = (settingsRes.data ?? null) as Record<string, unknown> | null;
  const settings = d60SettingsOf(settingsFromRow(row));
  const studyDays = countDays(plan.prefs.available_days & ~plan.prefs.recurring_off_days);
  return {
    cronograma: buildCronograma({ examKey: exam.examKey, units, simulados, settings }),
    examConfirmed: exam.confirmed, preview: exam.preview,
    checked: (checksRes.data ?? []).map((r) => String(r.item_key)),
    todayKey,
    dailyMinutes: plan.prefs.daily_minutes, studyDays, weeklyMinutes: plan.prefs.daily_minutes * studyDays,
  };
}
