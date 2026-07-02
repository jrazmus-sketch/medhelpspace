import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireActiveMembership } from "@/lib/membership-gate";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getReviewStats, type ReviewStats } from "@/lib/review/queries";
import {
  QUIZ_ERROR_CATEGORIES,
  isQuizErrorCategory,
  type QuizErrorCategory,
} from "@/lib/quiz-errors";
import Link from "next/link";
import { ChevronLeft, Target, Flame, BookOpen, Calendar, RotateCcw } from "lucide-react";

export const metadata = { title: "Relatório de Desempenho — MedHelpSpace" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const unique = [...new Set(dates)].sort().reverse();
  let streak = 0;
  const today = new Date().toISOString().split("T")[0];
  let cursor = today;
  for (const d of unique) {
    if (d === cursor) {
      streak++;
      const prev = new Date(cursor);
      prev.setDate(prev.getDate() - 1);
      cursor = prev.toISOString().split("T")[0];
    } else if (d < cursor) break;
  }
  return streak;
}

function pct(correct: number, total: number) {
  if (!total) return null;
  return Math.round((correct / total) * 100);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SpecialtyStats = {
  id: number;
  name: string;
  total: number;
  correct: number;
};

type DayBucket = {
  date: string; // YYYY-MM-DD
  total: number;
  correct: number;
};

type ErrorProfile = {
  taggedWrong: number;
  totalWrong: number;
  byCategory: { slug: QuizErrorCategory; label: string; tip: string; count: number }[];
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function RelatorioPage() {
  await requireActiveMembership();

  if (USE_MOCK_DATA) {
    return <RelatorioShell mockMode />;
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch all attempts + specialties in parallel
  const [attemptsRes, specialtiesRes, membershipRes, reviewStats] = await Promise.all([
    admin
      .from("quiz_attempts")
      .select("is_correct, created_at, question_id, specialty_id, error_category")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin.from("specialties").select("id, name").order("display_order"),
    admin
      .from("user_cohort_memberships")
      .select("joined_at, cohort:cohorts(name, test_date)")
      .eq("user_id", user.id),
    getReviewStats(user.id),
  ]);

  const attempts = (attemptsRes.data ?? []) as {
    is_correct: boolean;
    created_at: string;
    question_id: number;
    specialty_id: number | null;
    error_category: string | null;
  }[];

  const specialties = (specialtiesRes.data ?? []) as { id: number; name: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = (membershipRes.data ?? [])[0] as any;

  // ── Overall stats
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const total = attempts.length;
  const correct = attempts.filter((a) => a.is_correct).length;
  const activityDates = attempts.map((a) => a.created_at.split("T")[0]);
  const streak = calcStreak(activityDates);
  const studyDays = membership?.joined_at
    ? Math.max(0, Math.floor((nowMs - new Date(membership.joined_at).getTime()) / 86_400_000))
    : 0;

  // ── Per-specialty stats
  const specMap = new Map<number, SpecialtyStats>();
  for (const s of specialties) {
    specMap.set(s.id, { id: s.id, name: s.name, total: 0, correct: 0 });
  }
  for (const a of attempts) {
    if (a.specialty_id && specMap.has(a.specialty_id)) {
      const s = specMap.get(a.specialty_id)!;
      s.total++;
      if (a.is_correct) s.correct++;
    }
  }
  const specialtyStats: SpecialtyStats[] = [...specMap.values()]
    .filter((s) => s.total > 0)
    .sort((a, b) => (pct(a.correct, a.total) ?? 100) - (pct(b.correct, b.total) ?? 100));

  // ── Error profile (Phase 4) — how the student's wrong answers break down
  const wrongAttempts = attempts.filter((a) => !a.is_correct);
  const errorCounts = new Map<QuizErrorCategory, number>();
  for (const a of wrongAttempts) {
    if (isQuizErrorCategory(a.error_category)) {
      errorCounts.set(a.error_category, (errorCounts.get(a.error_category) ?? 0) + 1);
    }
  }
  const taggedWrong = [...errorCounts.values()].reduce((s, n) => s + n, 0);
  const errorProfile: ErrorProfile = {
    taggedWrong,
    totalWrong: wrongAttempts.length,
    byCategory: QUIZ_ERROR_CATEGORIES.map((c) => ({
      slug: c.slug,
      label: c.label,
      tip: c.tip,
      count: errorCounts.get(c.slug) ?? 0,
    })),
  };

  // ── 30-day daily buckets
  const buckets = new Map<string, DayBucket>();
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    buckets.set(key, { date: key, total: 0, correct: 0 });
  }
  for (const a of attempts) {
    const day = a.created_at.split("T")[0];
    if (buckets.has(day)) {
      const b = buckets.get(day)!;
      b.total++;
      if (a.is_correct) b.correct++;
    }
  }
  const days = [...buckets.values()];
  const maxDay = Math.max(...days.map((d) => d.total), 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cohort = membership?.cohort as any;
  const examDate = cohort?.test_date ? new Date(cohort.test_date) : null;
  const daysToExam = examDate
    ? Math.max(0, Math.ceil((examDate.getTime() - nowMs) / 86_400_000))
    : null;

  return (
    <RelatorioShell
      total={total}
      correct={correct}
      streak={streak}
      studyDays={studyDays}
      specialtyStats={specialtyStats}
      days={days}
      maxDay={maxDay}
      cohortName={cohort?.name ?? null}
      daysToExam={daysToExam}
      reviewStats={reviewStats}
      errorProfile={errorProfile}
    />
  );
}

// ── Presentational shell ──────────────────────────────────────────────────────

function RelatorioShell({
  mockMode,
  total = 0,
  correct = 0,
  streak = 0,
  studyDays = 0,
  specialtyStats = [],
  days = [],
  maxDay = 1,
  cohortName = null,
  daysToExam = null,
  reviewStats = { scheduled: 0, dueToday: 0, overdue: 0, wrong: 0, mastered: 0 },
  errorProfile = { taggedWrong: 0, totalWrong: 0, byCategory: [] },
}: {
  mockMode?: boolean;
  total?: number;
  correct?: number;
  streak?: number;
  studyDays?: number;
  specialtyStats?: SpecialtyStats[];
  days?: DayBucket[];
  maxDay?: number;
  cohortName?: string | null;
  daysToExam?: number | null;
  reviewStats?: ReviewStats;
  errorProfile?: ErrorProfile;
}) {
  const accuracy = pct(correct, total);
  const MONTH_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-20">
      {/* Back */}
      <Link
        href="/app"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--muted-foreground)", textDecoration: "none", marginBottom: 28 }}
        className="hover:text-foreground transition-colors"
      >
        <ChevronLeft size={16} />
        Voltar ao início
      </Link>

      <h1 style={{ fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 700, letterSpacing: "-.03em", marginBottom: 4 }}>
        Relatório de Desempenho
      </h1>
      {cohortName && (
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 32 }}>
          {cohortName}{daysToExam !== null ? ` · ${daysToExam} dias para a prova` : ""}
        </p>
      )}

      {mockMode && (
        <div style={{
          padding: "12px 16px", borderRadius: "var(--radius)", marginBottom: 32,
          background: "color-mix(in srgb, var(--brand) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--brand) 20%, transparent)",
          fontSize: 13, color: "var(--muted-foreground)",
        }}>
          Modo demonstração — dados reais aparecerão quando conectado ao Supabase.
        </div>
      )}

      {/* ── Hero stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Questões respondidas", value: total.toLocaleString("pt-BR"), Icon: Target, color: "var(--brand)" },
          { label: "Taxa de acerto", value: accuracy !== null ? `${accuracy}%` : "—", Icon: BookOpen, color: "#22c55e" },
          { label: "Sequência atual", value: `${streak} dia${streak !== 1 ? "s" : ""}`, Icon: Flame, color: "#f97316" },
          { label: "Dias de estudo", value: `${studyDays}`, Icon: Calendar, color: "#8b5cf6" },
        ].map(({ label, value, Icon, color }) => (
          <div
            key={label}
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--surface-2)",
              borderRadius: "var(--radius)",
              padding: "16px",
            }}
          >
            <Icon size={18} style={{ color, marginBottom: 8 }} />
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.3 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── 30-day activity heatmap ── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 16 }}>
          Atividade — últimos 30 dias
        </div>
        <div
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius)",
            padding: "20px",
          }}
        >
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {days.map((d) => {
              const intensity = d.total === 0 ? 0 : Math.max(0.15, d.total / maxDay);
              const date = new Date(d.date + "T12:00:00");
              const label = `${date.getDate()} ${MONTH_PT[date.getMonth()]}: ${d.total} questões, ${pct(d.correct, d.total) ?? 0}% acerto`;
              return (
                <div
                  key={d.date}
                  title={label}
                  style={{
                    width: 28, height: 28,
                    borderRadius: 5,
                    background: d.total === 0
                      ? "var(--surface-2)"
                      : `color-mix(in srgb, var(--brand) ${Math.round(intensity * 100)}%, var(--surface-2))`,
                    flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {d.total > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: intensity > 0.5 ? "rgba(255,255,255,0.9)" : "var(--muted-foreground)" }}>
                      {d.total}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--surface-2)", display: "inline-block" }} />
              Sem atividade
            </span>
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--brand)", display: "inline-block" }} />
              Máximo de questões
            </span>
          </div>
        </div>
      </section>

      {/* ── Revisão (spaced repetition) ── */}
      {reviewStats.scheduled > 0 && (
        <section style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 16 }}>
            Revisão
          </div>
          <div style={{ background: "var(--surface-1)", border: "1px solid var(--surface-2)", borderRadius: "var(--radius)", padding: "20px" }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Em revisão", value: reviewStats.scheduled, color: "var(--foreground)" },
                { label: "A revisar hoje", value: reviewStats.dueToday, color: "var(--brand)" },
                { label: "Dominados", value: reviewStats.mastered, color: "#22c55e" },
                { label: "Para recuperar", value: reviewStats.wrong, color: "#ef4444" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1, color }}>
                    {value.toLocaleString("pt-BR")}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.3 }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/app/revisao"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 16, fontSize: 13, fontWeight: 600, color: "var(--brand)", textDecoration: "none" }}
            >
              <RotateCcw size={14} />
              Abrir Revisão
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      )}

      {/* ── Análise de erros (Phase 4) ── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 16 }}>
          Análise de erros
        </div>
        <div style={{ background: "var(--surface-1)", border: "1px solid var(--surface-2)", borderRadius: "var(--radius)", padding: "20px" }}>
          {errorProfile.taggedWrong === 0 ? (
            <p style={{ fontSize: 14, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
              Ao errar uma questão, marque <strong style={{ color: "var(--foreground)" }}>por que</strong> você errou
              (conteúdo, interpretação, distração, conduta ou memorização). Seu perfil de erros aparece aqui
              e ajuda o seu plano a priorizar os temas onde o problema é de conteúdo.
            </p>
          ) : (
            (() => {
              const sorted = errorProfile.byCategory
                .filter((c) => c.count > 0)
                .sort((a, b) => b.count - a.count);
              const top = sorted[0];
              const maxCount = top.count;
              return (
                <>
                  {/* Top-error insight */}
                  <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid var(--surface-2)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                      Seu erro mais comum: <span style={{ color: "var(--brand)" }}>{top.label}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                      {top.tip}
                    </div>
                  </div>

                  {/* Per-category bars */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {sorted.map((c) => {
                      const share = Math.round((c.count / errorProfile.taggedWrong) * 100);
                      return (
                        <div key={c.slug} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: "0 0 108px", fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.label}
                          </div>
                          <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 3, width: `${Math.max(6, Math.round((c.count / maxCount) * 100))}%`, background: "var(--brand)", transition: "width 0.4s ease" }} />
                          </div>
                          <div style={{ flex: "0 0 auto", textAlign: "right", fontSize: 13, fontWeight: 600 }}>
                            {c.count}
                          </div>
                          <div style={{ flex: "0 0 40px", textAlign: "right", fontSize: 12, color: "var(--muted-foreground)" }}>
                            {share}%
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 14 }}>
                    {errorProfile.taggedWrong} de {errorProfile.totalWrong} {errorProfile.totalWrong === 1 ? "erro classificado" : "erros classificados"}.
                  </p>
                </>
              );
            })()
          )}
        </div>
      </section>

      {/* ── Per-specialty breakdown ── */}
      {specialtyStats.length > 0 ? (
        <section>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 16 }}>
            Desempenho por especialidade
          </div>
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--surface-2)",
              borderRadius: "var(--radius)",
              overflow: "hidden",
            }}
          >
            {specialtyStats.map((s, i) => {
              const p = pct(s.correct, s.total) ?? 0;
              const color = p >= 70 ? "#22c55e" : p >= 50 ? "#f59e0b" : "#ef4444";
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 16,
                    padding: "14px 20px",
                    borderTop: i > 0 ? "1px solid var(--surface-2)" : undefined,
                  }}
                >
                  {/* Specialty name */}
                  <div style={{ flex: "0 0 160px", fontSize: 13, fontWeight: 500, minWidth: 0 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name}
                    </span>
                  </div>

                  {/* Bar */}
                  <div style={{ flex: 1, height: 6, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%", borderRadius: 3,
                        width: `${p}%`,
                        background: color,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>

                  {/* Pct */}
                  <div style={{ flex: "0 0 44px", textAlign: "right", fontSize: 14, fontWeight: 700, color }}>
                    {p}%
                  </div>

                  {/* Total */}
                  <div style={{ flex: "0 0 60px", textAlign: "right", fontSize: 12, color: "var(--muted-foreground)" }}>
                    {s.correct}/{s.total}
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 10 }}>
            Ordenado da especialidade mais fraca para a mais forte.
          </p>
        </section>
      ) : (
        <section>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 16 }}>
            Desempenho por especialidade
          </div>
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--surface-2)",
              borderRadius: "var(--radius)",
              padding: "40px 20px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
              Responda questões para ver seu desempenho por especialidade.
            </p>
            <Link
              href="/app/simulados"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                marginTop: 16, background: "var(--brand)", color: "var(--brand-fg)",
                borderRadius: "var(--radius)", padding: "10px 20px",
                fontSize: 14, fontWeight: 600, textDecoration: "none",
              }}
            >
              Começar questões
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
