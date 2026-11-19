"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ClipboardList, ScrollText, Headphones, Layers, Sparkles, ChevronRight,
  Settings, Check, AlertCircle, Mail, Calendar, Clock, Target, Plus,
  Trash2, Sparkles as Star, ChevronDown, ChevronUp, Sliders, Pause, X, FileStack,
} from "lucide-react";
import {
  setDailyMinutes, setStudyTimeReduction, setAvailableDays, setRecurringOffDays,
  addPause, removePause, skipToday,
  setFocusSpecialties, setExcludedSpecialties,
  setContentTypes, setEmailPrefs, setAdvancedPrefs,
} from "@/actions/study-plan";
import type {
  DerivedPlan, PlanItem, StudyPlanPrefs,
  ContentType, WeaknessSensitivity,
} from "@/lib/study-plan/derive";
import { availabilityLine, formatDuration } from "@/lib/study-plan/availability";
import { DailyTimeFields } from "./daily-time-fields";
import { EDIT_PLAN_EVENT } from "./routine-summary";
import { CalibrateWizard } from "./calibrate-wizard";
import { ForecastPanel } from "./forecast-panel";
import { PaceEditor, type PaceOptions } from "./pace-editor";
import { SimuladoFrequencyEditor } from "./simulado-frequency-editor";
import { useAutosave, type SaveStatus } from "@/lib/use-autosave";

const ICON_MAP: Record<PlanItem["iconHint"], React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  quiz: ClipboardList,
  simulado: FileStack,
  lesson: ScrollText,
  audio: Headphones,
  flashcards: Layers,
  memorecards: Sparkles,
  revalida_up: Target,
};

const ITEM_COLOR: Record<PlanItem["iconHint"], string> = {
  quiz: "var(--c-questoes)",
  simulado: "#0891b2",
  lesson: "var(--c-resumos)",
  audio: "var(--c-medvoice)",
  flashcards: "#a78bfa",
  memorecards: "#7c3aed",
  revalida_up: "var(--c-revalida)",
};

/** Fewer answers than this in an area are "dados iniciais", not a consolidated result. */
const INITIAL_DATA_BELOW = 10;

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// What the plan can actually schedule. "lesson" (Resumos / Fórmula) is NOT here:
// the plan keeps narrative summaries out of the schedule (Karina's rule), so a
// checkbox for it changed nothing. AudioCards are never scheduled either — audio
// is passive and repeats the Flashcards (Karina, 2026-06-30). Same list as the
// calibration wizard, plus the 60D MemoreCards.
// MemoreCards are a MedHelp 60D material: the plan does not schedule 60D
// materials (they get their own schedule on the 60D page — Karina 2026-11-17).
const PLAN_CONTENT_TYPES: ContentType[] = ["quiz", "simulado", "revalida_up", "flashcards", "audio"];

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  quiz: "Questões",
  simulado: "Mini simulados",
  lesson: "Resumos / Fórmula",
  audio: "MedVoice (áudio)",
  flashcards: "Flashcards",
  memorecards: "MemoreCards (60D)",
  revalida_up: "Revalida Up",
};

type PauseRow = { id: number; pause_from: string; pause_until: string; reason: string | null };
type Specialty = { id: number; name: string; slug: string };

