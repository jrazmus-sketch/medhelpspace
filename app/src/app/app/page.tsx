import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import {
  ClipboardList, ScrollText, Mic, FlaskConical, Headphones,
  Lock, ChevronRight, type LucideIcon,
} from "lucide-react";
import { NotificationStrip } from "@/components/dashboard/notification-strip";
import type { Cohort, CohortModuleAccess } from "@/types/supabase";

// ── Config ────────────────────────────────────────────────────────────────────

const MEDHELP_60D_MODULE_ID = 1;

type StudyTab = {
  id: string;
  label: string;
  Icon: LucideIcon;
  color: string;
  view: string | null;
  trackSlug: string | null;
  locked: boolean;
};

const STUDY_TABS: StudyTab[] = [
  { id: "questoes",   label: "Questões",    Icon: ClipboardList, color: "var(--c-questoes)",           view: "simulados", trackSlug: null,         locked: false },
  { id: "resumos",    label: "Resumos",     Icon: ScrollText,    color: "var(--c-resumos)",            view: "resumos",   trackSlug: null,         locked: false },
  { id: "medvoice",   label: "MedVoice",    Icon: Mic,           color: "var(--c-medvoice)",           view: null,        trackSlug: "medvoice",   locked: false },
  { id: "formula",    label: "Fórmula",     Icon: FlaskConical,  color: "var(--c-formula)",            view: "formula",   trackSlug: null,         locked: false },
  { id: "audiocards", label: "AudioCards",  Icon: Headphones,    color: "var(--c-audiocards)",         view: null,        trackSlug: "audiocards", locked: false },
  { id: "medhelp60",  label: "MedHelp 60D", Icon: Lock,          color: "var(--c-medhelp60, #3a4055)", view: null,        trackSlug: null,         locked: true  },
];

const VALID_TAB_IDS = STUDY_TABS.map(t => t.id);

const DAY_NAMES   = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

// ── Greeting rotation ─────────────────────────────────────────────────────────

const GREETINGS: { lines: [string, string]; from: number; to: number; maxDays?: number }[] = [
  // Urgência — últimos 7 dias
  { lines: ["7 dias.",        "Foco total."],        from: 0,  to: 24, maxDays: 7  },
  { lines: ["Última semana.", "É agora."],           from: 0,  to: 24, maxDays: 7  },
  // Urgência — últimos 30 dias
  { lines: ["Reta final,",    "doctor."],            from: 0,  to: 24, maxDays: 30 },
  { lines: ["30 dias.",       "Bora revisar."],      from: 0,  to: 24, maxDays: 30 },
  { lines: ["Reta final.",    "Vai fundo."],         from: 0,  to: 24, maxDays: 30 },
  // Madrugada (0–5)
  { lines: ["Ainda acordado?", "Respeito."],         from: 0,  to: 6  },
  { lines: ["Dedicação",       "total."],            from: 0,  to: 6  },
  // Manhã (6–11)
  { lines: ["Bom dia,",        "doctor."],           from: 6,  to: 12 },
  { lines: ["Manhã de",        "revisão."],          from: 6,  to: 12 },
  { lines: ["Bom dia!",        "Bora estudar."],     from: 6,  to: 12 },
  // Tarde (12–17)
  { lines: ["Boa tarde,",      "doctor."],           from: 12, to: 18 },
  { lines: ["Tarde boa",       "para revisar."],     from: 12, to: 18 },
  { lines: ["Continue",        "esta tarde."],       from: 12, to: 18 },
  // Noite (18–23)
  { lines: ["Boa noite,",      "doctor."],           from: 18, to: 24 },
  { lines: ["Noite de",        "estudo."],           from: 18, to: 24 },
  { lines: ["Bora revisar",    "esta noite."],       from: 18, to: 24 },
  // Anytime
  { lines: ["Bom te ver",      "de volta."],         from: 0,  to: 24 },
  { lines: ["Que bom",         "te ver aqui."],      from: 0,  to: 24 },
  { lines: ["De volta",        "aos estudos."],      from: 0,  to: 24 },
  { lines: ["Vamos nessa,",    "doctor."],           from: 0,  to: 24 },
];

