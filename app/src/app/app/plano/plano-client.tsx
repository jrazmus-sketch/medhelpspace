"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ClipboardList, ScrollText, Headphones, Layers, Sparkles, ChevronRight,
  PauseCircle, PlayCircle, Settings, Check, AlertCircle, Mail, Calendar,
} from "lucide-react";
import {
  updateStudyPlanPreferences,
  pauseStudyPlan,
  type Intensity,
} from "@/actions/study-plan";
import type { DerivedPlan, PlanItem } from "@/lib/study-plan/derive";

const ICON_MAP: Record<PlanItem["iconHint"], React.ComponentType<{ size?: number; className?: string }>> = {
  quiz: ClipboardList,
  lesson: ScrollText,
  audio: Headphones,
  flashcard: Layers,
  memorecards: Sparkles,
};

const ITEM_COLOR: Record<PlanItem["iconHint"], string> = {
  quiz: "var(--c-questoes)",
  lesson: "var(--c-resumos)",
  audio: "var(--c-medvoice)",
  flashcard: "#a78bfa",
  memorecards: "#7c3aed",
};

const INTENSITY_LABEL: Record<Intensity, { label: string; sub: string }> = {
  leve:    { label: "Leve",    sub: "~30 min/dia · 2 especialidades" },
  padrao:  { label: "Padrão",  sub: "~60 min/dia · 3 especialidades" },
  intenso: { label: "Intenso", sub: "~120 min/dia · 4 especialidades" },
};