export function PlanoClient({
  plan,
  prefs,
  specialties,
  pauses,
  welcomedAt,
  examDate,
  examDateLabel,
  cohortName,
  dateConfirmed,
  paceOptions,
  extraMinutes,
  nextExtraMinutes,
}: {
  plan: DerivedPlan | null;
  prefs: StudyPlanPrefs;
  specialties: Specialty[];
  pauses: PauseRow[];
  welcomedAt: string | null;
  examDate: string | null;
  examDateLabel: string | null;
  cohortName: string | null;
  dateConfirmed: boolean;
  paceOptions: PaceOptions;
  /** "Adiantar" minutes already added to today / the next step offered (null = none left). */
  extraMinutes: number;
  nextExtraMinutes: number | null;
}) {
  const [showWizard, setShowWizard] = useState(false);

  // Open sections (collapsible)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    disponibilidade: true,
    conteudo: false,
    notificacoes: false,
    avancado: false,
  });

  function toggleSection(name: string) {
    setOpenSections((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  // "Editar meu plano" (the summary under the title) opens Disponibilidade and goes to it.
  const availabilityRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = () => {
      setOpenSections((prev) => ({ ...prev, disponibilidade: true }));
      requestAnimationFrame(() => availabilityRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener(EDIT_PLAN_EVENT, open);
    return () => window.removeEventListener(EDIT_PLAN_EVENT, open);
  }, []);

  if (!plan) {
    return (
      <div style={{ padding: 20, borderRadius: "var(--radius)", background: "var(--surface-1)", border: "1px solid var(--surface-2)", textAlign: "center" }}>
        <p style={{ color: "var(--muted-foreground)" }}>Não foi possível carregar seu plano. Verifique seu cohort.</p>
      </div>
    );
  }

  return (
    <>
      {showWizard && (
        <CalibrateWizard
          examDate={examDate}
          examDateLabel={examDateLabel}
          cohortName={cohortName}
          specialties={specialties}
          initialAvailableDays={prefs.available_days}
          initialDailyMinutes={prefs.daily_minutes}
          initialFocusIds={prefs.focus_specialty_ids}
          initialResourceTypes={prefs.preferred_content_types}
          onClose={() => setShowWizard(false)}
        />
      )}

      <div className="space-y-8">
        {/* ── Calibration banner ───────────────────────────────────────────── */}
        {!welcomedAt && (
          <CalibrationBanner onOpen={() => setShowWizard(true)} />
        )}

        {/* ── Today's plan ─────────────────────────────────────────────────── */}
        <section>
          {/* What is LEFT for today and what was already done are two numbers,
              each named (Karina 2026-11-18). Both are estimates. */}
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
              Hoje
            </h2>
            {!plan.paused && plan.items.length > 0 && (
              <p style={{ fontSize: 15, fontWeight: 600, marginTop: 4, lineHeight: 1.4 }}>
                Restante para hoje: aproximadamente {plan.totalEstimatedMinutes} min
              </p>
            )}
            {plan.todayBudgetMinutes > 0 && plan.todayDoneMinutes > 0 && (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.5 }}>
                Tempo realizado hoje (estimativa): cerca de {Math.min(plan.todayDoneMinutes, 999)} de {plan.todayBudgetMinutes + extraMinutes} min
              </p>
            )}
            {/* MedHelp 60D, week 8: the time of the simulado that is no longer programmed stays the student's. */}
            {!plan.paused && plan.d60FreeMinutesToday > 0 && (
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.5 }}>
                Semana 8 do MedHelp 60D: cerca de {plan.d60FreeMinutesToday} min do seu dia ficam livres, sem atividade programada.
              </p>
            )}
          </div>
          {plan.paused ? (
            <PausedState plan={plan} />
          ) : plan.dayComplete ? (
            <DayCompleteState minutes={plan.todayBudgetMinutes + extraMinutes} nextExtraMinutes={nextExtraMinutes} />
          ) : plan.items.length === 0 ? (
            <EmptyPlanState />
          ) : (
            <PlanItemsList items={plan.items} onSkipToday={() => skipToday("Folga de hoje")} />
          )}
        </section>

        {/* ── Forecast: what is expected before the exam ───────────────────── */}
        {plan.forecast && <ForecastPanel forecast={plan.forecast} dateConfirmed={dateConfirmed} />}

        {/* ── Coverage warning (if user excluded too many specialties) ────── */}
        {plan.coverageWarning && (
          <div style={{
            padding: "14px 18px",
            background: "color-mix(in srgb, #f59e0b 12%, transparent)",
            border: "1px solid color-mix(in srgb, #f59e0b 30%, transparent)",
            borderRadius: "var(--radius)",
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <AlertCircle size={18} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                Atenção: cobertura reduzida
              </p>
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                Você excluiu {plan.coverageWarning.excludedCount} de {specialties.length} especialidades
                ({plan.coverageWarning.percentOfExam}% do conteúdo). A prova Revalida cobre todas as áreas —
                exclusões podem afetar seu desempenho.
              </p>
            </div>
          </div>
        )}

        {/* ── Weakest specialties (read-only insight) ──────────────────────── */}
        {plan.weakestSpecialties.length > 0 && (
          <WeakestSpecialties stats={plan.weakestSpecialties} />
        )}

        {/* ── Section 1: Disponibilidade ───────────────────────────────────── */}
        <div ref={availabilityRef} id="plano-disponibilidade" style={{ scrollMarginTop: 88 }}>
          <CollapsibleSection
            title="Disponibilidade"
            icon={Calendar}
            open={openSections.disponibilidade}
            onToggle={() => toggleSection("disponibilidade")}
            summary={availabilityLine(plan.routine.dailyMinutes, plan.routine.studyDayMask)}
          >
            <AvailabilityEditor prefs={prefs} pauses={pauses} />
            <div style={{ marginTop: 24 }}>
              <PaceEditor mode={prefs.pace_mode} pace={plan.pace} options={paceOptions} />
            </div>
            <div style={{ marginTop: 24 }}>
              <SimuladoFrequencyEditor info={plan.simulado} />
            </div>
          </CollapsibleSection>
        </div>

        {/* ── Section 2: Conteúdo ──────────────────────────────────────────── */}
        <CollapsibleSection
          title="Conteúdo"
          icon={Target}
          open={openSections.conteudo}
          onToggle={() => toggleSection("conteudo")}
          summary={contentSummary(prefs, specialties)}
        >
          <ContentEditor prefs={prefs} specialties={specialties} />
        </CollapsibleSection>

        {/* ── Section 3: Notificações ──────────────────────────────────────── */}
        <CollapsibleSection
          title="Notificações"
          icon={Mail}
          open={openSections.notificacoes}
          onToggle={() => toggleSection("notificacoes")}
          summary={notificationSummary(prefs)}
        >
          <NotificationsEditor prefs={prefs} />
        </CollapsibleSection>

        {/* ── Advanced ─────────────────────────────────────────────────────── */}
        <CollapsibleSection
          title="Configurações avançadas"
          icon={Sliders}
          open={openSections.avancado}
          onToggle={() => toggleSection("avancado")}
          summary="Sensibilidade e limites"
        >
          <AdvancedEditor prefs={prefs} />
        </CollapsibleSection>

        {/* ── Redo calibration ─────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", paddingTop: 20 }}>
          <button
            onClick={() => setShowWizard(true)}
            style={{
              background: "transparent", border: "none",
              fontSize: 13, color: "var(--muted-foreground)",
              textDecoration: "underline", cursor: "pointer",
            }}
            className="hover:text-foreground"
          >
            Refazer calibração inicial
          </button>
        </div>
      </div>
    </>
  );
}

// ── Calibration banner ─────────────────────────────────────────────────────────

function CalibrationBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <div
      style={{
        padding: "20px 24px",
        background: "linear-gradient(135deg, var(--brand) 0%, #5a1668 100%)",
        color: "var(--brand-fg)",
        borderRadius: "var(--radius)",
        display: "flex", alignItems: "center", gap: 16,
      }}
    >
      <Sparkles size={28} style={{ flexShrink: 0, opacity: 0.9 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          Personalize seu plano em 90 segundos
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.4 }}>
          Informe seus dias de estudo, o tempo disponível por dia e as áreas que deseja priorizar.
          O plano se ajusta automaticamente.
        </div>
      </div>
      <button
        onClick={onOpen}
        style={{
          padding: "10px 18px", borderRadius: "var(--radius-sm)",
          background: "rgba(255,255,255,0.95)", color: "var(--brand)",
          border: "none", fontSize: 13, fontWeight: 700,
          cursor: "pointer", flexShrink: 0,
        }}
        className="hover:bg-white transition-colors"
      >
        Calibrar agora →
      </button>
    </div>
  );
}

// ── Plan items list ────────────────────────────────────────────────────────────

function PlanItemsList({ items, onSkipToday }: { items: PlanItem[]; onSkipToday: () => void }) {
  const [, startTransition] = useTransition();

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => {
          const Icon = ICON_MAP[item.iconHint];
          const color = ITEM_COLOR[item.iconHint];
          return (
            <div key={i}>
            <Link
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 18px",
                background: "var(--surface-1)",
                border: "1px solid var(--surface-2)",
                borderRadius: "var(--radius)",
                textDecoration: "none",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div
                style={{
                  width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: `color-mix(in srgb, ${color} 15%, transparent)`,
                  color,
                }}
              >
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </div>
                {/* Wraps instead of truncating: on a phone the ellipsis used to eat the minutes. */}
                {item.lines ? (
                  // Mini simulado block: total estimated time, today's part when it is
                  // split between days, and the action — each on its own line.
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    {item.lines.map((line, j) => (
                      <div key={j}>{line}</div>
                    ))}
                    {item.cta && (
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: "var(--brand-text, var(--brand))" }}>
                        {item.cta}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                    {item.subtitle} · ~{item.estimatedMinutes} min
                  </div>
                )}
              </div>
              <ChevronRight size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
            </Link>
            {/* A second way out, outside the card (a link cannot hold another link). */}
            {item.secondary && (
              <Link
                href={item.secondary.href}
                className="min-h-11"
                style={{
                  display: "inline-flex", alignItems: "center", padding: "0 6px", marginTop: 2,
                  fontSize: 14, fontWeight: 600, color: "var(--brand-text, var(--brand))", textDecoration: "underline",
                }}
              >
                {item.secondary.label}
              </Link>
            )}
            </div>
          );
        })}
      </div>
      {/* The plan does not time the sessions — say what the minutes are. */}
      <p style={{ marginTop: 10, fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
        Os tempos são estimativas, calculadas pelas suas respostas e pelo seu ritmo. As sessões não são cronometradas.
      </p>
      <button
        onClick={() => {
          if (confirm("Pular o estudo de hoje? O plano vai redistribuir o conteúdo nos próximos dias.")) {
            startTransition(async () => { await onSkipToday(); });
          }
        }}
        style={{
          marginTop: 6, fontSize: 12, color: "var(--muted-foreground)",
          background: "transparent", border: "none", cursor: "pointer",
          textDecoration: "underline",
        }}
        className="hover:text-foreground"
      >
        Pular hoje
      </button>
    </div>
  );
}

