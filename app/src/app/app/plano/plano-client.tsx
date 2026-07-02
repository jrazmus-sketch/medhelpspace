"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ClipboardList, ScrollText, Headphones, Layers, Sparkles, ChevronRight,
  Settings, Check, AlertCircle, Mail, Calendar, Clock, Target, Plus,
  Trash2, Sparkles as Star, ChevronDown, ChevronUp, Sliders, Pause, X, FileStack,
} from "lucide-react";
import {
  setIntensity, setTempIntensity, setAvailableDays, setRecurringOffDays,
  setWeeklyHours, addPause, removePause, skipToday,
  setFocusSpecialties, setExcludedSpecialties,
  setContentTypes, setEmailPrefs, setAdvancedPrefs,
} from "@/actions/study-plan";
import type {
  DerivedPlan, PlanItem, StudyPlanPrefs,
  Intensity, ContentType, WeaknessSensitivity,
} from "@/lib/study-plan/derive";
import { CalibrateWizard } from "./calibrate-wizard";

const ICON_MAP: Record<PlanItem["iconHint"], React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  quiz: ClipboardList,
  simulado: FileStack,
  lesson: ScrollText,
  audio: Headphones,
  flashcards: Layers,
  memorecards: Sparkles,
};

const ITEM_COLOR: Record<PlanItem["iconHint"], string> = {
  quiz: "var(--c-questoes)",
  simulado: "#0891b2",
  lesson: "var(--c-resumos)",
  audio: "var(--c-medvoice)",
  flashcards: "#a78bfa",
  memorecards: "#7c3aed",
};