function pickGreeting(now: Date, examDays: number | null): [string, string] {
  const hour = now.getHours();
  const dayIndex = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const urgency = examDays !== null ? (examDays <= 7 ? 7 : examDays <= 30 ? 30 : 0) : 0;
  const pool = GREETINGS.filter((g) => {
    if (hour < g.from || hour >= g.to) return false;
    if (g.maxDays !== undefined) return g.maxDays === urgency;
    return urgency === 0;
  });
  const safe = pool.length > 0 ? pool : GREETINGS.filter(g => g.from === 0 && g.to === 24 && !g.maxDays);
  return safe[dayIndex % safe.length].lines;
}

// ── Animation helpers ─────────────────────────────────────────────────────────

function cardEnter(delay = 0): React.CSSProperties {
  return {
    animation: `dash-fade-up 0.45s cubic-bezier(.16,1,.3,1) both`,
    animationDelay: `${delay}ms`,
  };
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

function WaveformViz() {
  const bars = [4, 9, 6, 14, 8, 11, 5, 13, 7, 10, 4, 12, 8, 6, 11, 9, 14, 5, 7, 10, 8, 13, 6, 9, 11];
  const progress = 0.48;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2.5, height: 20 }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            width: 3, height: h, maxHeight: 20, borderRadius: 2, flexShrink: 0,
            background: i / bars.length < progress ? "var(--brand)" : "rgba(255,255,255,0.1)",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 1, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress * 100}%`, background: "var(--brand)", borderRadius: 1 }} />
        </div>
        <span style={{ fontSize: 10.5, color: "var(--muted-2, #727272)", fontFamily: "var(--font-geist-mono)", fontWeight: 500, flexShrink: 0 }}>
          {Math.round(progress * 100)}%
        </span>
      </div>
    </div>
  );
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
}: {
  lastPage: { id: number; title: string; slug: string; type: string; specialty_id: number | null; track_id: number | null } | null;
  lastTrack: { id: number; name: string; slug: string } | null;
  lastPageSpec: { name: string; slug: string } | null | undefined;
  cardStyle: React.CSSProperties;
}) {
  const baseStyle: React.CSSProperties = { ...cardStyle, padding: "18px 20px", display: "flex", flexDirection: "column", minHeight: 200 };

  if (!lastPage) {
    return (
      <div style={baseStyle}>
        <div style={LABEL_STYLE}>Continuar</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 36 }}>
            {[5, 10, 7, 14, 9, 12, 6, 13, 8].map((h, i) => (
              <div key={i} style={{ width: 4, height: h, borderRadius: 2, background: `color-mix(in srgb, var(--brand) ${18 + i * 7}%, transparent)` }} />
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5, textAlign: "center" }}>
            Acesse qualquer página<br />para retomar de onde parou.
          </div>
        </div>
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
        </div>
        {kind !== "audio" && (
          kind === "flashcard" ? <FlashcardViz /> :
          kind === "quiz"      ? <QuizViz />      :
          kind === "lesson"    ? <LessonViz />    :
          <ReadingViz />
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 14 }}>
        {kind === "audio" ? <WaveformViz /> : <div style={{ flex: 1 }} />}
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

// ── Section header ────────────────────────────────────────────────────────────

function SecHeader({ title, count, moreLabel, moreHref }: {
  title: string; count?: string; moreLabel?: string; moreHref?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      marginTop: "clamp(28px, 5vw, 48px)", marginBottom: 16,
      paddingTop: 20, borderTop: "1px solid var(--surface-2)",
    }}>
      <h2 style={{
        margin: 0, fontSize: "clamp(17px, 3vw, 22px)", fontWeight: 600,
        letterSpacing: "-.025em", display: "flex", alignItems: "baseline", gap: 10,
      }}>
        {title}
        {count && (
          <span style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "var(--font-geist-mono)", letterSpacing: 0, fontWeight: 400 }}>
            {count}
          </span>
        )}
      </h2>
      {moreLabel && moreHref && (
        <Link href={moreHref} style={{ fontSize: 13, color: "var(--muted-foreground)", textDecoration: "none" }}
          className="hover:text-foreground transition-colors">
          {moreLabel}
        </Link>
      )}
    </div>
  );
}

// ── Label style ───────────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "var(--muted-2, #727272)", fontWeight: 600,
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function MemberDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ trilha?: string }>;
}) {
  const { trilha: trilhaParam } = await searchParams;
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

  // Cohort membership
  const { data: memberships } = user
    ? await admin
        .from("user_cohort_memberships")
        .select("cohort_id, joined_at, cohort:cohorts(*)")
        .eq("user_id", user.id)
    : { data: [] };

  const today = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cohorts: Cohort[] = ((memberships ?? []) as any[]).map((m) => m.cohort as Cohort).filter(Boolean);
  const activeCohort = cohorts.find(
    (c) => c.membership_starts_at <= today && c.membership_ends_at >= today,
  ) ?? cohorts[cohorts.length - 1] ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = (memberships as any[])?.[0] as { joined_at: string } | undefined;
  const studyDays = membership
    ? Math.max(0, Math.floor((Date.now() - new Date(membership.joined_at).getTime()) / 86_400_000))
    : 0;

  const examDays = activeCohort?.test_date
    ? Math.max(0, Math.ceil((new Date(activeCohort.test_date).getTime() - Date.now()) / 86_400_000))
    : null;
  const examDateLabel = activeCohort?.test_date ? fmtDate(new Date(activeCohort.test_date)) : null;

  // Module access (60D)
  const { data: moduleAccess } = activeCohort
    ? await admin.from("cohort_module_access").select("*").eq("cohort_id", activeCohort.id)
    : { data: [] };

  const access60d = (moduleAccess as CohortModuleAccess[] ?? []).find(
    (a) => a.content_module_id === MEDHELP_60D_MODULE_ID,
  );
  const daysUntilUnlock = access60d
    ? Math.max(0, Math.ceil((new Date(access60d.unlock_date).getTime() - Date.now()) / 86_400_000))
    : null;

  // Quiz attempts
  let quizAttempts: { is_correct: boolean; created_at: string }[] = [];
  if (user) {
    try {
      const { data } = await admin
        .from("quiz_attempts")
        .select("is_correct, created_at")
        .eq("user_id", user.id);
      quizAttempts = data ?? [];
    } catch { /* table not migrated yet */ }
  }

  const quizTotal = quizAttempts.length;
  const quizCorrect = quizAttempts.filter((a) => a.is_correct).length;
  const quizPct = quizTotal > 0 ? quizCorrect / quizTotal : 0;
  const activityDates = quizAttempts.map((a) => a.created_at.split("T")[0]);
  const streak = calcStreak(activityDates);

  // Specialties + tracks (both needed for specialty grid and last-page lookup)
  const [{ data: specialtiesAll }, { data: allTracksData }] = await Promise.all([
    admin.from("specialties").select("id, slug, name, display_order").order("display_order"),
    admin.from("tracks").select("id, name, slug"),
  ]);
  const specById = new Map((specialtiesAll ?? []).map((s) => [s.id as number, s]));
  const allTracks = allTracksData ?? [];
  const trackBySlug = new Map(allTracks.map(t => [t.slug as string, t as { id: number; name: string; slug: string }]));

  // Active study type tab (from URL query param; defaults to "questoes")
  const selectedTabId = VALID_TAB_IDS.includes(trilhaParam ?? "") ? (trilhaParam ?? "questoes") : "questoes";
  const selectedTab = STUDY_TABS.find(t => t.id === selectedTabId) ?? STUDY_TABS[0];

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

  // Fetch content pages for the active study type tab (specialty_id → slug map)
  const specPageMap = new Map<number, string>();
  if (!selectedTab.locked) {
    if (selectedTab.trackSlug) {
      const trackId = trackBySlug.get(selectedTab.trackSlug)?.id;
      if (trackId) {
        const { data } = await admin.from("pages").select("specialty_id, slug")
          .eq("track_id", trackId).not("specialty_id", "is", null).eq("status", "publish");
        for (const p of (data ?? [])) {
          if (p.specialty_id != null) specPageMap.set(p.specialty_id, p.slug);
        }
      }
    } else if (selectedTab.view) {
      const { data } = await admin.from("pages").select("specialty_id, slug")
        .eq("view", selectedTab.view).not("specialty_id", "is", null).eq("status", "publish");
      for (const p of (data ?? [])) {
        if (p.specialty_id != null) specPageMap.set(p.specialty_id, p.slug);
      }
    }
  }

  const now = new Date();
  const dayLabel = `${DAY_NAMES[now.getDay()].toLowerCase()}, ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
  const [greetLine1, greetLine2] = pickGreeting(now, examDays);

  const cohortBadge = activeCohort?.name
    ?.replace(/revalida-/i, "Turma ")
    .replace(/-(\d+)$/, "·$1");

  const cardAlt: React.CSSProperties = { background: "var(--surface-2)", borderRadius: "var(--radius)" };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }} className="px-[10px] sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-16 sm:pb-20">

      {/* ── HERO ── */}
      <section className="grid lg:grid-cols-[1fr_auto] gap-6 lg:gap-16 items-end mb-5 sm:mb-8">

        {/* Left: editorial copy */}
        <div>
          <div style={{ ...LABEL_STYLE, display: "flex", alignItems: "center", gap: 8, marginBottom: 16, letterSpacing: ".22em", fontSize: 10.5 }} className="sm:mb-7">
            <span style={{ width: 20, height: 1, background: "var(--muted-foreground)", display: "inline-block" }} />
            Olá, {firstName} · {dayLabel}
            {cohortBadge && (
              <span style={{
                display: "inline-flex", alignItems: "center",
                height: 18, padding: "0 8px", marginLeft: 4,
                background: "color-mix(in srgb, var(--brand) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--brand) 28%, transparent)",
                borderRadius: 999, fontSize: 10, fontWeight: 600, letterSpacing: ".06em",
                color: "var(--brand)",
              }}>
                {cohortBadge}
              </span>
            )}
          </div>

          <h1 className="font-bold text-foreground" style={{
            fontSize: "clamp(38px, 8.5vw, 112px)",
            lineHeight: 0.94,
            letterSpacing: "-0.047em",
            margin: "0 0 18px",
          }}>
            {greetLine1}<br />{greetLine2}
          </h1>

          <p className="text-muted-foreground" style={{
            fontSize: "clamp(14px, 2vw, 20px)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            maxWidth: "32ch",
            lineHeight: 1.4,
            margin: "0 0 22px",
          }}>
            {lastPage
              ? <>Continue em <strong className="text-foreground font-medium">{lastPage.title}</strong>.</>
              : <>Comece a explorar o conteúdo.</>
            }
          </p>

          {/* Inline stat chips — mobile only */}
          <div className="flex flex-wrap gap-2 lg:hidden mb-2">
            {examDays !== null && (
              <span className="tabular-nums" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", background: "color-mix(in srgb, var(--brand) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--brand) 22%, transparent)", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "var(--brand)", letterSpacing: "-.01em" }}>
                {fmtBr(examDays)} dias até a prova
              </span>
            )}
            {streak > 0 && (
              <span className="tabular-nums" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", background: "color-mix(in srgb, var(--c-pop) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--c-pop) 22%, transparent)", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "var(--c-pop)", letterSpacing: "-.01em" }}>
                {streak} dias seguidos
              </span>
            )}
          </div>
        </div>

        {/* Right: big stat numbers — desktop only */}
        <div className="hidden lg:grid grid-cols-1 gap-8 items-end text-right">
          <div>
            <div style={LABEL_STYLE}>Até a prova</div>
            <div className="tabular-nums" style={{
              fontSize: "clamp(44px, 7.5vw, 108px)",
              fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 0.9,
              color: "var(--brand)", marginTop: 5,
            }}>
              {examDays != null ? fmtBr(examDays) : "—"}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, letterSpacing: ".04em" }}>
              {examDateLabel ?? activeCohort?.name ?? "dias"}
            </div>
          </div>
          <div className="flex gap-10 justify-end">
            {[
              { label: "De estudo", value: fmtBr(studyDays), sub: "dias",     color: "var(--foreground)" },
              { label: "Sequência", value: String(streak),   sub: "seguidos", color: "var(--c-pop)"       },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="text-right">
                <div style={LABEL_STYLE}>{label}</div>
                <div className="tabular-nums" style={{
                  fontSize: "clamp(24px, 4vw, 58px)",
                  fontWeight: 500, letterSpacing: "-0.045em", lineHeight: 1,
                  color, marginTop: 4,
                }}>
                  {value}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 5, letterSpacing: ".04em" }}>
                  {sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

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

          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 10.5, letterSpacing: ".16em", textTransform: "uppercase", fontWeight: 600, opacity: .55 }}>Plano de hoje</div>
            <h3 style={{ margin: "6px 0 0", fontSize: 22, letterSpacing: "-.025em", lineHeight: 1.05, fontWeight: 600 }}>
              Estude<br />com foco
            </h3>
          </div>
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              { task: "Responder 15 questões hoje", done: false },
              { task: "Revisar especialidade fraca",  done: false },
              { task: "Ouvir um áudio MedVoice",      done: false },
            ].map(({ task, done }) => (
              <div key={task} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: done ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {done && <span style={{ fontSize: 9, color: "var(--brand)" }}>✓</span>}
                </div>
                <span style={{ opacity: done ? 0.5 : 0.85, textDecoration: done ? "line-through" : "none" }}>{task}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Continue — takes 2/3 of the row */}
        <ContinueCard lastPage={lastPage} lastTrack={lastTrack} lastPageSpec={lastPageSpec} cardStyle={cardAlt} />
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

      {/* ── ESTUDAR — unified study type × specialty navigation ── */}
      <div style={{ marginTop: "clamp(28px, 5vw, 48px)", paddingTop: 20, borderTop: "1px solid var(--surface-2)" }}>
        <div style={{ ...LABEL_STYLE, marginBottom: 14 }}>Como quero estudar</div>

        {/* Tab bar — horizontally scrollable on mobile */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 16, scrollbarWidth: "none" }}>
          {STUDY_TABS.map((tab) => {
            const isActive = tab.id === selectedTabId;
            return (
              <Link
                key={tab.id}
                href={`/app?trilha=${tab.id}`}
                scroll={false}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "0 16px", height: 38, borderRadius: "var(--radius-sm)",
                  background: isActive ? tab.color : "var(--surface-1)",
                  color: isActive ? "#16122e" : tab.locked ? "var(--muted-3, #4a4a4a)" : "var(--foreground)",
                  fontSize: 13, fontWeight: isActive ? 600 : 500,
                  textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap",
                  transition: "background .12s",
                  outline: isActive ? "none" : "1px solid var(--surface-2)",
                  outlineOffset: "-1px",
                  opacity: tab.locked && !isActive ? 0.45 : 1,
                }}
              >
                <tab.Icon size={13} strokeWidth={isActive ? 2.2 : 1.8} />
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Content area */}
        {selectedTab.locked ? (
          /* Locked state (MedHelp 60D) */
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 14, padding: "56px 20px",
            background: "var(--surface-1)", borderRadius: "var(--radius)",
            outline: "1px dashed color-mix(in srgb, var(--foreground) 14%, transparent)",
            outlineOffset: "-1px",
          }}>
            <div style={{ width: 52, height: 52, borderRadius: "var(--radius-sm)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={22} strokeWidth={1.5} style={{ color: "var(--muted-foreground)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.015em", color: "var(--muted-foreground)" }}>MedHelp 60D</div>
              <div style={{ fontSize: 13, color: "var(--muted-3, #4a4a4a)", marginTop: 6 }}>
                {daysUntilUnlock != null
                  ? `Libera em ${fmtBr(daysUntilUnlock)} dias`
                  : "Conteúdo de revisão intensiva — módulo final"}
              </div>
            </div>
          </div>
        ) : (
          /* Specialty grid */
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {(specialtiesAll ?? []).map((spec) => {
              const pageSlug = specPageMap.get(spec.id);
              const href = pageSlug ? `/app/${spec.slug}/${pageSlug}` : `/app/${spec.slug}`;
              return (
                <Link
                  key={spec.id}
                  href={href}
                  style={{
                    background: "var(--surface-1)",
                    borderRadius: "var(--radius-sm)",
                    padding: "14px 14px 12px",
                    display: "flex", flexDirection: "column", gap: 8,
                    textDecoration: "none", position: "relative", overflow: "hidden",
                    transition: "background .12s",
                  }}
                  className="group hover:bg-surface-2"
                >
                  {/* Top bar in selected tab's color */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: selectedTab.color }} />
                  <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-.01em", color: "var(--foreground)", lineHeight: 1.3, paddingTop: 2 }}>
                    {spec.name}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: "var(--brand)" }}>
                    Acessar <ChevronRight size={10} strokeWidth={2.5} />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