// ── Paused state (with reason details) ────────────────────────────────────────

function PausedState({ plan }: { plan: DerivedPlan }) {
  const reason = plan.pauseReason;
  let title = "Plano em pausa";
  let detail = "";
  if (reason?.type === "date_range") {
    title = reason.label ?? "Pausa programada";
    detail = `De ${formatDate(reason.from)} até ${formatDate(reason.until)}`;
  } else if (reason?.type === "recurring_off") {
    title = `Folga recorrente`;
    detail = `Você marcou ${reason.dayName}-feira como dia de folga.`;
  } else if (reason?.type === "weekly_off") {
    title = `Dia não disponível`;
    detail = `Você não tem ${reason.dayName} na sua agenda de estudos.`;
  }

  return (
    <div
      style={{
        padding: "32px 24px",
        background: "var(--surface-1)",
        border: "1px solid var(--surface-2)",
        borderRadius: "var(--radius)",
        textAlign: "center",
      }}
    >
      <Pause size={32} style={{ color: "var(--muted-foreground)", margin: "0 auto 14px", opacity: 0.5 }} />
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 12, lineHeight: 1.5 }}>
        {detail}
      </p>
      {plan.nextAvailableDate && (
        <p style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600 }}>
          Próximo dia de estudo: {formatDate(plan.nextAvailableDate)}
        </p>
      )}
    </div>
  );
}

