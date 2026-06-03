import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getSpecialtyAccent } from "@/components/content/specialty-icon";
import { ChevronRight, Check } from "lucide-react";
import Link from "next/link";
import { EditableText } from "@/components/admin/editable-text";

type TargetPage = {
  id: number;
  slug: string;
  type: string;
  specialty: { slug: string } | null;
};

type NavItemRow = {
  id: number;
  label: string;
  position: number;
  target_page: TargetPage | null;
};

type QuizStats = {
  total: number;          // total questions on the page
  attempted: number;      // distinct questions the user has answered at least once
  correctLatest: number;  // of those, how many were correct on the *most recent* attempt
};

// Card target types that record progress via lesson_completions (one "Concluir
// leitura" / per-section completion each). h5p-quiz is excluded — those cards
// surface accuracy via QuizMeta instead.
const LESSON_TYPES = new Set(["plain-content", "text-lesson", "audio-lesson"]);

export async function BlurbNavHubRenderer({ pageId }: { pageId: number }) {
  const admin = createAdminClient();

  const { data: items } = await admin
    .from("nav_items")
    .select(
      "id, label, position, target_page:pages!target_page_id(id, slug, type, specialty:specialties!specialty_id(slug))",
    )
    .eq("source_page_id", pageId)
    .not("target_page_id", "is", null)
    .order("position");

  const rows = (items ?? []) as unknown as NavItemRow[];
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">Conteúdo em preparação.</p>;
  }

  const quizPageIds = rows
    .map((r) => r.target_page)
    .filter((p): p is TargetPage => p !== null && p.type === "h5p-quiz")
    .map((p) => p.id);

  const lessonPageIds = rows
    .map((r) => r.target_page)
    .filter((p): p is TargetPage => p !== null && LESSON_TYPES.has(p.type))
    .map((p) => p.id);

  const [quizStatsByPage, completedPageIds] = await Promise.all([
    loadQuizStats(quizPageIds),
    loadCompletedLessonPages(lessonPageIds),
  ]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 sm:gap-4">
      {rows.map((item) => {
        const page = item.target_page;
        const href = page
          ? page.specialty
            ? `/app/${page.specialty.slug}/${page.slug}`
            : `/app/${page.slug}`
          : null;
        const accent = getSpecialtyAccent(page?.specialty?.slug);
        const stats = page && quizPageIds.includes(page.id) ? quizStatsByPage.get(page.id) : undefined;
        const completed = page ? completedPageIds.has(page.id) : false;

        return (
          <TopicCard
            key={item.id}
            navItemId={item.id}
            label={item.label}
            href={href}
            accent={accent}
            stats={stats}
            completed={completed}
          />
        );
      })}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function TopicCard({
  navItemId,
  label,
  href,
  accent,
  stats,
  completed,
}: {
  navItemId: number;
  label: string;
  href: string | null;
  accent: string;
  stats: QuizStats | undefined;
  completed?: boolean;
}) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-[width] duration-150 group-hover:w-1"
        style={{ background: accent }}
      />
      <div className="flex h-full flex-col justify-between gap-3 pl-4 pr-3 py-3.5 sm:py-4">
        <div className="flex items-start justify-between gap-2">
          <EditableText
            variant="plain"
            table="nav_items"
            id={navItemId}
            field="label"
            value={label}
            className="font-medium leading-snug text-foreground group-hover:text-brand transition-colors"
          />
          {href && (
            <ChevronRight
              size={16}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-muted-foreground/60 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
            />
          )}
        </div>
        {stats && <QuizMeta stats={stats} />}
        {completed && !stats && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand">
            <Check size={12} strokeWidth={3} aria-hidden="true" />
            Concluído
          </span>
        )}
      </div>
    </>
  );

  const wrapperClass =
    "group relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-all duration-150 hover:-translate-y-px hover:ring-foreground/20 hover:shadow-sm";

  if (!href) {
    return (
      <div className={wrapperClass + " opacity-60"} aria-disabled="true">
        {inner}
      </div>
    );
  }

  return (
    <Link href={href} className={wrapperClass}>
      {inner}
    </Link>
  );
}