export function PlanoClient({
  plan,
  prefs,
  specialties,
}: {
  plan: DerivedPlan | null;
  prefs: {
    intensity: Intensity;
    focus_specialty_id: number | null;
    email_weekly_summary: boolean;
    email_daily_plan: boolean;
    paused_until: string | null;
  };
  specialties: { id: number; name: string; slug: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function savePrefs(patch: Partial<typeof prefs>) {
    startTransition(async () => {
      await updateStudyPlanPreferences({
        intensity: patch.intensity,
        focus_specialty_id: patch.focus_specialty_id,
        email_weekly_summary: patch.email_weekly_summary,
        email_daily_plan: patch.email_daily_plan,
      });
      setSavedMessage("Plano atualizado");
      setTimeout(() => setSavedMessage(null), 2500);
    });
  }

  function handleTogglePause() {
    startTransition(async () => {
      if (plan?.paused) {
        await pauseStudyPlan(null);
      } else {
        // Pause for 14 days by default — user can edit later
        const until = new Date();
        until.setDate(until.getDate() + 14);
        await pauseStudyPlan(until.toISOString().split("T")[0]);
      }
      setSavedMessage(plan?.paused ? "Plano retomado" : "Plano pausado por 14 dias");
      setTimeout(() => setSavedMessage(null), 2500);
    });
  }

  if (!plan) {
    return (
      <div style={{ padding: 20, borderRadius: "var(--radius)", background: "var(--surface-1)", border: "1px solid var(--surface-2)", textAlign: "center" }}>
        <p style={{ color: "var(--muted-foreground)" }}>Não foi possível carregar seu plano. Verifique seu cohort.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Today's plan ─────────────────────────────────────────────────────── */}
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
          <PausedState pausedUntil={plan.pausedUntil} onResume={handleTogglePause} pending={pending} />
        ) : plan.items.length === 0 ? (
          <EmptyPlanState />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {plan.items.map((item, i) => {
              const Icon = ICON_MAP[item.iconHint];
              const color = ITEM_COLOR[item.iconHint];
              return (
                <Link
                  key={i}
                  href={item.href}
                  className="group"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "16px 18px",
                    background: "var(--surface-1)",
                    border: "1px solid var(--surface-2)",
                    borderRadius: "var(--radius)",
                    textDecoration: "none",
                    transition: "border-color 0.15s, background 0.15s, transform 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: `color-mix(in srgb, ${color} 15%, transparent)`,
                      color,
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.01em", color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        )}
      </section>

      {/* ── Weakest specialties ──────────────────────────────────────────────── */}
      {plan.weakestSpecialties.length > 0 && (
        <section>
          <h2 style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 12 }}>
            Onde focar
          </h2>
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--surface-2)",
              borderRadius: "var(--radius)",
              overflow: "hidden",
            }}
          >
            {plan.weakestSpecialties.map((s, i) => {
              const pct = s.accuracy != null ? Math.round(s.accuracy * 100) : null;
              const color = pct == null ? "var(--muted-foreground)" : pct >= 70 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
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
      )}

      {/* ── Preferences ──────────────────────────────────────────────────────── */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
            Ajustar plano
          </h2>
          {savedMessage && (
            <span style={{ fontSize: 12, color: "var(--brand)", display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={12} />
              {savedMessage}
            </span>
          )}
        </div>

        <div
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Intensity */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "block" }}>
              Intensidade
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["leve", "padrao", "intenso"] as const).map((i) => {
                const active = prefs.intensity === i;
                return (
                  <button
                    key={i}
                    onClick={() => !pending && savePrefs({ intensity: i })}
                    disabled={pending}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius)",
                      border: active ? "2px solid var(--brand)" : "1px solid var(--surface-2)",
                      background: active ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "var(--background)",
                      cursor: pending ? "not-allowed" : "pointer",
                      textAlign: "left",
                      transition: "all 0.15s",
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
          </div>

          {/* Focus specialty */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              Priorizar uma especialidade (opcional)
            </label>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10 }}>
              Por padrão, o plano prioriza automaticamente suas especialidades mais fracas. Use isto se quiser focar em algo específico.
            </p>
            <select
              value={prefs.focus_specialty_id ?? ""}
              onChange={(e) => {
                const val = e.target.value === "" ? null : Number(e.target.value);
                savePrefs({ focus_specialty_id: val });
              }}
              disabled={pending}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--surface-2)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontSize: 14,
                outline: "none",
              }}
            >
              <option value="">Automático (recomendado)</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Email preferences */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "block" }}>
              Notificações por email
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.email_weekly_summary}
                  onChange={(e) => savePrefs({ email_weekly_summary: e.target.checked })}
                  disabled={pending}
                  className="accent-brand"
                  style={{ width: 16, height: 16 }}
                />
                <Mail size={14} style={{ color: "var(--muted-foreground)" }} />
                <span>Resumo semanal (segundas-feiras)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={prefs.email_daily_plan}
                  onChange={(e) => savePrefs({ email_daily_plan: e.target.checked })}
                  disabled={pending}
                  className="accent-brand"
                  style={{ width: 16, height: 16 }}
                />
                <Calendar size={14} style={{ color: "var(--muted-foreground)" }} />
                <span>Plano diário por email</span>
              </label>
            </div>
          </div>

          {/* Pause */}
          <div style={{ paddingTop: 16, borderTop: "1px solid var(--surface-2)" }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              {plan.paused ? "Plano pausado" : "Pausar plano"}
            </label>
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10 }}>
              {plan.paused
                ? `Pausado até ${plan.pausedUntil}. Nenhuma notificação será enviada.`
                : "Tirando férias? Pause o plano por 14 dias. Você não receberá lembretes durante esse tempo."}
            </p>
            <button
              onClick={handleTogglePause}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--surface-2)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontSize: 13,
                fontWeight: 500,
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              {plan.paused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
              {plan.paused ? "Retomar plano" : "Pausar por 14 dias"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PausedState({ pausedUntil, onResume, pending }: { pausedUntil: string | null; onResume: () => void; pending: boolean }) {
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
      <PauseCircle size={36} style={{ color: "var(--muted-foreground)", margin: "0 auto 16px", opacity: 0.5 }} />
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Plano pausado</h3>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>
        {pausedUntil ? `Retoma automaticamente em ${pausedUntil}.` : "Plano pausado indefinidamente."}
      </p>
      <button
        onClick={onResume}
        disabled={pending}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          borderRadius: "var(--radius)",
          background: "var(--brand)",
          color: "var(--brand-fg)",
          border: "none",
          fontSize: 14,
          fontWeight: 600,
          cursor: pending ? "not-allowed" : "pointer",
        }}
      >
        <PlayCircle size={16} />
        Retomar agora
      </button>
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
        Nada para hoje — você já cobriu o material das suas especialidades prioritárias.
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
