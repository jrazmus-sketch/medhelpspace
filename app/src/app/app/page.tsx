import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ClipboardList, ScrollText, Mic, FlaskConical, Headphones,
  Layers, Lock, ChevronRight,
} from "lucide-react";
import type { Cohort, CohortModuleAccess } from "@/types/supabase";

// ── Config ────────────────────────────────────────────────────────────────────

const MEDHELP_60D_MODULE_ID = 1;

const TRACK_DEFS = [
  { num: "01", id: "questoes",   slug: "simulados",       name: "Estudo por Questões", desc: "Banco com correção comentada por especialidade.", Icon: ClipboardList, color: "var(--c-questoes)"   },
  { num: "02", id: "resumos",    slug: "resumos",          name: "Resumos Narrativos",  desc: "Resumos no formato de caso clínico.",              Icon: ScrollText,    color: "var(--c-resumos)"    },
  { num: "03", id: "medvoice",   slug: "medvoice",         name: "MedVoice",            desc: "Aulas em áudio por especialidade.",                Icon: Mic,           color: "var(--c-medvoice)"   },
  { num: "04", id: "formula",    slug: "formula-medhelp",  name: "Fórmula MedHelp",     desc: "Método estruturado de raciocínio clínico.",        Icon: FlaskConical,  color: "var(--c-formula)"    },
  { num: "05", id: "audiocards", slug: "audiocards",       name: "AudioCards",          desc: "Flashcards narrados para fixação.",                Icon: Headphones,    color: "var(--c-audiocards)" },
  { num: "06", id: "medhelp60",  slug: "medhelp-60d",      name: "MedHelp 60D",         desc: "Liberado 60 dias antes da prova.",                 Icon: Lock,          color: "var(--c-medhelp60, #3a4055)", locked: true },
] as const;

const DAY_NAMES   = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const HEAT_DOW    = ["D","S","T","Q","Q","S","S"];

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

// ── SVG chart primitives ──────────────────────────────────────────────────────

function DonutChart({ value, size = 116, sw = 12, color = "var(--brand)" }: {
  value: number; size?: number; sw?: number; color?: string;
}) {
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, value));
  const offset = c - dash;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        style={{ stroke: `color-mix(in srgb, ${color} 18%, transparent)`, strokeWidth: sw }} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        style={{
          stroke: color, strokeWidth: sw,
          strokeDasharray: c,
          strokeDashoffset: offset,
          strokeLinecap: "round",
          animation: "donut-draw 1.2s cubic-bezier(.4,0,.2,1) both",
          "--donut-start": `${c}`,
        } as React.CSSProperties}
      />
    </svg>
  );
}