/** Today's time is used up while there is still content to study — offer to get ahead. */
function DayCompleteState({ minutes, nextExtraMinutes }: { minutes: number; nextExtraMinutes: number | null }) {
  return (
    <div
      style={{
        padding: "28px 20px",
        background: "var(--surface-1)",
        border: "1px solid var(--surface-2)",
        borderRadius: "var(--radius)",
        textAlign: "center",
      }}
    >
      <Check size={30} style={{ color: "var(--brand)", margin: "0 auto 10px" }} />
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Meta de hoje concluída</h3>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
        Você usou os {minutes} min de estudo de hoje. O plano continua amanhã de onde você parou.
      </p>
      {nextExtraMinutes != null && (
        <Link
          href={`/app/plano?adiantar=${nextExtraMinutes}`}
          className="min-h-11"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            marginTop: 16, padding: "10px 18px",
            borderRadius: "var(--radius-sm)", border: "1px solid var(--brand)",
            fontSize: 13, fontWeight: 600, color: "var(--brand-text, var(--brand))", textDecoration: "none",
          }}
        >
          Quero adiantar mais 30 min
        </Link>
      )}
    </div>
  );
}

function EmptyPlanState() {
  return (
    <div
      style={{
        padding: "32px 20px",
        background: "var(--surface-1)",
        border: "1px solid var(--surface-2)",
        borderRadius: "var(--radius)",
        textAlign: "center",
      }}
    >
      <AlertCircle size={32} style={{ color: "var(--muted-foreground)", margin: "0 auto 12px", opacity: 0.4 }} />
      <p style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
        Nada para hoje — você já cobriu o material das suas prioridades.
      </p>
      <Link
        href="/app"
        style={{ display: "inline-block", marginTop: 16, fontSize: 13, color: "var(--brand)", textDecoration: "underline" }}
      >
        Explorar especialidades →
      </Link>
    </div>
  );
}

