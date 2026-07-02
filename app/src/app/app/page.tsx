import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIEWAS_COOKIE, parseViewAs } from "@/lib/viewas";
import Link from "next/link";
import {
  ClipboardList, Layers, ScrollText, Target, Mic, Headphones,
  Lock, LockOpen, ChevronRight, type LucideIcon,
} from "lucide-react";
import { NotificationStrip } from "@/components/dashboard/notification-strip";
import { WaveformProgress } from "@/components/dashboard/waveform-progress";
import { HelpTip } from "@/components/ui/help-tip";
import { WelcomeCard } from "@/components/onboarding/welcome-card";
import { Coachmark } from "@/components/onboarding/coachmark";
import { getDerivedPlanForUser } from "@/lib/study-plan/fetch";
import { get60dAccess } from "@/lib/medhelp-60d";
import { getAudiocardsPlaylist } from "@/lib/audiocards/discovery";
import { SiteText } from "@/components/landing/site-text";
import type { Cohort } from "@/types/supabase";

type StudyType = {
  id: string;
  label: string;
  desc: string;
  Icon: LucideIcon;
  color: string;
  href: string | null;
  locked: boolean;
};

// Ordered by study modality: practice → read → listen → gated.
const STUDY_TYPES: StudyType[] = [
  { id: "questoes",   label: "Estudo por Questões", desc: "Questões estilo INEP comentadas",           Icon: ClipboardList, color: "var(--c-questoes)",   href: "/app/estudo-por-questoes", locked: false },
  { id: "flashcards", label: "Flashcards",          desc: "Revisão ativa com cartões",                 Icon: Layers,        color: "var(--c-flashcards)", href: "/app/flashcards",       locked: false },
  { id: "resumos",    label: "Resumos Narrativos",  desc: "Narrativas clínicas por especialidade",     Icon: ScrollText,    color: "var(--c-resumos)",    href: "/app/resumos",          locked: false },
  { id: "revalida-up", label: "Revalida Up",        desc: "Padrões de prova — decisão estratégica",    Icon: Target,        color: "var(--c-revalida)",   href: "/app/revalida-up",      locked: false },
  { id: "medvoice",   label: "MedVoice",            desc: "Áudios por tema — a Clínica Fala",          Icon: Mic,           color: "var(--c-medvoice)",   href: "/app/medvoice",         locked: false },
  { id: "audiocards", label: "AudioCards",          desc: "Revisão em áudio, cartão por cartão",       Icon: Headphones,    color: "var(--c-audiocards)", href: "/app/audiocards",       locked: false },
  { id: "medhelp60",  label: "MedHelp 60D",         desc: "Revisão intensiva — últimos 60 dias",       Icon: Lock,          color: "#7c3aed",             href: "/app/medhelp-60d",      locked: true  },
];

const DAY_NAMES   = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

// ── Greeting ──────────────────────────────────────────────────────────────────

function greetingFor(hour: number): string {
  if (hour >= 5  && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

// ── Continue card visualizations ──────────────────────────────────────────────

type ContentKind = "audio" | "flashcard" | "quiz" | "lesson" | "reading";

function getContentKind(type: string, trackSlug: string | null): ContentKind {
  if (trackSlug === "medvoice" || trackSlug === "audiocards" || type === "audio-lesson") return "audio";
  if (trackSlug === "flashcards") return "flashcard";
  if (type === "h5p-quiz") return "quiz";
  if (type === "text-lesson") return "lesson";
  return "reading";
}


function FlashcardViz() {
  return (
    <div style={{ position: "relative", width: 50, height: 38, flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 5, left: 4, right: 0, bottom: 0, background: "var(--surface-3)", borderRadius: 5, border: "1px solid rgba(255,255,255,0.06)" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 4, bottom: 5, background: "var(--surface-2)", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, padding: "0 9px" }}>
        <div style={{ width: "70%", height: 2, background: "var(--brand)", borderRadius: 1 }} />
        <div style={{ width: "45%", height: 2, background: "rgba(255,255,255,0.12)", borderRadius: 1 }} />
      </div>
    </div>
  );
}

function QuizViz() {
  const barWidths = [28, 20, 24, 16];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4.5, flexShrink: 0 }}>
      {(["A", "B", "C", "D"] as const).map((l, i) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, background: i === 0 ? "var(--brand)" : "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", color: i === 0 ? "var(--brand-fg)" : "var(--muted-foreground)", fontSize: 8.5, fontFamily: "var(--font-geist-mono)", fontWeight: 600 }}>
            {l}
          </div>
          <div style={{ height: 2, borderRadius: 1, background: i === 0 ? "var(--brand)" : "rgba(255,255,255,0.07)", width: barWidths[i] }} />
        </div>
      ))}
    </div>
  );
}