const INTENSITY_LABEL: Record<Intensity, { label: string; sub: string }> = {
  leve:    { label: "Leve",    sub: "~30 min/dia base · 2 especialidades" },
  padrao:  { label: "Padrão",  sub: "~60 min/dia base · 3 especialidades" },
  intenso: { label: "Intenso", sub: "~120 min/dia base · 4 especialidades" },
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  quiz: "Questões",
  simulado: "Simulados",
  lesson: "Resumos / Fórmula",
  audio: "MedVoice (áudio)",
  flashcards: "Flashcards",
  memorecards: "Memorecards (60D)",
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
}: {
  plan: DerivedPlan | null;
  prefs: StudyPlanPrefs;
  specialties: Specialty[];
  pauses: PauseRow[];
  welcomedAt: string | null;
  examDate: string | null;
  examDateLabel: string | null;
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
          specialties={specialties}
          initialAvailableDays={prefs.available_days}
          initialWeeklyHours={prefs.weekly_hours}
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
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
              Hoje · ~{plan.totalEstimatedMinutes} min
            </h2>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              {plan.progressToday.questionsAnswered} questões · {plan.progressToday.lessonsCompleted} aulas
            </span>
          </div>
          {plan.paused ? (
            <PausedState plan={plan} />
          ) : plan.items.length === 0 ? (
            <EmptyPlanState />
          ) : (
            <PlanItemsList items={plan.items} onSkipToday={() => skipToday("Folga de hoje")} />
          )}
        </section>

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
        <CollapsibleSection
          title="Disponibilidade"
          icon={Calendar}
          open={openSections.disponibilidade}
          onToggle={() => toggleSection("disponibilidade")}
          summary={availabilitySummary(prefs)}
        >
          <AvailabilityEditor prefs={prefs} pauses={pauses} />
        </CollapsibleSection>

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
          summary="Sensibilidade, MedHelp 60D, limites"
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
          Diga quantas horas você consegue estudar por semana e quais especialidades são suas mais fracas.
          O plano se adapta automaticamente.
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
            <Link
              key={i}
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
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.subtitle} · ~{item.estimatedMinutes} min
                </div>
              </div>
              <ChevronRight size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
            </Link>
          );
        })}
      </div>
      <button
        onClick={() => {
          if (confirm("Pular o estudo de hoje? O plano vai redistribuir o conteúdo nos próximos dias.")) {
            startTransition(async () => { await onSkipToday(); });
          }
        }}
        style={{
          marginTop: 12, fontSize: 12, color: "var(--muted-foreground)",
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
      <h2 style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 12 }}>
        Onde focar
      </h2>
      <div style={{
        background: "var(--surface-1)",
        border: "1px solid var(--surface-2)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
      }}>
        {stats.map((s, i) => {
          const pct = s.accuracy != null ? Math.round(s.accuracy * 100) : null;
          const color = pct == null ? "var(--muted-foreground)" : pct >= 70 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
          return (
            <div
              key={s.id}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "12px 18px",
                borderTop: i > 0 ? "1px solid var(--surface-2)" : undefined,
              }}
            >
              <span style={{ fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                {s.attempts > 0 ? `${s.attempts} questões` : "sem dados"}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color, width: 50, textAlign: "right" }}>
                {pct != null ? `${pct}%` : "—"}
              </span>
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
  const [pending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  function fire(action: () => Promise<void>, msg: string) {
    startTransition(async () => {
      await action();
      setSavedMsg(msg);
      setTimeout(() => setSavedMsg(null), 2000);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Weekly hours */}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Horas por semana</label>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--brand)", fontFamily: "var(--font-geist-mono)" }}>
            {prefs.weekly_hours ?? "—"}{prefs.weekly_hours ? "h" : ""}
          </span>
        </div>
        <input
          type="range"
          min={3} max={40} step={1}
          defaultValue={prefs.weekly_hours ?? 15}
          onChange={(e) => fire(() => setWeeklyHours(Number(e.target.value)), "Horas salvas")}
          disabled={pending}
          style={{ width: "100%", accentColor: "var(--brand)" }}
        />
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          {prefs.weekly_hours == null ? "Usando intensidade padrão" : `Distribuído nos dias disponíveis`}
        </p>
      </div>

      {/* Available days */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block" }}>
          Dias disponíveis para estudar
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          {DAY_LABELS.map((label, i) => {
            const bit = 1 << i;
            const active = (prefs.available_days & bit) !== 0;
            return (
              <button
                key={i}
                onClick={() => fire(() => setAvailableDays(prefs.available_days ^ bit), active ? `${label} desabilitado` : `${label} habilitado`)}
                disabled={pending}
                style={{
                  flex: 1, padding: "10px 0",
                  borderRadius: "var(--radius-sm)",
                  border: active ? "1px solid var(--brand)" : "1px solid var(--surface-2)",
                  background: active ? "color-mix(in srgb, var(--brand) 15%, transparent)" : "transparent",
                  color: active ? "var(--brand)" : "var(--muted-foreground)",
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: pending ? "not-allowed" : "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Recurring off-days (plantão) */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>
          Folga recorrente (plantão)
        </label>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
          Dias da semana que você normalmente não consegue estudar (ex: dias de plantão 24h).
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {DAY_LABELS.map((label, i) => {
            const bit = 1 << i;
            const active = (prefs.recurring_off_days & bit) !== 0;
            return (
              <button
                key={i}
                onClick={() => fire(() => setRecurringOffDays(prefs.recurring_off_days ^ bit), active ? `${label} sem plantão` : `${label} marcado como plantão`)}
                disabled={pending}
                style={{
                  flex: 1, padding: "10px 0",
                  borderRadius: "var(--radius-sm)",
                  border: active ? "1px solid #f59e0b" : "1px solid var(--surface-2)",
                  background: active ? "color-mix(in srgb, #f59e0b 15%, transparent)" : "transparent",
                  color: active ? "#f59e0b" : "var(--muted-foreground)",
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: pending ? "not-allowed" : "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date-range pauses */}
      <DateRangePauses pauses={pauses} />

      {/* Intensity (lives here because it interacts with availability) */}
      <IntensityEditor currentIntensity={prefs.intensity} tempIntensity={prefs.temp_intensity} tempUntil={prefs.temp_intensity_until} />

      {savedMsg && (
        <span style={{ fontSize: 12, color: "var(--brand)", display: "flex", alignItems: "center", gap: 4 }}>
          <Check size={12} />
          {savedMsg}
        </span>
      )}
    </div>
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

function IntensityEditor({
  currentIntensity, tempIntensity, tempUntil,
}: {
  currentIntensity: Intensity;
  tempIntensity: Intensity | null;
  tempUntil: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [showTemp, setShowTemp] = useState(!!tempIntensity);
  const [tempVal, setTempVal] = useState<Intensity>(tempIntensity ?? "leve");
  const [tempUntilVal, setTempUntilVal] = useState<string>(tempUntil ?? "");

  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "block" }}>
        Intensidade base
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" style={{ marginBottom: 12 }}>
        {(["leve", "padrao", "intenso"] as const).map((i) => {
          const active = currentIntensity === i;
          return (
            <button
              key={i}
              onClick={() => startTransition(() => setIntensity(i))}
              disabled={pending}
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius)",
                border: active ? "2px solid var(--brand)" : "1px solid var(--surface-2)",
                background: active ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "var(--background)",
                cursor: pending ? "not-allowed" : "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: active ? "var(--brand)" : "var(--foreground)" }}>
                {INTENSITY_LABEL[i].label}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                {INTENSITY_LABEL[i].sub}
              </div>
            </button>
          );
        })}
      </div>

      {!showTemp ? (
        <button
          onClick={() => setShowTemp(true)}
          style={{
            fontSize: 12, color: "var(--muted-foreground)",
            background: "transparent", border: "none", cursor: "pointer",
            textDecoration: "underline",
          }}
          className="hover:text-foreground"
        >
          Reduzir intensidade temporariamente (semana corrida, prova na faculdade…)
        </button>
      ) : (
        <div style={{
          padding: 14, background: "var(--background)",
          border: "1px solid var(--surface-2)", borderRadius: "var(--radius-sm)",
        }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, display: "block" }}>
            Intensidade temporária
          </label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["leve", "padrao", "intenso"] as const).map((i) => (
              <button
                key={i}
                onClick={() => setTempVal(i)}
                style={{
                  flex: 1, padding: "8px 0",
                  borderRadius: "var(--radius-sm)",
                  border: tempVal === i ? "1px solid var(--brand)" : "1px solid var(--surface-2)",
                  background: tempVal === i ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "transparent",
                  color: tempVal === i ? "var(--brand)" : "var(--foreground)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                {INTENSITY_LABEL[i].label}
              </button>
            ))}
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6, display: "block" }}>Até</label>
          <input type="date" value={tempUntilVal} onChange={(e) => setTempUntilVal(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                startTransition(async () => {
                  await setTempIntensity(null, null);
                  setShowTemp(false);
                });
              }}
              disabled={pending}
              style={btnGhostStyle}
            >
              Remover
            </button>
            <button
              onClick={() => {
                if (!tempUntilVal) return;
                startTransition(() => setTempIntensity(tempVal, tempUntilVal));
              }}
              disabled={pending || !tempUntilVal}
              style={btnPrimaryStyle}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Content editor (specialties + content types) ─────────────────────────────

function ContentEditor({ prefs, specialties }: { prefs: StudyPlanPrefs; specialties: Specialty[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <SpecialtyMultiSelect
        label="Especialidades fracas (priorizar)"
        description="O plano vai dedicar mais tempo a estas. Selecione quantas quiser."
        helpText="O sistema também identifica fracas automaticamente conforme você responde questões."
        currentIds={prefs.focus_specialty_ids}
        specialties={specialties}
        onSave={setFocusSpecialties}
        chipColor="var(--brand)"
        emptyText="Nenhuma marcada · plano automático por desempenho"
      />

      <SpecialtyMultiSelect
        label="Especialidades excluídas"
        description="Nunca serão agendadas. Cuidado: a prova cobre todas as áreas."
        helpText="Use só se você tem certeza (ex: prova R1 só de clínica)."
        currentIds={prefs.excluded_specialty_ids}
        specialties={specialties}
        onSave={setExcludedSpecialties}
        chipColor="#ef4444"
        emptyText="Nenhuma excluída · plano cobre tudo"
      />

      <ContentTypesEditor prefs={prefs} />
    </div>
  );
}

function SpecialtyMultiSelect({
  label, description, helpText, currentIds, specialties, onSave, chipColor, emptyText,
}: {
  label: string;
  description: string;
  helpText: string;
  currentIds: number[];
  specialties: Specialty[];
  onSave: (ids: number[]) => Promise<void>;
  chipColor: string;
  emptyText: string;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(currentIds));
  const [pending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      startTransition(async () => {
        await onSave([...next]);
        setSavedMsg("Salvo");
        setTimeout(() => setSavedMsg(null), 1500);
      });
      return next;
    });
  }

  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>{label}</label>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 6, lineHeight: 1.4 }}>{description}</p>
      <p style={{ fontSize: 11, color: "var(--muted-foreground)", opacity: 0.7, marginBottom: 10 }}>{helpText}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {specialties.map((s) => {
          const active = selected.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              disabled={pending}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: active ? `1px solid ${chipColor}` : "1px solid var(--surface-2)",
                background: active ? `color-mix(in srgb, ${chipColor} 15%, transparent)` : "transparent",
                color: active ? chipColor : "var(--foreground)",
                fontSize: 12, fontWeight: active ? 600 : 500,
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              {active && <Check size={11} style={{ display: "inline", marginRight: 4 }} />}
              {s.name}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
        <span style={{ color: "var(--muted-foreground)" }}>
          {selected.size === 0 ? emptyText : `${selected.size} selecionada${selected.size !== 1 ? "s" : ""}`}
        </span>
        {savedMsg && <span style={{ color: "var(--brand)", display: "flex", alignItems: "center", gap: 3 }}><Check size={10} />{savedMsg}</span>}
      </div>
    </div>
  );
}

function ContentTypesEditor({ prefs }: { prefs: StudyPlanPrefs }) {
  const [selected, setSelected] = useState<Set<ContentType>>(new Set(prefs.preferred_content_types));
  const [pending, startTransition] = useTransition();

  function toggle(type: ContentType) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      startTransition(() => setContentTypes([...next]));
      return next;
    });
  }

  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>
        Tipos de conteúdo que você quer no plano
      </label>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12, lineHeight: 1.4 }}>
        Desmarque tipos que você não gosta (ex: se você não estuda por áudio, desmarque MedVoice).
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(["quiz", "simulado", "lesson", "audio", "flashcards", "memorecards"] as ContentType[]).map((type) => {
          const active = selected.has(type);
          const Icon = ICON_MAP[type];
          const color = ITEM_COLOR[type];
          return (
            <label
              key={type}
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
                disabled={pending}
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
  const [pending, startTransition] = useTransition();
  // We don't include email prefs in StudyPlanPrefs core type — fetch them from a separate hook later.
  // For now, default-render based on form state.
  const [weeklySummary, setWeeklySummary] = useState(true);  // server default
  const [dailyPlan, setDailyPlan] = useState(false);

  function update(patch: { email_weekly_summary?: boolean; email_daily_plan?: boolean }) {
    startTransition(() => setEmailPrefs(patch));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={weeklySummary}
          onChange={(e) => { setWeeklySummary(e.target.checked); update({ email_weekly_summary: e.target.checked }); }}
          disabled={pending}
          className="accent-brand"
          style={{ width: 16, height: 16 }}
        />
        <Mail size={14} style={{ color: "var(--muted-foreground)" }} />
        <div>
          <div>Resumo semanal por email</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Toda segunda de manhã com o resumo da semana</div>
        </div>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={dailyPlan}
          onChange={(e) => { setDailyPlan(e.target.checked); update({ email_daily_plan: e.target.checked }); }}
          disabled={pending}
          className="accent-brand"
          style={{ width: 16, height: 16 }}
        />
        <Calendar size={14} style={{ color: "var(--muted-foreground)" }} />
        <div>
          <div>Plano diário por email</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Receba o plano do dia todo dia de manhã</div>
        </div>
      </label>
      <p style={{ fontSize: 11, color: "var(--muted-foreground)", fontStyle: "italic", marginTop: 8, padding: "10px 14px", background: "color-mix(in srgb, var(--brand) 5%, transparent)", borderRadius: "var(--radius-sm)" }}>
        WhatsApp em breve. Notificações no app aparecem no sino do header.
      </p>
    </div>
  );
}

// ── Advanced editor ───────────────────────────────────────────────────────────

function AdvancedEditor({ prefs }: { prefs: StudyPlanPrefs }) {
  const [pending, startTransition] = useTransition();

  function update(patch: Parameters<typeof setAdvancedPrefs>[0]) {
    startTransition(() => setAdvancedPrefs(patch));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>
          Sensibilidade a especialidades fracas
        </label>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10 }}>
          Quanto o algoritmo prioriza especialidades onde você tem desempenho baixo.
        </p>
        <select
          defaultValue={prefs.weakness_sensitivity}
          onChange={(e) => update({ weakness_sensitivity: e.target.value as WeaknessSensitivity })}
          disabled={pending}
          style={selectStyle}
        >
          <option value="strict">Estrita — fortemente prioriza fracas</option>
          <option value="balanced">Equilibrada — recomendado</option>
          <option value="off">Desligada — distribuição uniforme</option>
        </select>
      </div>

      <div>
        <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            defaultChecked={prefs.include_60d}
            onChange={(e) => update({ include_60d: e.target.checked })}
            disabled={pending}
            style={{ width: 16, height: 16, accentColor: "var(--brand)" }}
          />
          <div>
            <div style={{ fontWeight: 600 }}>Incluir MedHelp 60D no plano</div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              Quando o módulo desbloquear, ele entra automaticamente na sua rotina diária.
            </div>
          </div>
        </label>
      </div>

      <div>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>
          Limite diário de flashcards
        </label>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10 }}>
          Útil quando você volta de uma pausa e tem 300 cartas atrasadas. Limita o que aparece no plano.
        </p>
        <input
          type="number"
          min={5} max={500}
          defaultValue={prefs.flashcard_daily_cap ?? ""}
          placeholder="Sem limite"
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : null;
            update({ flashcard_daily_cap: v });
          }}
          disabled={pending}
          style={{ ...inputStyle, maxWidth: 160 }}
        />
      </div>
    </div>
  );
}

// ── Summary helpers ───────────────────────────────────────────────────────────

function availabilitySummary(p: StudyPlanPrefs): string {
  const days = countBits(p.available_days);
  const offDays = countBits(p.recurring_off_days);
  const hours = p.weekly_hours ?? "—";
  const parts = [
    `${hours}h/semana`,
    `${days} dia${days !== 1 ? "s" : ""}`,
  ];
  if (offDays > 0) parts.push(`${offDays} de plantão`);
  return parts.join(" · ");
}

function contentSummary(p: StudyPlanPrefs, specialties: Specialty[]): string {
  const focusCount = p.focus_specialty_ids.length;
  const excludedCount = p.excluded_specialty_ids.length;
  const typeCount = p.preferred_content_types.length;
  const parts: string[] = [];
  if (focusCount > 0) parts.push(`${focusCount} focada${focusCount !== 1 ? "s" : ""}`);
  if (excludedCount > 0) parts.push(`${excludedCount} excluída${excludedCount !== 1 ? "s" : ""}`);
  parts.push(`${typeCount}/5 tipos`);
  return parts.join(" · ");
}

function notificationSummary(p: StudyPlanPrefs): string {
  // We don't track email prefs here yet — placeholder
  return "Resumo semanal · sem WhatsApp ainda";
  void p;
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

function countBits(mask: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) n++;
  return n;
}

function formatDate(dateKey: string): string {
  return new Date(dateKey + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric", month: "short",
  });
}