function QuizMeta({ stats }: { stats: QuizStats }) {
  const { total, attempted, correctLatest } = stats;
  const pct = attempted > 0 ? Math.round((correctLatest / attempted) * 100) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums">
      <span className="text-muted-foreground">
        {total} {total === 1 ? "questão" : "questões"}
      </span>
      {pct !== null && (
        <>
          <span className="text-muted-foreground/40" aria-hidden="true">·</span>
          <span
            className={
              "rounded-full px-1.5 py-0.5 font-medium " +
              (pct >= 70
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : pct >= 50
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-300")
            }
            title={`${correctLatest} de ${attempted} respondidas`}
          >
            {pct}%
          </span>
          {attempted < total && (
            <span className="text-muted-foreground/70">
              {attempted}/{total}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ── Data: fully-completed lesson pages ───────────────────────────────────────
// A lesson-bearing target page counts as "Concluído" only when every one of its
// lessons is in lesson_completions (plain-content = 1 lesson, so a single
// "Concluir leitura" finishes it; text/audio lessons need all sections).
async function loadCompletedLessonPages(pageIds: number[]): Promise<Set<number>> {
  const done = new Set<number>();
  if (pageIds.length === 0 || USE_MOCK_DATA) return done;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return done;

    const admin = createAdminClient();
    const [{ data: lessons }, { data: completions }] = await Promise.all([
      admin.from("lessons").select("page_id").in("page_id", pageIds),
      admin
        .from("lesson_completions")
        .select("page_id")
        .eq("user_id", user.id)
        .in("page_id", pageIds),
    ]);

    const totalByPage = new Map<number, number>();
    for (const l of lessons ?? []) {
      const pid = l.page_id as number;
      totalByPage.set(pid, (totalByPage.get(pid) ?? 0) + 1);
    }
    const doneByPage = new Map<number, number>();
    for (const c of completions ?? []) {
      const pid = c.page_id as number;
      doneByPage.set(pid, (doneByPage.get(pid) ?? 0) + 1);
    }
    for (const [pid, total] of totalByPage) {
      if (total > 0 && (doneByPage.get(pid) ?? 0) >= total) done.add(pid);
    }
  } catch {
    // Non-fatal — cards just render without the completed badge.
  }

  return done;
}

// ── Data: quiz stats per page ────────────────────────────────────────────────

async function loadQuizStats(quizPageIds: number[]): Promise<Map<number, QuizStats>> {
  const out = new Map<number, QuizStats>();
  if (quizPageIds.length === 0) return out;

  const admin = createAdminClient();
  // Total questions per quiz page (always needed).
  const { data: questions } = await admin
    .from("quiz_questions")
    .select("id, page_id")
    .in("page_id", quizPageIds);

  const totalsByPage = new Map<number, number>();
  for (const q of questions ?? []) {
    const pid = q.page_id as number;
    totalsByPage.set(pid, (totalsByPage.get(pid) ?? 0) + 1);
  }
  for (const [pid, total] of totalsByPage) {
    out.set(pid, { total, attempted: 0, correctLatest: 0 });
  }

  // User attempts — only when authenticated and not in mock mode.
  if (USE_MOCK_DATA) return out;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return out;

    const { data: attempts } = await admin
      .from("quiz_attempts")
      .select("page_id, question_id, is_correct, created_at")
      .eq("user_id", user.id)
      .in("page_id", quizPageIds)
      .order("created_at", { ascending: false });

    // Per-page: latest is_correct value per question_id (DESC order means first wins).
    const latestByPage = new Map<number, Map<number, boolean>>();
    for (const a of attempts ?? []) {
      const pid = a.page_id as number;
      const qid = a.question_id as number;
      let bucket = latestByPage.get(pid);
      if (!bucket) {
        bucket = new Map();
        latestByPage.set(pid, bucket);
      }
      if (!bucket.has(qid)) bucket.set(qid, a.is_correct as boolean);
    }

    for (const [pid, bucket] of latestByPage) {
      const existing = out.get(pid);
      if (!existing) continue;
      let correct = 0;
      for (const ok of bucket.values()) if (ok) correct++;
      existing.attempted = bucket.size;
      existing.correctLatest = correct;
    }
  } catch {
    // Non-fatal — cards just render without attempt data.
  }

  return out;
}