function LessonViz() {
  const sections = [1, 0.65, 0.85, 0.55, 0.75];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
      {sections.map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: i === 0 ? "var(--brand)" : "rgba(255,255,255,0.1)" }} />
          <div style={{ height: 2, borderRadius: 1, background: i === 0 ? "var(--brand)" : "rgba(255,255,255,0.1)", width: Math.round(w * 34) }} />
        </div>
      ))}
    </div>
  );
}

function ReadingViz() {
  const lines = [0.9, 0.7, 0.85, 0.6, 0.75];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
      {lines.map((w, i) => (
        <div key={i} style={{ height: 2.5, borderRadius: 2, background: i === 0 ? "color-mix(in srgb, var(--brand) 60%, transparent)" : "rgba(255,255,255,0.09)", width: Math.round(w * 44) }} />
      ))}
    </div>
  );
}

function ContinueCard({
  lastPage, lastTrack, lastPageSpec, cardStyle,
  lastPageQuizStats, lastPageLessonCount, lastPageCompletedCount,
  coveredSpecialtyIds, specialtiesAll,
}: {
  lastPage: { id: number; title: string; slug: string; type: string; specialty_id: number | null; track_id: number | null } | null;
  lastTrack: { id: number; name: string; slug: string } | null;
  lastPageSpec: { name: string; slug: string } | null | undefined;
  cardStyle: React.CSSProperties;
  lastPageQuizStats: { total: number; attempted: number; correct: number } | null;
  lastPageLessonCount: number;
  lastPageCompletedCount: number;
  coveredSpecialtyIds: Set<number>;
  specialtiesAll: { id: number; name: string }[];
}) {
  const baseStyle: React.CSSProperties = { ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", minHeight: 200 };

  const coverageRow = specialtiesAll.length > 0 && (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 12 }}>
      <span style={{ fontSize: 10, color: "var(--muted-3, #4a4a4a)", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600, flexShrink: 0 }}>
        Cobertura
      </span>
      <div style={{ display: "flex", gap: 3, flex: 1, flexWrap: "wrap" }}>
        {specialtiesAll.map((spec) => (
          <div
            key={spec.id}
            title={spec.name}
            style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: coveredSpecialtyIds.has(spec.id) ? "var(--brand)" : "var(--surface-3)",
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 10.5, color: "var(--muted-foreground)", fontFamily: "var(--font-geist-mono)", flexShrink: 0 }}>
        {coveredSpecialtyIds.size}/{specialtiesAll.length}
      </span>
    </div>
  );

  if (!lastPage) {
    return (
      <div style={baseStyle}>
        <div style={LABEL_STYLE}>Continuar</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 12 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5, textAlign: "center" }}>
            Acesse qualquer página<br />para retomar de onde parou.
          </div>
        </div>
        {coverageRow}
      </div>
    );
  }

  const kind = getContentKind(lastPage.type, lastTrack?.slug ?? null);
  const topLabel = (lastTrack?.name ?? lastPageSpec?.name ?? "").toUpperCase() || null;
  const subLabel = lastTrack && lastPageSpec ? lastPageSpec.name : null;
  const href = lastPageSpec ? `/app/${lastPageSpec.slug}/${lastPage.slug}` : `/app/${lastPage.slug}`;

  return (
    <div style={baseStyle}>
      <div style={LABEL_STYLE}>Continuar</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 12, flex: 1 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {topLabel && (
            <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--brand-2, #b0a4ff)", fontWeight: 600, marginBottom: 5 }}>
              {topLabel}
            </div>
          )}
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.01em", lineHeight: 1.3, color: "var(--foreground)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
            {lastPage.title}
          </div>
          {subLabel && (
            <div style={{ fontSize: 11.5, color: "var(--muted-2, #727272)", marginTop: 4 }}>{subLabel}</div>
          )}

          {/* Quiz progress bar */}
          {lastPageQuizStats && lastPageQuizStats.total > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ height: 3, background: "var(--surface-3)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, (lastPageQuizStats.attempted / lastPageQuizStats.total) * 100)}%`,
                  background: "var(--c-questoes)",
                  borderRadius: 2,
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                  {lastPageQuizStats.attempted}/{lastPageQuizStats.total} questões
                </span>
                {lastPageQuizStats.attempted > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--c-questoes)" }}>
                    {Math.round((lastPageQuizStats.correct / lastPageQuizStats.attempted) * 100)}% acerto
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        {kind !== "audio" && (
          kind === "flashcard" ? <FlashcardViz /> :
          kind === "quiz"      ? <QuizViz />      :
          kind === "lesson"    ? <LessonViz />    :
          <ReadingViz />
        )}
      </div>

      {/* Specialty coverage dots */}
      {coverageRow}

      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12 }}>
        {kind === "audio" ? <WaveformProgress pageId={lastPage.id} totalLessons={lastPageLessonCount} initialCompletedCount={lastPageCompletedCount} /> : <div style={{ flex: 1 }} />}
        <Link href={href} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          height: 32, padding: "0 14px", borderRadius: "var(--radius-sm)",
          background: "var(--brand)", color: "var(--brand-fg)",
          fontSize: 13, fontWeight: 500, textDecoration: "none", flexShrink: 0,
          animation: "dash-pulse-once 0.8s ease-out 1.4s both",
        }}>
          {kind === "audio" ? "▶ Continuar" : "Continuar →"}
        </Link>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtBr(n: number) {
  return n.toLocaleString("pt-BR");
}
function formatPauseDate(dateKey: string): string {
  const d = new Date(dateKey + "T12:00:00");
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}
function calcStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const unique = [...new Set(dates)].sort().reverse();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
  if (unique[0] !== today && unique[0] !== yesterday) return 0;
  let streak = 1;
  for (let i = 0; i < unique.length - 1; i++) {
    const diff = Math.round(
      (new Date(unique[i]).getTime() - new Date(unique[i + 1]).getTime()) / 86_400_000,
    );
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// ── Label style ───────────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "var(--muted-2, #727272)", fontWeight: 600,
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function MemberDashboardPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();

  let firstName = "Médico";
  let lastPageId: number | null = null;

  if (user) {
    try {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, last_page_id, last_page_at")
        .eq("id", user.id)
        .single();
      if (profile) {
        firstName = (profile.display_name as string | null)?.split(" ")[0] ?? "Médico";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lastPageId = (profile as any).last_page_id ?? null;
      }
    } catch {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      firstName = (profile?.display_name as string | null)?.split(" ")[0] ?? "Médico";
    }
  }

  // View-as mode
  const viewas = parseViewAs((await cookies()).get(VIEWAS_COOKIE)?.value);

  // Cohort context — varies by view-as mode. Drives the exam countdown, study
  // days, and cohort badge. The 60D unlock itself comes from get60dAccess()
  // below (single source of truth, shared with the nav + 60D page).
  let activeCohort: Cohort | null = null;
  let studyDays = 0;

  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString();

  if (viewas.type === "admin") {
    // Real user's own membership
    const { data: memberships } = user
      ? await admin
          .from("user_cohort_memberships")
          .select("cohort_id, joined_at, cohort:cohorts(*)")
          .eq("user_id", user.id)
      : { data: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cohortList: Cohort[] = ((memberships ?? []) as any[]).map((m) => m.cohort as Cohort).filter(Boolean);
    activeCohort =
      cohortList.find((c) => c.membership_starts_at <= today && c.membership_ends_at >= today) ??
      cohortList[cohortList.length - 1] ??
      null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membership = (memberships as any[])?.[0] as { joined_at: string } | undefined;
    studyDays = membership
      ? Math.max(0, Math.floor((nowMs - new Date(membership.joined_at).getTime()) / 86_400_000))
      : 0;
  } else if (viewas.type === "unlocked") {
    // Show everything as if unlocked — no cohort context needed
  } else {
    // Simulate a specific cohort's access
    const { data: simCohort } = await admin
      .from("cohorts")
      .select("*")
      .eq("slug", viewas.slug)
      .single();
    if (simCohort) activeCohort = simCohort as Cohort;
  }

  const { daysUntilUnlock } = await get60dAccess();

  // Exam dates are often a guess (Revalida dates shift by up to 60 days) — never
  // show a countdown/date until the exam board has actually confirmed it. An
  // unconfirmed cohort falls back to the same "—" + cohort-name display as one
  // with no date at all.
  const examDays = activeCohort?.test_date && activeCohort.date_confirmed
    ? Math.max(0, Math.ceil((new Date(activeCohort.test_date).getTime() - nowMs) / 86_400_000))
    : null;
  const examDateLabel = activeCohort?.test_date && activeCohort.date_confirmed
    ? fmtDate(new Date(activeCohort.test_date))
    : null;

  // Quiz attempts — include question_id for coverage + per-page stats, specialty_id for daily plan
  let quizAttempts: { is_correct: boolean; created_at: string; question_id: number; specialty_id: number | null }[] = [];
  if (user) {
    try {
      const { data } = await admin
        .from("quiz_attempts")
        .select("is_correct, created_at, question_id, specialty_id")
        .eq("user_id", user.id);
      quizAttempts = (data ?? []) as typeof quizAttempts;
    } catch { /* table not migrated yet */ }
  }

  // Derived study plan (from study_plans preferences + signals)
  const derivedPlan = user ? await getDerivedPlanForUser(user.id) : null;

  // Passive audio playlist — audiocards for the specialties studied in flashcards
  // recently. A standing card (never a notification), kept separate from the plan.
  const audiocardsPlaylist = user ? await getAudiocardsPlaylist(user.id) : [];

  // Daily plan signals — derived from today's quiz + lesson activity
  const todayKey = new Date().toISOString().split("T")[0];
  const todayAttempts = quizAttempts.filter((a) => a.created_at.startsWith(todayKey));
  const questionsTodayCount = todayAttempts.length;
  const specialtiesTodayCount = new Set(
    todayAttempts.map((a) => a.specialty_id).filter((s): s is number => s != null),
  ).size;
  let lessonsTodayCount = 0;
  if (user) {
    try {
      const { count } = await admin
        .from("lesson_completions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("completed_at", `${todayKey}T00:00:00`);
      lessonsTodayCount = count ?? 0;
    } catch { /* table not migrated yet */ }
  }

  const quizTotal = quizAttempts.length;
  const quizCorrect = quizAttempts.filter((a) => a.is_correct).length;
  const quizPct = quizTotal > 0 ? quizCorrect / quizTotal : 0;
  const activityDates = quizAttempts.map((a) => a.created_at.split("T")[0]);
  const streak = calcStreak(activityDates);

  // Specialties + tracks (tracks needed for last-page lookup)
  const [{ data: specialtiesAll }, { data: allTracksData }] = await Promise.all([
    admin.from("specialties").select("*").order("display_order"),
    admin.from("tracks").select("id, name, slug"),
  ]);
  const specById = new Map((specialtiesAll ?? []).map((s) => [s.id as number, s]));
  const allTracks = allTracksData ?? [];

  // Last page + track
  let lastPage: { id: number; title: string; slug: string; type: string; specialty_id: number | null; track_id: number | null } | null = null;
  let lastTrack: { id: number; name: string; slug: string } | null = null;
  if (lastPageId) {
    const { data } = await admin.from("pages").select("id, title, slug, type, specialty_id, track_id").eq("id", lastPageId).single();
    lastPage = data ?? null;
    if (lastPage?.track_id) {
      lastTrack = allTracks.find(t => t.id === lastPage!.track_id) ?? null;
    }
  }
  const lastPageSpec = lastPage?.specialty_id ? specById.get(lastPage.specialty_id) : null;

  // Lesson count for audio/text-lesson pages (used by WaveformProgress on dashboard)
  let lastPageLessonCount = 0;
  let lastPageCompletedCount = 0;
  if (lastPage && (lastPage.type === "text-lesson" || lastPage.type === "audio-lesson")) {
    const { count } = await admin
      .from("lessons")
      .select("*", { count: "exact", head: true })
      .eq("page_id", lastPage.id);
    lastPageLessonCount = count ?? 0;

    if (user) {
      try {
        const { count: doneCount } = await admin
          .from("lesson_completions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("page_id", lastPage.id);
        lastPageCompletedCount = doneCount ?? 0;
      } catch { /* table not migrated yet */ }
    }
  }

  // Specialty coverage + last-page quiz stats (parallel, from existing quiz_attempts data)
  let lastPageQuizStats: { total: number; attempted: number; correct: number } | null = null;
  const coveredSpecialtyIds = new Set<number>();

  if (user && quizAttempts.length > 0) {
    const attemptedQIds = [...new Set(quizAttempts.map((a) => a.question_id).filter(Boolean))];

    const [coverageQsResult, lastPageQsResult] = await Promise.all([
      attemptedQIds.length > 0
        ? admin.from("quiz_questions").select("id, page_id").in("id", attemptedQIds)
        : Promise.resolve({ data: [] as { id: number; page_id: number }[] }),
      lastPage?.type === "h5p-quiz"
        ? admin.from("quiz_questions").select("id").eq("page_id", lastPage.id)
        : Promise.resolve({ data: [] as { id: number }[] }),
    ]);

    // Build specialty coverage: quiz_questions → pages → specialty_id
    const pageIds = [...new Set((coverageQsResult.data ?? []).map((q) => q.page_id).filter(Boolean))];
    if (pageIds.length > 0) {
      const { data: specPages } = await admin
        .from("pages")
        .select("specialty_id")
        .in("id", pageIds)
        .not("specialty_id", "is", null);
      for (const p of (specPages ?? [])) {
        if (p.specialty_id) coveredSpecialtyIds.add(p.specialty_id);
      }
    }

    // Last-page quiz stats
    if (lastPage?.type === "h5p-quiz" && (lastPageQsResult.data ?? []).length > 0) {
      const pageQIdSet = new Set((lastPageQsResult.data ?? []).map((q) => q.id as number));
      const pageAttempts = quizAttempts.filter((a) => pageQIdSet.has(a.question_id));
      const attempted = new Set(pageAttempts.map((a) => a.question_id)).size;
      const correct = pageAttempts.filter((a) => a.is_correct).length;
      lastPageQuizStats = { total: pageQIdSet.size, attempted, correct };
    }
  }

  const now = new Date();
  const dayLabel = `${DAY_NAMES[now.getDay()].toLowerCase()}, ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
  const greeting = greetingFor(now.getHours());

  const cohortBadge =
    viewas.type === "unlocked"
      ? "Tudo liberado"
      : activeCohort?.name?.replace(/revalida-/i, "Turma ").replace(/-(\d+)$/, "·$1");

  // Make MedHelp 60D card dynamic based on unlock state
  const is60dUnlocked = daysUntilUnlock === 0;
  const studyTypes = STUDY_TYPES.map((t) =>
    t.id === "medhelp60"
      ? { ...t, locked: !is60dUnlocked, Icon: is60dUnlocked ? LockOpen : Lock, color: is60dUnlocked ? "#7c3aed" : "#6b7280" }
      : t,
  );

  const cardAlt: React.CSSProperties = { background: "var(--surface-2)", borderRadius: "var(--radius)" };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }} className="px-[10px] sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-16 sm:pb-20">

      {/* ── HERO — compact context bar ──
           Greeting is demoted into the eyebrow line; the big-type weight moves
           off the (decorative) greeting and onto the countdown, the one number
           that actually motivates. This frees ~190px so the Plano + Continuar
           cards below become the page's real hero (the "resume action"). */}
      <section className="mb-5 sm:mb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-12">

          {/* Greeting + context — one compact line */}
          <div className="min-w-0">
            <div style={{
              ...LABEL_STYLE,
              display: "flex", alignItems: "center", gap: 9,
              letterSpacing: ".16em", fontSize: 11, flexWrap: "wrap",
            }}>
              <span aria-hidden="true" style={{ width: 22, height: 1, background: "var(--muted-foreground)", display: "inline-block", flexShrink: 0 }} />
              <span style={{ color: "var(--foreground)", fontWeight: 700 }}>{greeting}, {firstName}</span>
              <span aria-hidden="true" style={{ opacity: .4 }}>·</span>
              <span>{dayLabel}</span>
              {cohortBadge && (
                <span style={{
                  display: "inline-flex", alignItems: "center",
                  height: 18, padding: "0 8px", marginLeft: 2,
                  background: "color-mix(in srgb, var(--brand) 12%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--brand) 28%, transparent)",
                  borderRadius: 999, fontSize: 10, fontWeight: 600, letterSpacing: ".06em",
                  color: "var(--brand)",
                }}>
                  {cohortBadge}
                </span>
              )}
              {cohortBadge && viewas.type !== "unlocked" && (
                <HelpTip label="O que é a sua turma?" side="bottom">
                  A sua turma é o ciclo do Revalida em que você está inscrito. Ela define a
                  contagem regressiva até a prova e a data em que o MedHelp 60D é liberado para você.
                </HelpTip>
              )}
            </div>
          </div>

          {/* Stats readout — countdown leads, study + streak follow */}
          <div className="flex items-end gap-7 sm:gap-9 justify-start lg:justify-end" style={{ flexShrink: 0 }}>
            {/* Countdown — the one motivating number */}
            <div className="text-left lg:text-right">
              <div style={LABEL_STYLE}>Até a prova</div>
              <div className="tabular-nums" style={{
                fontSize: "clamp(32px, 4.4vw, 52px)",
                fontWeight: 600, letterSpacing: "-.045em", lineHeight: 0.9,
                color: "var(--brand)", marginTop: 4,
              }}>
                {examDays != null ? fmtBr(examDays) : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 5, letterSpacing: ".03em" }}>
                {examDateLabel ?? activeCohort?.name ?? "dias"}
              </div>
            </div>

            {/* Study days + streak — supporting */}
            {[
              { label: "De estudo", value: fmtBr(studyDays), sub: studyDays === 1 ? "dia"      : "dias",     color: "var(--foreground)" },
              { label: "Sequência", value: fmtBr(streak),    sub: streak === 1    ? "dia"      : "seguidos", color: "var(--c-pop)"       },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="text-left lg:text-right">
                <div style={LABEL_STYLE}>{label}</div>
                <div className="tabular-nums" style={{
                  fontSize: "clamp(22px, 2.6vw, 32px)",
                  fontWeight: 500, letterSpacing: "-.04em", lineHeight: 0.95,
                  color, marginTop: 5,
                }}>
                  {value}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, letterSpacing: ".03em" }}>
                  {sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WELCOME (first-run, dismissable) ── */}
      <WelcomeCard />

      {/* Points at the header "Sua jornada" completion meter. */}
      <Coachmark coachKey="progresso" />

      {/* ── NOTIFICATIONS ── */}
      <NotificationStrip />

      {/* ── PLAN + CONTINUE ── */}
      <section className="grid md:grid-cols-[1fr_2fr] gap-[10px] sm:gap-[14px] mb-[10px] sm:mb-[14px]">

        {/* Plano de hoje */}
        <div style={{
          background: "var(--brand)", color: "var(--brand-fg)",
          borderRadius: "var(--radius)", padding: "20px 22px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          minHeight: 200, position: "relative", overflow: "hidden",
        }}>
          {/* Decorative grid overlay */}
          <svg aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.07, pointerEvents: "none" }}>
            <defs>
              <pattern id="plan-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                <path d="M 16 0 L 0 0 0 16" fill="none" stroke="white" strokeWidth="0.6"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#plan-grid)" />
          </svg>
          {/* Date watermark */}
          <div aria-hidden="true" style={{
            position: "absolute", right: 10, bottom: -16,
            fontSize: 140, fontWeight: 800, lineHeight: 1,
            color: "rgba(255,255,255,0.07)", letterSpacing: "-0.06em",
            pointerEvents: "none", userSelect: "none",
          }}>
            {now.getDate()}
          </div>

          {/* Header — clickable, goes to /app/plano */}
          <Link
            href="/app/plano"
            style={{
              position: "relative",
              display: "block",
              textDecoration: "none",
              color: "inherit",
            }}
            className="hover:opacity-90 transition-opacity"
          >
            <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", fontWeight: 600, opacity: .55 }}>Plano de hoje</div>
            <h3 style={{ margin: "6px 0 0", fontSize: 22, letterSpacing: "-.025em", lineHeight: 1.05, fontWeight: 600 }}>
              {derivedPlan?.paused ? "Plano em pausa" : "Estude com foco"}
            </h3>
          </Link>

          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
            {derivedPlan?.paused ? (
              <p style={{ fontSize: 12.5, opacity: 0.75, lineHeight: 1.5 }}>
                Retoma {derivedPlan.nextAvailableDate ? `em ${formatPauseDate(derivedPlan.nextAvailableDate)}` : "quando você quiser"}.
              </p>
            ) : derivedPlan && derivedPlan.items.length > 0 ? (
              <>
                {derivedPlan.items.slice(0, 3).map((item, i) => (
                  <Link
                    key={i}
                    href={item.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12.5,
                      lineHeight: 1.3,
                      color: "rgba(255,255,255,0.92)",
                      textDecoration: "none",
                      padding: "5px 0",
                    }}
                  >
                    <div style={{
                      width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.7)", flexShrink: 0,
                    }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {item.title}
                    </span>
                  </Link>
                ))}
                {derivedPlan.items.length > 3 && (
                  <p style={{ fontSize: 11, opacity: 0.55, margin: 0 }}>
                    + {derivedPlan.items.length - 3} mais
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12.5, opacity: 0.75, lineHeight: 1.5 }}>
                Você cobriu o material das suas prioridades. Explore outras especialidades quando quiser.
              </p>
            )}
          </div>

          {/* CTA button — always visible regardless of plan state */}
          <Link
            href="/app/plano"
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginTop: 14,
              padding: "9px 16px",
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#fff",
              textDecoration: "none",
              alignSelf: "flex-start",
            }}
            className="hover:bg-white/25 transition-colors"
          >
            {derivedPlan?.paused
              ? "Gerenciar plano"
              : derivedPlan && derivedPlan.items.length > 0
                ? "Ver plano completo"
                : "Configurar meu plano"}
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* Continue — takes 2/3 of the row */}
        <ContinueCard
          lastPage={lastPage}
          lastTrack={lastTrack}
          lastPageSpec={lastPageSpec}
          cardStyle={cardAlt}
          lastPageQuizStats={lastPageQuizStats}
          lastPageLessonCount={lastPageLessonCount}
          lastPageCompletedCount={lastPageCompletedCount}
          coveredSpecialtyIds={coveredSpecialtyIds}
          specialtiesAll={(specialtiesAll ?? []).filter((s) => s.slug !== "outros") as { id: number; name: string }[]}
        />
      </section>

      {/* ── STATS STRIP ── */}
      <div style={{ background: "var(--surface-1)", borderRadius: "var(--radius)", overflow: "hidden", marginBottom: 10 }}>
        <div
          className="grid grid-cols-2 sm:grid-cols-4"
          style={{ gap: 1, background: "var(--surface-2)" }}
        >
          {[
            { label: "Acerto",    value: quizTotal > 0 ? `${Math.round(quizPct * 100)}%` : "—", sub: quizTotal > 0 ? `${fmtBr(quizCorrect)} de ${fmtBr(quizTotal)}` : "nenhuma questão ainda" },
            { label: "Questões",  value: fmtBr(quizTotal),                                        sub: quizTotal === 1 ? "respondida" : "respondidas"                                          },
            { label: "Sequência", value: fmtBr(streak),                                            sub: streak === 1 ? "dia seguido" : "dias seguidos"                                         },
            { label: "Estudo",    value: fmtBr(studyDays),                                         sub: studyDays === 1 ? "dia no plano" : "dias no plano"                                     },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ background: "var(--surface-1)", padding: "16px 20px" }}>
              <div style={LABEL_STYLE}>{label}</div>
              <div className="tabular-nums" style={{
                fontSize: "clamp(24px, 3.5vw, 36px)",
                fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1,
                color: "var(--foreground)", marginTop: 5,
              }}>
                {value}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-3, #4a4a4a)", marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{
          padding: "10px 20px",
          display: "flex", justifyContent: "flex-end",
          borderTop: "1px solid var(--surface-2)",
        }}>
          <Link
            href="/app/relatorio"
            style={{ fontSize: 13, color: "var(--muted-foreground)", textDecoration: "none" }}
            className="hover:text-foreground transition-colors"
          >
            Ver relatório completo →
          </Link>
        </div>
      </div>

      {/* ── ESCOLHA COMO ESTUDAR — 6 type cards ── */}
      <div style={{ marginTop: "clamp(28px, 5vw, 48px)", paddingTop: 20, borderTop: "1px solid var(--surface-2)" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={LABEL_STYLE}>Escolha como estudar</div>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--muted-foreground)", maxWidth: "54ch", lineHeight: 1.5 }}>
            Cada seção cobre todas as especialidades. Escolha um tipo e depois selecione a especialidade.
          </p>
        </div>

        <Coachmark coachKey="dash-study-types" />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {studyTypes.map((type, i) => {
            const cardStyle: React.CSSProperties = {
              borderRadius: "var(--radius)",
              padding: "22px 20px",
              display: "flex", flexDirection: "column", gap: 14,
              textDecoration: "none", minHeight: 152,
              background: type.locked
                ? "var(--surface-1)"
                : `linear-gradient(140deg, color-mix(in srgb, ${type.color} 92%, #1a0030) 0%, ${type.color} 100%)`,
              outline: type.locked ? "1px solid var(--surface-2)" : "none",
              outlineOffset: "-1px",
              opacity: type.locked ? 0.55 : 1,
              animation: `dash-fade-up 0.45s cubic-bezier(.16,1,.3,1) both`,
              animationDelay: `${i * 45}ms`,
              position: "relative", overflow: "hidden",
            };

            const inner = (
              <>
                <type.Icon
                  size={22}
                  strokeWidth={1.6}
                  style={{ color: type.locked ? "var(--muted-foreground)" : "rgba(255,255,255,0.85)", flexShrink: 0 }}
                />
                <div>
                  <div style={{
                    fontSize: "clamp(14px, 2vw, 16px)", fontWeight: 700,
                    letterSpacing: "-.02em", lineHeight: 1.2,
                    color: type.locked ? "var(--muted-foreground)" : "#fff",
                  }}>
                    {type.label}
                  </div>
                  <div style={{
                    fontSize: 12, marginTop: 6, lineHeight: 1.4,
                    color: type.locked ? "var(--muted-3, #4a4a4a)" : "rgba(255,255,255,0.62)",
                  }}>
                    {type.locked && daysUntilUnlock != null
                      ? `Libera em ${fmtBr(daysUntilUnlock)} dias`
                      : type.desc}
                  </div>
                </div>
              </>
            );

            if (type.locked || !type.href) {
              return (
                <div key={type.id} style={cardStyle}>
                  {inner}
                  {type.id === "medhelp60" && (
                    <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1 }}>
                      <HelpTip label="Sobre o MedHelp 60D">
                        Revisão intensiva dos últimos 60 dias antes da prova. Abre
                        automaticamente quando a sua data de prova se aproxima — não é
                        preciso fazer nada, o cadeado se solta sozinho.
                      </HelpTip>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <Link key={type.id} href={type.href} style={cardStyle}
                className="transition-opacity hover:opacity-90">
                {inner}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── REVISÃO PASSIVA EM ÁUDIO — standing playlist (not a notification) ──
           Surfaces audiocards for the specialties studied in flashcards recently.
           A passive aid reached AROUND the study loop — never the thing that
           completes the day, never a review item. */}
      {audiocardsPlaylist.length > 0 && (
        <div style={{ marginTop: "clamp(28px, 5vw, 48px)", paddingTop: 20, borderTop: "1px solid var(--surface-2)" }}>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={LABEL_STYLE}>
                <SiteText as="span" k="audiocards.playlist.title" fallback="Revisão passiva em áudio" />
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--muted-foreground)", maxWidth: "54ch", lineHeight: 1.5 }}>
                <SiteText
                  as="span"
                  k="audiocards.playlist.subtitle"
                  fallback="Os temas que você estudou nos flashcards, agora em áudio — para fixar no trânsito ou na academia. É só ouvir."
                />
              </p>
            </div>
            <Link
              href="/app/audiocards"
              style={{ fontSize: 13, color: "var(--muted-foreground)", textDecoration: "none", flexShrink: 0 }}
              className="hover:text-foreground transition-colors"
            >
              Ver tudo →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {audiocardsPlaylist.map((item) => (
              <Link
                key={item.pageId}
                href={item.href}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "var(--surface-1)", borderRadius: "var(--radius)",
                  padding: "14px 16px", textDecoration: "none",
                  outline: "1px solid var(--surface-2)", outlineOffset: "-1px",
                  minHeight: 44,
                }}
                className="hover:bg-surface-2 transition-colors"
              >
                <span style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                  background: "color-mix(in srgb, var(--c-audiocards) 16%, transparent)",
                  color: "var(--c-audiocards)",
                }}>
                  <Headphones size={18} strokeWidth={1.8} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em", color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.specialtyName}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 3, background: "var(--surface-3)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${item.pctListened}%`, background: "var(--c-audiocards)", borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-geist-mono)", flexShrink: 0 }}>
                      {item.pctListened > 0 ? `${item.pctListened}% ouvido` : "Ouvir"}
                    </span>
                  </div>
                </div>
                <span aria-hidden style={{ color: "var(--c-audiocards)", fontSize: 13, flexShrink: 0 }}>▶</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── ESTUDE POR ESPECIALIDADE ── */}
      <div style={{ marginTop: "clamp(28px, 5vw, 48px)", paddingTop: 20, borderTop: "1px solid var(--surface-2)" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={LABEL_STYLE}>Estude por especialidade</div>
          <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--muted-foreground)", maxWidth: "54ch", lineHeight: 1.5 }}>
            Acesse todo o conteúdo de uma especialidade — questões, resumos, áudios e mais — em um só lugar.
          </p>
        </div>

        <Coachmark coachKey="dash-specialties" />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {(specialtiesAll ?? []).filter((s) => s.slug !== "outros").map((spec, i) => (
            <Link
              key={spec.id}
              href={`/app/${spec.slug}`}
              style={{
                background: "var(--surface-1)",
                borderRadius: "var(--radius)",
                padding: "18px 16px",
                display: "flex", flexDirection: "column", gap: 10,
                textDecoration: "none",
                outline: "1px solid var(--surface-2)", outlineOffset: "-1px",
                transition: "background .12s",
                animation: `dash-fade-up 0.45s cubic-bezier(.16,1,.3,1) both`,
                animationDelay: `${i * 35}ms`,
              }}
              className="hover:bg-surface-2 group"
            >
              {(spec as { emoji?: string }).emoji && (
                <span style={{ fontSize: 24, lineHeight: 1 }}>{(spec as { emoji?: string }).emoji}</span>
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em", color: "var(--foreground)", lineHeight: 1.25 }}>
                  {spec.name}
                </div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 500, color: "var(--brand)" }}>
                  Ver conteúdo <ChevronRight size={10} strokeWidth={2.5} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