function Sparkline({ data, height = 56 }: { data: number[]; height?: number }) {
  if (!data.length) return <div style={{ height }} />;
  const w = 240; const h = height; const pad = 4;
  const max = Math.max(...data) || 1;
  const stepX = (w - pad * 2) / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => ({ x: pad + i * stepX, y: pad + (h - pad * 2) * (1 - v / max) }));
  const line = "M" + pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L");
  const fill = `${line} L${pts[pts.length-1].x},${h - pad} L${pad},${h - pad} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id="sf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-pop)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--c-pop)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill="url(#sf)" />
      <path d={line} fill="none"
        style={{ stroke: "var(--c-pop)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as React.CSSProperties} />
      <circle cx={last.x} cy={last.y} r="3.5" style={{ fill: "var(--c-pop)" }} />
    </svg>
  );
}

function HeatmapGrid({ cells, dayLabels }: { cells: number[]; dayLabels: string[] }) {
  const last = cells.length - 1;
  const colors = [
    "var(--surface-2)",
    "color-mix(in srgb, var(--c-pop) 25%, transparent)",
    "color-mix(in srgb, var(--c-pop) 50%, transparent)",
    "color-mix(in srgb, var(--c-pop) 75%, transparent)",
    "var(--c-pop)",
  ];
  return (
    <div style={{ width: "100%" }}>
      {/* Day-of-week column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 5 }}>
        {dayLabels.map((d, i) => (
          <div key={i} style={{
            textAlign: "center", fontSize: 8.5,
            color: "var(--muted-3, #4a4a4a)",
            fontFamily: "var(--font-geist-mono)", fontWeight: 600,
          }}>{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((v, i) => {
          const lvl = v === 0 ? 0 : v < 0.25 ? 1 : v < 0.55 ? 2 : v < 0.85 ? 3 : 4;
          return (
            <div key={i} style={{
              aspectRatio: "1/1", borderRadius: 3,
              background: colors[lvl],
              ...(i === last ? { outline: "1.5px solid var(--c-pop)", outlineOffset: "1px" } : {}),
            }} />
          );
        })}
      </div>
    </div>
  );
}

function VBarsChart({ items }: { items: { label: string; right: number; wrong: number; color: string }[] }) {
  if (!items.length) return (
    <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 16 }}>
      Responda questões para ver seu desempenho por especialidade.
    </p>
  );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 148, paddingTop: 6 }}>
      {items.map((it, i) => {
        const total = it.right + it.wrong || 1;
        const rightPct = (it.right / total) * 100;
        const wrongPct = (it.wrong / total) * 100;
        const accPct = Math.round((it.right / total) * 100);
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5, height: "100%" }}>
            <div style={{ fontSize: 11, color: "var(--foreground)", textAlign: "center", fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-geist-mono)", fontWeight: 600 }}>
              {accPct}%
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ background: "var(--surface-3)", height: `${wrongPct}%` }} />
              <div style={{ background: it.color, height: `${rightPct}%` }} />
            </div>
            <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 1.5 }}>
              <div style={{ fontSize: 9.5, color: "var(--muted-foreground)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 600 }}>
                {it.label}
              </div>
              <div style={{ fontSize: 8.5, color: "var(--muted-3, #4a4a4a)", fontFamily: "var(--font-geist-mono)" }}>
                {it.right + it.wrong}q
              </div>
            </div>
          </div>
        );
      })}
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

// ── Continue card ─────────────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function MemberDashboardPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Profile (with graceful fallback if last_page_id column not yet migrated)
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
  const todayDate = today.split("T")[0];

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

  // Quiz attempts (graceful: table may not exist yet)
  let quizAttempts: { is_correct: boolean; specialty_id: number | null; created_at: string }[] = [];
  if (user) {
    try {
      const { data } = await admin
        .from("quiz_attempts")
        .select("is_correct, specialty_id, created_at")
        .eq("user_id", user.id);
      quizAttempts = data ?? [];
    } catch { /* table not migrated yet */ }
  }

  const quizTotal = quizAttempts.length;
  const quizCorrect = quizAttempts.filter((a) => a.is_correct).length;
  const quizPct = quizTotal > 0 ? quizCorrect / quizTotal : 0;

  // Streak from quiz activity dates
  const activityDates = quizAttempts.map((a) => a.created_at.split("T")[0]);
  const streak = calcStreak(activityDates);

  // Per-specialty quiz accuracy (top 6 by attempts)
  const specAccMap = new Map<number, { right: number; wrong: number }>();
  for (const a of quizAttempts) {
    if (!a.specialty_id) continue;
    const cur = specAccMap.get(a.specialty_id) ?? { right: 0, wrong: 0 };
    if (a.is_correct) cur.right++;
    else cur.wrong++;
    specAccMap.set(a.specialty_id, cur);
  }

  // Specialties for label lookup + quick-jump strip
  const { data: specialtiesAll } = await admin.from("specialties").select("id, slug, name, display_order").order("display_order");
  const specById = new Map((specialtiesAll ?? []).map((s) => [s.id as number, s]));

  const SPEC_COLORS = [
    "var(--c-spec-1)", "var(--c-spec-2)", "var(--c-spec-3)",
    "var(--c-spec-4)", "var(--c-spec-5)", "var(--c-spec-6)",
  ];
  const specialtyBars = [...specAccMap.entries()]
    .sort((a, b) => (b[1].right + b[1].wrong) - (a[1].right + a[1].wrong))
    .slice(0, 6)
    .map(([id, val], i) => ({
      label: specById.get(id)?.name?.slice(0, 4).toUpperCase() ?? "—",
      right: val.right,
      wrong: val.wrong,
      color: SPEC_COLORS[i % SPEC_COLORS.length],
    }));

  // Last page + track
  let lastPage: { id: number; title: string; slug: string; type: string; specialty_id: number | null; track_id: number | null } | null = null;
  let lastTrack: { id: number; name: string; slug: string } | null = null;
  if (lastPageId) {
    const { data } = await admin.from("pages").select("id, title, slug, type, specialty_id, track_id").eq("id", lastPageId).single();
    lastPage = data ?? null;
    if (lastPage?.track_id) {
      const { data: trackData } = await admin.from("tracks").select("id, name, slug").eq("id", lastPage.track_id).single();
      lastTrack = trackData ?? null;
    }
  }
  const lastPageSpec = lastPage?.specialty_id ? specById.get(lastPage.specialty_id) : null;

  // Heatmap: last 5 weeks (35 cells), intensity = quiz attempts that day / max per day
  const dayCounts = new Map<string, number>();
  for (const a of quizAttempts) {
    const d = a.created_at.split("T")[0];
    dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
  }
  const maxDay = Math.max(1, ...dayCounts.values());
  const heatCells: number[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().split("T")[0];
    heatCells.push((dayCounts.get(d) ?? 0) / maxDay);
  }
  // Day-of-week labels aligned to column order
  const heatFirstDow = new Date(Date.now() - 34 * 86_400_000).getDay();
  const heatDayLabels = Array.from({ length: 7 }, (_, i) => HEAT_DOW[(heatFirstDow + i) % 7]);

  // Today labels
  const now = new Date();
  const dayLabel = `${DAY_NAMES[now.getDay()].toLowerCase()}, ${now.getDate()} ${MONTH_NAMES[now.getMonth()]}`;
  const [greetLine1, greetLine2] = pickGreeting(now, examDays);

  // Tracks split into active vs locked
  const tracks: Array<typeof TRACK_DEFS[number] & { locked: boolean; progress: number; unlockIn?: number }> =
    TRACK_DEFS.map((t) => {
      if (t.id === "medhelp60") return { ...t, locked: true, unlockIn: daysUntilUnlock ?? 250, progress: 0 };
      const progress = t.id === "questoes" && quizTotal > 0 ? Math.min(1, quizPct) : 0;
      return { ...t, locked: false, progress };
    });
  const activeTracks = tracks.filter(t => !t.locked);
  const lockedTrack = tracks.find(t => t.locked) ?? null;

  // Cohort badge label
  const cohortBadge = activeCohort?.name
    ?.replace(/revalida-/i, "Turma ")
    .replace(/-(\d+)$/, "·$1");

  // Card surface styles
  const card: React.CSSProperties       = { background: "var(--surface-1)", borderRadius: "var(--radius)" };
  const cardAlt: React.CSSProperties    = { background: "var(--surface-2)", borderRadius: "var(--radius)" };

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

          {/* Inline stat chips on mobile, hidden on desktop (large stat block handles it) */}
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
          {/* Exam countdown — dominant */}
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
          {/* Secondary stats */}
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

      {/* ── QUICK JUMP: specialty pills ── */}
      {specialtiesAll && specialtiesAll.length > 0 && (
        <div
          className="flex flex-nowrap sm:flex-wrap gap-[6px] overflow-x-auto sm:overflow-x-visible pb-1 sm:pb-0 mb-6 sm:mb-8 -mx-[10px] sm:mx-0 px-[10px] sm:px-0"
          style={{ scrollbarWidth: "none" }}
        >
          {specialtiesAll.map((spec) => (
            <Link
              key={spec.id}
              href={`/app/${spec.slug}`}
              style={{
                display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
                height: 30, padding: "0 14px", borderRadius: 999,
                background: "var(--surface-2)",
                color: "var(--muted-foreground)",
                fontSize: 12.5, fontWeight: 500, letterSpacing: "-.01em",
                textDecoration: "none", flexShrink: 0,
                transition: "background .12s, color .12s",
              }}
              className="hover:bg-surface-3 hover:text-foreground"
            >
              {spec.name}
            </Link>
          ))}
        </div>
      )}

      {/* ── ROW 2: Plan + Continue + Questões ── */}
      <section className="grid md:grid-cols-[1.4fr_1fr_1fr] gap-[10px] sm:gap-[14px] mb-[10px] sm:mb-[14px]">

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

        {/* Continue */}
        <ContinueCard lastPage={lastPage} lastTrack={lastTrack} lastPageSpec={lastPageSpec} cardStyle={cardAlt} />

        {/* Questões KPI */}
        <div style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 200 }}>
          <div style={LABEL_STYLE}>Questões</div>
          <div>
            <div className="tabular-nums" style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1, color: "var(--foreground)", paddingTop: 12 }}>
              {fmtBr(quizTotal)}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-2, #727272)", marginTop: 7 }}>
              {quizTotal > 0
                ? <span style={{ color: "var(--c-success)", fontWeight: 500 }}>{Math.round(quizPct * 100)}% de acerto</span>
                : <span>Nenhuma questão respondida ainda</span>
              }
            </div>
          </div>
          <div>
            <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${quizPct * 100}%`, background: "var(--brand)", borderRadius: 999 }} />
            </div>
            {quizTotal > 0 && (
              <div style={{ fontSize: 11, color: "var(--muted-3, #4a4a4a)", marginTop: 5 }}>
                {fmtBr(quizCorrect)} acertos · {fmtBr(quizTotal - quizCorrect)} erros
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── TRILHAS ── */}
      <SecHeader title="Trilhas" count="05" moreLabel="Ver todas →" moreHref="/app/trilhas" />
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[10px] sm:gap-3">
        {activeTracks.map((track, idx) => (
          <Link
            key={track.id}
            href={`/app/${track.slug}`}
            style={{
              background: "var(--surface-1)",
              borderRadius: "var(--radius)",
              padding: "22px 20px 18px",
              display: "flex", flexDirection: "column", gap: 16,
              position: "relative", overflow: "hidden",
              minHeight: 190, textDecoration: "none",
              transition: "transform .15s, background .15s",
              ...cardEnter(idx * 55),
            }}
            className="group hover:-translate-y-[2px] hover:bg-surface-2"
          >
            {/* Top color strip */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: track.color, borderRadius: "var(--radius) var(--radius) 0 0" }} />

            {/* Corner: number + hover arrow */}
            <span style={{ position: "absolute", right: 14, top: 14, display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 11, color: "var(--muted-3, #4a4a4a)", fontFamily: "var(--font-geist-mono)", fontWeight: 500 }}>
                {track.num}
              </span>
              <ChevronRight
                size={12} strokeWidth={2.5}
                className="opacity-0 group-hover:opacity-50 transition-opacity"
                style={{ color: "var(--muted-foreground)" }}
              />
            </span>

            {/* Icon swatch */}
            <div style={{
              width: 38, height: 38, borderRadius: "var(--radius-sm)",
              background: track.color,
              color: "#16122e",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <track.Icon size={18} strokeWidth={1.7} />
            </div>

            {/* Title + desc — hide desc on mobile to keep cards tight */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.015em", lineHeight: 1.2, color: "var(--foreground)" }}>
                {track.name}
              </div>
              <div className="hidden sm:block" style={{ fontSize: 11.5, color: "var(--muted-2, #727272)", marginTop: 4, lineHeight: 1.45 }}>
                {track.desc}
              </div>
            </div>

            {/* Footer: progress or start CTA */}
            <div style={{ marginTop: "auto", paddingTop: 10 }}>
              {track.progress === 0 ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, color: "var(--brand)" }}>
                  Começar <ChevronRight size={11} strokeWidth={2.5} />
                </span>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 3, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${track.progress * 100}%`, background: track.color, borderRadius: 999 }} />
                  </div>
                  <div className="tabular-nums" style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-geist-mono)" }}>
                    {Math.round(track.progress * 100)}%
                  </div>
                </div>
              )}
            </div>
          </Link>
        ))}
      </section>

      {/* ── EM BREVE: locked 60D module ── */}
      {lockedTrack && (
        <>
          <SecHeader title="Em breve" />
          <div style={{
            display: "flex", alignItems: "center", gap: 20,
            padding: "20px 22px",
            borderRadius: "var(--radius)",
            outline: "1px dashed color-mix(in srgb, var(--foreground) 14%, transparent)",
            outlineOffset: "-1px",
          }}>
            {/* Icon */}
            <div style={{
              width: 44, height: 44, borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--muted-2, #727272)", flexShrink: 0,
            }}>
              <Lock size={20} strokeWidth={1.6} />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.015em", color: "var(--muted-2, #727272)" }}>
                {lockedTrack.name}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted-3, #4a4a4a)", marginTop: 3, lineHeight: 1.4 }}>
                {lockedTrack.desc}
                {daysUntilUnlock != null && (
                  <> &mdash; libera em <strong style={{ color: "var(--muted-2, #727272)" }}>{fmtBr(daysUntilUnlock)} dias</strong></>
                )}
              </div>
            </div>

            {/* Countdown */}
            {lockedTrack.unlockIn != null && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="tabular-nums" style={{
                  fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 600,
                  letterSpacing: "-.04em", lineHeight: 1,
                  color: "var(--muted-2, #727272)",
                }}>
                  {fmtBr(lockedTrack.unlockIn)}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted-3, #4a4a4a)", marginTop: 4, letterSpacing: ".06em", textTransform: "uppercase" }}>
                  dias
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── PROGRESSO charts ── */}
      <SecHeader title="Progresso" />
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-[10px] sm:gap-[14px] mb-[10px] sm:mb-[14px]">

        {/* 1. Donut — accuracy */}
        <div style={{ ...card, ...cardEnter(0), padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, minHeight: 210 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={LABEL_STYLE}>Acerto</div>
            {quizTotal > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--c-success)" }}>↑ em progresso</div>}
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <DonutChart value={quizPct} color="var(--c-questoes)" />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2 }}>
              <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.025em", lineHeight: 1, color: "var(--foreground)" }}>
                {quizTotal > 0 ? `${Math.round(quizPct * 100)}%` : "—"}
              </div>
              <div style={{ fontSize: 9.5, color: "var(--muted-foreground)", letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 500 }}>acerto</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: "var(--muted-foreground)" }}>
            <span className="tabular-nums" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.025em", lineHeight: 1, color: "var(--foreground)" }}>
              {fmtBr(quizTotal)}
            </span>
            questões
          </div>
        </div>

        {/* 2. Audio — sparkline placeholder with proper empty state */}
        <div style={{ ...cardAlt, ...cardEnter(80), padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, minHeight: 210 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ ...LABEL_STYLE, color: "var(--c-medvoice)" }}>Áudio · 5 sem.</div>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* Ghost bars showing empty state */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 44 }}>
                {[8, 14, 10, 20, 12, 18, 9, 22, 11, 16, 8, 19, 13].map((h, i) => (
                  <div key={i} style={{ width: 5, height: h, borderRadius: 2, background: `color-mix(in srgb, var(--c-medvoice) ${12 + i * 4}%, transparent)` }} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-3, #4a4a4a)", letterSpacing: ".04em" }}>disponível em breve</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: "var(--muted-foreground)" }}>
            <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.025em", lineHeight: 1, color: "var(--foreground)" }}>
              0<span style={{ fontSize: 13, color: "var(--muted-foreground)", fontWeight: 400 }}>h</span>
            </span>
            este mês
          </div>
        </div>

        {/* 3. Topics — specialty accuracy bars */}
        <div style={{ ...card, ...cardEnter(160), padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, minHeight: 210 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ ...LABEL_STYLE, color: "var(--c-formula)" }}>Tópicos</div>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            {specialtyBars.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 9, width: "100%" }}>
                {specialtyBars.slice(0, 4).map((it) => {
                  const total = it.right + it.wrong || 1;
                  const pct = (it.right / total) * 100;
                  return (
                    <div key={it.label} style={{ display: "grid", gridTemplateColumns: "56px 1fr 28px", gap: 10, alignItems: "center", fontSize: 11.5 }}>
                      <div style={{ color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{it.label}</div>
                      <div style={{ height: 5, background: "var(--surface-2)", borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: it.color, borderRadius: 999 }} />
                      </div>
                      <div style={{ color: "var(--muted-foreground)", textAlign: "right", fontFamily: "var(--font-geist-mono)", fontSize: 10.5 }}>{Math.round(pct)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6 }}>
                Responda questões para ver dados de especialidade.
              </p>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12.5, color: "var(--muted-foreground)" }}>
            <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.025em", lineHeight: 1, color: "var(--foreground)" }}>
              {specAccMap.size}
            </span>
            especialidades
          </div>
        </div>

        {/* 4. Consistency heatmap */}
        <div style={{ ...cardAlt, ...cardEnter(240), padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, minHeight: 210 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ ...LABEL_STYLE, color: "var(--c-pop)" }}>Constância · 5 sem.</div>
            {streak > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--c-pop)" }}>{streak} dias</div>}
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <HeatmapGrid cells={heatCells} dayLabels={heatDayLabels} />
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--muted-foreground)", alignItems: "center" }}>
            {[["zero", "var(--surface-3)"], ["poucos", "color-mix(in srgb, var(--c-pop) 45%, transparent)"], ["muitos", "var(--c-pop)"]].map(([label, bg]) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: bg, display: "inline-block" }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── ESTA SEMANA ── */}
      <SecHeader title="Esta semana" moreLabel="Relatório →" moreHref="/app/relatorio" />
      <section className="grid md:grid-cols-[1.3fr_1fr] gap-3">

        {/* Activity feed */}
        <div style={{ ...card, padding: "22px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-.01em" }}>
              Atividade
            </h3>
            <span style={{ ...LABEL_STYLE }}>últimas 24h</span>
          </div>

          {lastPage ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0" }}>
              <div style={{ width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand-2, #b0a4ff)", flexShrink: 0 }}>
                <Layers size={16} strokeWidth={1.6} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {lastPage.title}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted-2, #727272)", marginTop: 2 }}>
                  {lastPageSpec?.name ?? "Conteúdo"}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-3, #4a4a4a)", flexShrink: 0 }}>recente</div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.6 }}>
              Seu histórico de atividades aparecerá aqui conforme você estuda.
            </p>
          )}

          {quizTotal > 0 && (
            <div style={{ borderTop: "1px solid var(--surface-2)", marginTop: 4 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
                <div style={{ width: 34, height: 34, borderRadius: "var(--radius-sm)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-questoes)", flexShrink: 0 }}>
                  <ClipboardList size={16} strokeWidth={1.6} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: "var(--foreground)" }}>
                    {fmtBr(quizTotal)} questões respondidas
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-2, #727272)", marginTop: 2 }}>
                    {Math.round(quizPct * 100)}% de acerto
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Empty state prompt */}
          {!lastPage && quizTotal === 0 && (
            <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--foreground)", fontWeight: 600 }}>Por onde começar?</strong><br />
                Escolha uma especialidade acima ou acesse Questões para responder o seu primeiro exercício.
              </div>
            </div>
          )}
        </div>

        {/* Specialty accuracy bars */}
        <div style={{ ...card, padding: "22px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-.01em" }}>
              Acerto por especialidade
            </h3>
            <span style={{ ...LABEL_STYLE }}>acumulado</span>
          </div>
          <VBarsChart items={specialtyBars} />
          {specialtyBars.length > 0 && (
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: 11.5, color: "var(--muted-2, #727272)", marginTop: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--c-spec-1)", display: "inline-block" }} /> acerto
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--surface-3)", display: "inline-block" }} /> erro
              </span>
              <span style={{ marginLeft: "auto", color: "var(--muted-2, #727272)" }}>
                média{" "}
                <strong className="tabular-nums" style={{ color: "var(--foreground)", fontWeight: 600 }}>
                  {quizTotal > 0 ? `${Math.round(quizPct * 100)}%` : "—"}
                </strong>
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