function WeakestSpecialties({ stats }: { stats: DerivedPlan["weakestSpecialties"] }) {
  return (
    <section>
      <h2 style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 6 }}>
        Onde focar
      </h2>
      {/* Why an area is here (Karina 2026-11-18): study priority, not a grade. */}
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12, lineHeight: 1.5 }}>
        Áreas que o plano está colocando à frente no seu estudo: primeiro as que você marcou para priorizar; depois,
        as que ainda não têm respostas e as de menor acerto nas questões.
      </p>
      <div style={{
        background: "var(--surface-1)",
        border: "1px solid var(--surface-2)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}>
        {stats.map((s, i) => {
          const consolidated = s.attempts >= INITIAL_DATA_BELOW;
          const pct = s.accuracy != null ? Math.round(s.accuracy * 100) : null;
          const color = pct == null ? "var(--muted-foreground)" : pct >= 70 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
          // One answer at 0% is not an assessment: few answers are shown as counts, never as a coloured percentage.
          const detail =
            s.attempts === 0
              ? "Ainda sem respostas para avaliar."
              : consolidated
                ? `${pct}% de acerto em ${s.attempts} questões.`
                : `${s.correct} ${s.correct === 1 ? "acerto" : "acertos"} em ${s.attempts} ${s.attempts === 1 ? "questão" : "questões"} — dados iniciais.`;
          return (
            <div
              key={s.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 18px",
                borderTop: i > 0 ? "1px solid var(--surface-2)" : undefined,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>
                  {s.name}
                  {s.prioritized && (
                    <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, color: "var(--brand-text, var(--brand))" }}>
                      · priorizada por você
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.5 }}>
                  {detail}
                </div>
              </div>
              {consolidated && pct != null && (
                <span style={{ fontSize: 14, fontWeight: 700, color, flexShrink: 0 }}>{pct}%</span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Collapsible section wrapper ───────────────────────────────────────────────

function CollapsibleSection({
  title, icon: Icon, open, onToggle, summary, children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  open: boolean;
  onToggle: () => void;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <button
        onClick={onToggle}
        style={{
          width: "100%", padding: "16px 20px",
          background: "var(--surface-1)",
          border: "1px solid var(--surface-2)",
          borderRadius: open ? "var(--radius) var(--radius) 0 0" : "var(--radius)",
          display: "flex", alignItems: "center", gap: 12,
          cursor: "pointer", textAlign: "left",
        }}
        className="hover:bg-surface-2/40 transition-colors"
      >
        <Icon size={18} style={{ color: "var(--brand)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          {!open && summary && (
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summary}
            </div>
          )}
        </div>
        {open ? <ChevronUp size={16} style={{ color: "var(--muted-foreground)" }} /> : <ChevronDown size={16} style={{ color: "var(--muted-foreground)" }} />}
      </button>
      {open && (
        <div style={{
          padding: "20px",
          background: "var(--surface-1)",
          border: "1px solid var(--surface-2)",
          borderTop: "none",
          borderRadius: "0 0 var(--radius) var(--radius)",
        }}>
          {children}
        </div>
      )}
    </section>
  );
}

// ── Availability editor (days + hours + pauses + recurring off) ──────────────

function AvailabilityEditor({ prefs, pauses }: { prefs: StudyPlanPrefs; pauses: PauseRow[] }) {
  // Each control changes on screen at once and saves in the background — never
  // locked while the plan re-renders (see lib/use-autosave.ts).
  const daily = useAutosave<number>(prefs.daily_minutes, (m) => setDailyMinutes(m), 800);
  const days = useAutosave(prefs.available_days, (m) => setAvailableDays(m));
  const offDays = useAutosave(prefs.recurring_off_days, (m) => setRecurringOffDays(m));
  // The study days the plan uses: the selected ones minus the recurring days off.
  const studyMask = days.value & ~offDays.value;
  const offRemoves = (days.value & offDays.value) !== 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Time per study day (Karina 2026-11-18): typed in hours and minutes; the
          weekly total is calculated and only shown in the summary below. */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Quanto tempo você pode estudar por dia?</span>
          <SaveNote status={daily.status} />
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
          Informe o tempo de cada dia de estudo. O total da semana é calculado automaticamente.
        </p>
        <DailyTimeFields idPrefix="plano-tempo" minutes={prefs.daily_minutes} onChange={(m) => daily.setValue(m)} />
      </div>

      {/* Study days */}
      <DayToggles
        label="Dias de estudo"
        mask={days.value}
        onToggle={(bit) => days.setValue((m) => m ^ bit)}
        color="var(--brand)"
        status={days.status}
      />

      {/* The weekly total, calculated — the same numbers the plan uses. */}
      <p
        role="status"
        style={{
          margin: 0, padding: "12px 14px", fontSize: 13, lineHeight: 1.5,
          background: "color-mix(in srgb, var(--brand) 8%, transparent)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <strong>Sua disponibilidade:</strong> {availabilityLine(daily.value, studyMask)}
        {offRemoves ? " (dias de folga recorrente já descontados)" : ""}
      </p>

      {/* Recurring off-days (plantão) */}
      <DayToggles
        label="Folga recorrente (plantão)"
        description="Dias da semana que você normalmente não consegue estudar (ex: dias de plantão 24h)."
        mask={offDays.value}
        onToggle={(bit) => offDays.setValue((m) => m ^ bit)}
        color="#f59e0b"
        status={offDays.status}
      />

      {/* Date-range pauses */}
      <DateRangePauses pauses={pauses} />

      {/* A shorter study day for a period */}
      <StudyTimeReductionEditor
        baseMinutes={daily.value}
        reducedMinutes={prefs.temp_daily_minutes}
        reducedUntil={prefs.temp_daily_until}
      />
    </div>
  );
}

function DayToggles({
  label, description, mask, onToggle, color, status,
}: {
  label: string;
  description?: string;
  mask: number;
  onToggle: (bit: number) => void;
  color: string;
  status: SaveStatus;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: description ? 4 : 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>{label}</label>
        <SaveNote status={status} />
      </div>
      {description && (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>{description}</p>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        {DAY_LABELS.map((d, i) => {
          const bit = 1 << i;
          const active = (mask & bit) !== 0;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(bit)}
              className="min-h-11"
              style={{
                flex: 1, minWidth: 0, padding: "10px 0",
                borderRadius: "var(--radius-sm)",
                border: active ? `1px solid ${color}` : "1px solid var(--surface-2)",
                background: active ? `color-mix(in srgb, ${color} 15%, transparent)` : "transparent",
                color: active ? color : "var(--muted-foreground)",
                fontSize: 12, fontWeight: active ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Salvando… / Salvo / não foi possível salvar" next to a setting. */
function SaveNote({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const text =
    status === "saving" ? "Salvando…" : status === "saved" ? "Salvo" : "Não foi possível salvar. Tente de novo.";
  const color = status === "error" ? "var(--destructive)" : status === "saved" ? "var(--brand)" : "var(--muted-foreground)";
  return (
    <span role="status" aria-live="polite" style={{ fontSize: 11, color, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
      {status === "saved" && <Check size={10} />}
      {text}
    </span>
  );
}

function DateRangePauses({ pauses }: { pauses: PauseRow[] }) {
  const [adding, setAdding] = useState(false);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!from || !until) return;
    startTransition(async () => {
      await addPause(from, until, reason || null);
      setAdding(false); setFrom(""); setUntil(""); setReason("");
    });
  }

  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>
        Períodos sem estudo
      </label>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
        Férias, viagens, semanas de prova na faculdade. O plano reorganiza automaticamente.
      </p>

      {pauses.length === 0 && !adding && (
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic", marginBottom: 10 }}>
          Nenhum período cadastrado.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pauses.map((p) => (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            background: "var(--background)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius-sm)",
          }}>
            <Calendar size={14} style={{ color: "var(--muted-foreground)" }} />
            <span style={{ fontSize: 13, flex: 1 }}>
              {formatDate(p.pause_from)} → {formatDate(p.pause_until)}
              {p.reason && <span style={{ marginLeft: 8, color: "var(--muted-foreground)", fontSize: 12 }}>· {p.reason}</span>}
            </span>
            <button
              onClick={() => startTransition(() => removePause(p.id))}
              disabled={pending}
              aria-label="Remover"
              style={{ background: "transparent", border: "none", color: "var(--muted-foreground)", cursor: "pointer", padding: 4 }}
              className="hover:text-destructive"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{
          marginTop: 12, padding: 14,
          background: "var(--background)",
          border: "1px solid var(--surface-2)",
          borderRadius: "var(--radius-sm)",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 4, display: "block" }}>De</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 4, display: "block" }}>Até</label>
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <input
            type="text" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional): Férias, plantão semana cheia…"
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setAdding(false)} disabled={pending} style={btnGhostStyle}>Cancelar</button>
            <button onClick={submit} disabled={pending || !from || !until} style={btnPrimaryStyle}>Adicionar</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            marginTop: 10,
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: "var(--radius-sm)",
            border: "1px dashed var(--surface-2)", background: "transparent",
            fontSize: 13, color: "var(--muted-foreground)", cursor: "pointer",
          }}
          className="hover:border-brand/40 hover:text-foreground"
        >
          <Plus size={14} /> Adicionar período
        </button>
      )}
    </div>
  );
}

/**
 * "Reduzir o tempo de estudo por um período": a shorter study day up to a date,
 * in the same hours-and-minutes field. It replaces the old Leve/Padrão/Intenso levels —
 * there is one time setting now, the daily one (Karina 2026-11-18).
 */
function StudyTimeReductionEditor({
  baseMinutes, reducedMinutes, reducedUntil,
}: {
  baseMinutes: number;
  reducedMinutes: number | null;
  reducedUntil: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const active = reducedMinutes != null && reducedUntil != null;
  const [show, setShow] = useState(active);
  // Suggested: half of the regular time, in steps of 5 minutes.
  const suggested = Math.max(10, Math.round(baseMinutes / 2 / 5) * 5);
  // null while what is typed is not a valid time — "Aplicar" then stays off.
  const [minutes, setMinutes] = useState<number | null>(reducedMinutes ?? suggested);
  const [until, setUntil] = useState<string>(reducedUntil ?? "");
  const valid = minutes != null && minutes < baseMinutes && until !== "";

  if (!show) {
    // Nothing shorter than the minimum to offer.
    if (baseMinutes <= 10) return null;
    return (
      <div>
        <button
          type="button"
          onClick={() => setShow(true)}
          className="min-h-11 hover:text-foreground"
          style={{
            fontSize: 13, color: "var(--muted-foreground)", textAlign: "left",
            background: "transparent", border: "none", cursor: "pointer", padding: 0,
            textDecoration: "underline",
          }}
        >
          Reduzir o tempo de estudo por um período (semana corrida, prova na faculdade…)
        </button>
      </div>
    );
  }

  return (
    <div>
      <span style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
        Reduzir o tempo de estudo por um período
      </span>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
        {active
          ? `Tempo reduzido para ${formatDuration(reducedMinutes)} por dia de estudo até ${formatDateLong(reducedUntil)}. Depois, o plano volta a ${formatDuration(baseMinutes)} por dia.`
          : `Até a data escolhida, o plano usa o tempo reduzido. Depois, volta a ${formatDuration(baseMinutes)} por dia de estudo.`}
      </p>
      <div style={{
        padding: 14, background: "var(--background)",
        border: "1px solid var(--surface-2)", borderRadius: "var(--radius-sm)",
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, display: "block" }}>
          Tempo por dia de estudo nesse período
        </span>
        <DailyTimeFields
          idPrefix="plano-tempo-reduzido"
          minutes={minutes ?? suggested}
          onChange={setMinutes}
          onInvalid={() => setMinutes(null)}
          shortcuts={false}
          maxMinutes={baseMinutes - 1}
          maxMessage={`Informe um tempo menor que o seu tempo diário (${formatDuration(baseMinutes)}).`}
        />
        <label htmlFor="plano-tempo-reduzido-ate" style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", margin: "12px 0 6px", display: "block" }}>
          Até
        </label>
        <input
          id="plano-tempo-reduzido-ate"
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="min-h-11"
          style={{ ...inputStyle, fontSize: 16, maxWidth: 220, marginBottom: 12 }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => {
              startTransition(async () => {
                await setStudyTimeReduction(null, null);
                setShow(false);
              });
            }}
            disabled={pending}
            className="min-h-11"
            style={btnGhostStyle}
          >
            {active ? "Remover" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!valid || minutes == null) return;
              startTransition(() => setStudyTimeReduction(minutes, until));
            }}
            disabled={pending || !valid}
            className="min-h-11"
            style={{ ...btnPrimaryStyle, opacity: pending || !valid ? 0.5 : 1 }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Content editor (specialties + content types) ─────────────────────────────

function ContentEditor({ prefs, specialties }: { prefs: StudyPlanPrefs; specialties: Specialty[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Karina's wording (2026-11-18). */}
      <SpecialtyMultiSelect
        label="Áreas que você deseja priorizar"
        description="Selecione as áreas em que sente mais dificuldade ou às quais deseja dedicar mais atenção. As demais continuam participando do plano."
        currentIds={prefs.focus_specialty_ids}
        specialties={specialties}
        onSave={setFocusSpecialties}
        chipColor="var(--brand)"
        emptyText="Nenhuma área priorizada manualmente. O plano segue os critérios automáticos de prioridade."
        selectedText={(n) => `${n} ${n === 1 ? "área priorizada" : "áreas priorizadas"} manualmente. As demais continuam participando do plano.`}
      />

      <SpecialtyMultiSelect
        label="Áreas excluídas do planejamento"
        description="As áreas marcadas não entram na programação nem na previsão. Excluir uma área do planejamento não impede seu acesso livre a ela na plataforma."
        currentIds={prefs.excluded_specialty_ids}
        specialties={specialties}
        onSave={setExcludedSpecialties}
        chipColor="#ef4444"
        emptyText="Nenhuma área excluída. Todas as áreas disponíveis serão consideradas no planejamento."
        selectedText={(n) => `${n} ${n === 1 ? "área excluída" : "áreas excluídas"} do planejamento. A previsão considera apenas as áreas mantidas.`}
      />

      <ContentTypesEditor prefs={prefs} />
    </div>
  );
}

function SpecialtyMultiSelect({
  label, description, currentIds, specialties, onSave, chipColor, emptyText, selectedText,
}: {
  label: string;
  description: string;
  currentIds: number[];
  specialties: Specialty[];
  onSave: (ids: number[]) => Promise<void>;
  chipColor: string;
  emptyText: string;
  /** What the line under the chips says when N areas are selected. */
  selectedText: (count: number) => string;
}) {
  // The chip flips at once and the list saves itself; quick clicks are coalesced
  // into one save of the final selection. (It used to start the save INSIDE the
  // state updater, which React refuses, so a click neither selected nor saved.)
  const { value: ids, setValue, status } = useAutosave<number[]>(currentIds, (next) => onSave(next));
  const selected = new Set(ids);

  function toggle(id: number) {
    setValue((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>{label}</label>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>{description}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {specialties.map((s) => {
          const active = selected.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(s.id)}
              className="min-h-11"
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: active ? `1px solid ${chipColor}` : "1px solid var(--surface-2)",
                background: active ? `color-mix(in srgb, ${chipColor} 15%, transparent)` : "transparent",
                color: active ? chipColor : "var(--foreground)",
                fontSize: 12, fontWeight: active ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {active && <Check size={11} style={{ display: "inline", marginRight: 4 }} />}
              {s.name}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, lineHeight: 1.5 }}>
        <span style={{ color: "var(--muted-foreground)", flex: 1, minWidth: 0 }}>
          {selected.size === 0 ? emptyText : selectedText(selected.size)}
        </span>
        <SaveNote status={status} />
      </div>
    </div>
  );
}

function ContentTypesEditor({ prefs }: { prefs: StudyPlanPrefs }) {
  const { value: types, setValue, status } = useAutosave<ContentType[]>(
    prefs.preferred_content_types,
    (next) => setContentTypes(next),
  );
  const selected = new Set(types);

  function toggle(type: ContentType) {
    setValue((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Tipos de conteúdo que você quer no plano</label>
        <SaveNote status={status} />
      </div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12, lineHeight: 1.4 }}>
        Desmarque tipos que você não gosta (ex: se você não estuda por áudio, desmarque MedVoice).
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PLAN_CONTENT_TYPES.map((type) => {
          const active = selected.has(type);
          const Icon = ICON_MAP[type];
          const color = ITEM_COLOR[type];
          return (
            <label
              key={type}
              className="min-h-11"
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                background: "var(--background)",
                border: active ? `1px solid ${color}` : "1px solid var(--surface-2)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(type)}
                style={{ width: 16, height: 16, accentColor: color }}
              />
              <Icon size={16} style={{ color: active ? color : "var(--muted-foreground)" }} />
              <span style={{ fontSize: 14, flex: 1, color: active ? "var(--foreground)" : "var(--muted-foreground)" }}>
                {CONTENT_TYPE_LABELS[type]}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── Notifications editor ──────────────────────────────────────────────────────

function NotificationsEditor({ prefs }: { prefs: StudyPlanPrefs }) {
  // Initialized from the saved DB prefs so the toggles reflect the user's actual choice.
  const weekly = useAutosave(prefs.email_weekly_summary, (v) => setEmailPrefs({ email_weekly_summary: v }), 300);
  const daily = useAutosave(prefs.email_daily_plan, (v) => setEmailPrefs({ email_daily_plan: v }), 300);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label className="min-h-11" style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={weekly.value}
          onChange={(e) => weekly.setValue(e.target.checked)}
          className="accent-brand"
          style={{ width: 16, height: 16 }}
        />
        <Mail size={14} style={{ color: "var(--muted-foreground)" }} />
        <div style={{ flex: 1 }}>
          <div>Resumo semanal por email</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Toda segunda de manhã com o resumo da semana</div>
        </div>
        <SaveNote status={weekly.status} />
      </label>
      <label className="min-h-11" style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={daily.value}
          onChange={(e) => daily.setValue(e.target.checked)}
          className="accent-brand"
          style={{ width: 16, height: 16 }}
        />
        <Calendar size={14} style={{ color: "var(--muted-foreground)" }} />
        <div style={{ flex: 1 }}>
          <div>Plano diário por email</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Receba o plano do dia todo dia de manhã</div>
        </div>
        <SaveNote status={daily.status} />
      </label>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", fontStyle: "italic", marginTop: 8, padding: "10px 14px", background: "color-mix(in srgb, var(--brand) 5%, transparent)", borderRadius: "var(--radius-sm)" }}>
        Notificações no app aparecem no sino do header.
      </p>
    </div>
  );
}

// ── Advanced editor ───────────────────────────────────────────────────────────

function AdvancedEditor({ prefs }: { prefs: StudyPlanPrefs }) {
  const sensitivity = useAutosave<WeaknessSensitivity>(
    prefs.weakness_sensitivity,
    (v) => setAdvancedPrefs({ weakness_sensitivity: v }),
    300,
  );
  // The box holds what is TYPED; only a valid number (5 to 500) or an empty box
  // ("sem limite") is saved, after a pause, so "30" is never saved as "3" first.
  const [capText, setCapText] = useState(prefs.flashcard_daily_cap == null ? "" : String(prefs.flashcard_daily_cap));
  const cap = useAutosave<number | null>(prefs.flashcard_daily_cap, (v) => setAdvancedPrefs({ flashcard_daily_cap: v }), 800);
  const capNum = capText.trim() === "" ? null : Number(capText);
  const capInvalid = capNum != null && (!Number.isInteger(capNum) || capNum < 5 || capNum > 500);
  // Only complain once the student leaves the box — "3" is a normal step towards "30".
  const [capLeft, setCapLeft] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <label htmlFor="plano-sensibilidade" style={{ fontSize: 13, fontWeight: 600 }}>
            Sensibilidade a especialidades fracas
          </label>
          <SaveNote status={sensitivity.status} />
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10 }}>
          Quanto o algoritmo prioriza especialidades onde você tem desempenho baixo.
        </p>
        <select
          id="plano-sensibilidade"
          value={sensitivity.value}
          onChange={(e) => sensitivity.setValue(e.target.value as WeaknessSensitivity)}
          className="min-h-11"
          style={selectStyle}
        >
          <option value="strict">Estrita — fortemente prioriza fracas</option>
          <option value="balanced">Equilibrada — recomendado</option>
          <option value="off">Desligada — distribuição uniforme</option>
        </select>
      </div>

      <div>
        {/* The 60D materials are not part of this plan (they get their own schedule on the 60D page). */}
        <div style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>MedHelp 60D</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5, marginTop: 2 }}>
            A Fórmula MedHelp, os MemoreCards e os Simulados 100Q ficam na página do MedHelp 60D e não são
            programados pelo Meu Plano.
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <label htmlFor="plano-limite-flashcards" style={{ fontSize: 13, fontWeight: 600 }}>
            Limite diário de flashcards
          </label>
          <SaveNote status={cap.status} />
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10 }}>
          Útil quando você volta de uma pausa e tem 300 cartas atrasadas. Limita o que aparece no plano.
        </p>
        <input
          id="plano-limite-flashcards"
          type="number"
          inputMode="numeric"
          min={5} max={500}
          value={capText}
          placeholder="Sem limite"
          aria-invalid={capInvalid && capLeft}
          onBlur={() => setCapLeft(true)}
          onFocus={() => setCapLeft(false)}
          onChange={(e) => {
            const t = e.target.value;
            setCapText(t);
            const n = t.trim() === "" ? null : Number(t);
            if (n == null || (Number.isInteger(n) && n >= 5 && n <= 500)) cap.setValue(n);
          }}
          className="min-h-11"
          style={{ ...inputStyle, maxWidth: 160 }}
        />
        {capInvalid && capLeft && (
          <p role="alert" style={{ fontSize: 12, color: "var(--destructive)", marginTop: 6 }}>
            Use um número entre 5 e 500, ou deixe em branco para não limitar.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Summary helpers ───────────────────────────────────────────────────────────

function contentSummary(p: StudyPlanPrefs, specialties: Specialty[]): string {
  const focusCount = p.focus_specialty_ids.length;
  const excludedCount = p.excluded_specialty_ids.length;
  // Count only what the picker offers (an old row may still carry "lesson").
  const typeCount = p.preferred_content_types.filter((t) => PLAN_CONTENT_TYPES.includes(t)).length;
  const parts: string[] = [];
  if (focusCount > 0) parts.push(`${focusCount} priorizada${focusCount !== 1 ? "s" : ""}`);
  if (excludedCount > 0) parts.push(`${excludedCount} excluída${excludedCount !== 1 ? "s" : ""}`);
  parts.push(`${typeCount}/${PLAN_CONTENT_TYPES.length} tipos`);
  return parts.join(" · ");
}

function notificationSummary(p: StudyPlanPrefs): string {
  const parts: string[] = [];
  if (p.email_weekly_summary) parts.push("Resumo semanal");
  if (p.email_daily_plan) parts.push("Plano diário");
  if (parts.length === 0) parts.push("Emails desativados");
  return parts.join(" · ");
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--surface-2)",
  background: "var(--background)",
  color: "var(--foreground)",
  fontSize: 13,
  outline: "none",
};
const selectStyle = { ...inputStyle, maxWidth: 320 };
const btnPrimaryStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "var(--radius-sm)",
  background: "var(--brand)",
  color: "var(--brand-fg)",
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnGhostStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--muted-foreground)",
  border: "1px solid var(--surface-2)",
  fontSize: 13,
  cursor: "pointer",
};

// ── Tiny utils ────────────────────────────────────────────────────────────────

/** "30 de novembro" — for a sentence (the short form ends in a period: "30 de nov."). */
function formatDateLong(dateKey: string): string {
  return new Date(dateKey + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

function formatDate(dateKey: string): string {
  return new Date(dateKey + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric", month: "short",
  });
}
