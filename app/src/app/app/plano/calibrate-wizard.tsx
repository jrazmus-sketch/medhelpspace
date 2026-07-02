"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronRight, ChevronLeft, Calendar, Target, Clock, Check, Layers } from "lucide-react";
import { completeCalibration, dismissCalibrationBanner } from "@/actions/study-plan";
import type { ContentType } from "@/lib/study-plan/derive";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// The four student-facing resources the plan can schedule (memorecards is a 60D
// auto-feature, not a picker toggle; narrative summaries stay out of the schedule).
const PICKER_RESOURCES: { type: ContentType; label: string; desc: string }[] = [
  { type: "quiz", label: "Questões Revalida", desc: "Provas reais 2020–2025" },
  { type: "simulado", label: "Simulados", desc: "Simulados originais MedHelp" },
  { type: "flashcards", label: "Flashcards", desc: "Memorização com repetição espaçada" },
  { type: "audio", label: "MedVoice", desc: "Áudio-aulas por tema" },
];

type Specialty = { id: number; name: string };

export function CalibrateWizard({
  examDate,
  examDateLabel,
  specialties,
  initialAvailableDays,
  initialWeeklyHours,
  initialFocusIds,
  initialResourceTypes,
  onClose,
}: {
  examDate: string | null;
  examDateLabel: string | null;
  specialties: Specialty[];
  initialAvailableDays: number;
  initialWeeklyHours: number | null;
  initialFocusIds: number[];
  initialResourceTypes: ContentType[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [pending, startTransition] = useTransition();

  // Step 1: exam date — just confirm (cohort-managed). No editable field for V2.
  // Step 2: weak specialties (multi-select, optional, max 5)
  const [focusIds, setFocusIds] = useState<number[]>(initialFocusIds);
  // Step 3: weekly hours + days
  const [weeklyHours, setWeeklyHours] = useState<number>(initialWeeklyHours ?? 15);
  const [availableDays, setAvailableDays] = useState<number>(initialAvailableDays);
  // Step 4: resources to schedule (default: all four picker resources)
  const [resources, setResources] = useState<Set<ContentType>>(() => {
    const enabled = PICKER_RESOURCES.map((r) => r.type).filter((t) =>
      initialResourceTypes.includes(t),
    );
    return new Set(enabled.length > 0 ? enabled : PICKER_RESOURCES.map((r) => r.type));
  });

  function toggleResource(t: ContentType) {
    setResources((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleFocus(id: number) {
    setFocusIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  function toggleDay(dayBit: number) {
    setAvailableDays((prev) => prev ^ dayBit);
  }

  function finish() {
    startTransition(async () => {
      await completeCalibration({
        weeklyHours,
        availableDays,
        focusSpecialtyIds: focusIds,
        resourceTypes: [...resources],
      });
      router.refresh();
      onClose();
    });
  }

  function skip() {
    startTransition(async () => {
      await dismissCalibrationBanner();
      router.refresh();
      onClose();
    });
  }

  const daysSelected = countBits(availableDays);
  const avgPerDay = daysSelected > 0 ? Math.round((weeklyHours * 60) / daysSelected) : 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => e.target === e.currentTarget && skip()}
    >
      <div
        style={{
          background: "var(--background)",
          borderRadius: "var(--radius)",
          width: "100%", maxWidth: 520,
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header with progress dots */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid var(--surface-2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                style={{
                  width: s === step ? 24 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: s === step
                    ? "var(--brand)"
                    : s < step ? "color-mix(in srgb, var(--brand) 40%, transparent)" : "var(--surface-2)",
                  transition: "all 0.25s",
                }}
              />
            ))}
            <span style={{ fontSize: 11, color: "var(--muted-foreground)", marginLeft: 10 }}>
              Passo {step} de 4
            </span>
          </div>
          <button
            onClick={skip}
            disabled={pending}
            aria-label="Pular calibração"
            style={{
              background: "transparent", border: "none",
              padding: 6, borderRadius: 4, cursor: "pointer",
              color: "var(--muted-foreground)",
            }}
            className="hover:bg-surface-1 hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step content */}
        <div style={{ padding: "32px 24px" }}>
          {step === 1 && (
            <>
              <Calendar size={32} style={{ color: "var(--brand)", marginBottom: 16 }} />
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.025em", marginBottom: 8 }}>
                Sua prova é em…
              </h2>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 24, lineHeight: 1.5 }}>
                Esta data vem do seu cohort e é o que orienta todas as fases do plano (fundação, intensificação e reta final).
              </p>
              <div style={{
                padding: "20px 24px",
                background: "var(--surface-1)",
                border: "1px solid var(--surface-2)",
                borderRadius: "var(--radius)",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 8 }}>
                  Data da prova
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>
                  {examDateLabel ?? "Não definida"}
                </div>
                {examDate && (
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6 }}>
                    {daysToDate(examDate)} dias a partir de hoje
                  </div>
                )}
              </div>
              {!examDate && (
                <p style={{ fontSize: 12, color: "#f59e0b", marginTop: 12, lineHeight: 1.4 }}>
                  Você ainda não está em um cohort. Solicite a um administrador.
                </p>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Target size={32} style={{ color: "var(--brand)", marginBottom: 16 }} />
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.025em", marginBottom: 8 }}>
                Quais especialidades você se sente menos confiante?
              </h2>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 8, lineHeight: 1.5 }}>
                Selecione até 5. Vamos priorizar essas no seu plano diário. Pode pular se ainda não souber — o sistema descobre conforme você responde questões.
              </p>
              <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 20, opacity: 0.7 }}>
                {focusIds.length}/5 selecionadas
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {specialties.map((s) => {
                  const selected = focusIds.includes(s.id);
                  const disabled = !selected && focusIds.length >= 5;
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleFocus(s.id)}
                      disabled={disabled}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        border: selected ? "1px solid var(--brand)" : "1px solid var(--surface-2)",
                        background: selected
                          ? "color-mix(in srgb, var(--brand) 15%, transparent)"
                          : "transparent",
                        color: selected ? "var(--brand)" : "var(--foreground)",
                        fontSize: 13,
                        fontWeight: selected ? 600 : 500,
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.4 : 1,
                        transition: "all 0.15s",
                      }}
                    >
                      {selected && <Check size={12} style={{ display: "inline", marginRight: 4 }} />}
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Clock size={32} style={{ color: "var(--brand)", marginBottom: 16 }} />
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.025em", marginBottom: 8 }}>
                Quanto tempo por semana você consegue estudar?
              </h2>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 24, lineHeight: 1.5 }}>
                Seja realista — o plano vai distribuir esse tempo nos dias que você marcar como disponíveis.
              </p>

              <div style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Horas por semana</label>
                  <span style={{ fontSize: 22, fontWeight: 700, color: "var(--brand)", fontFamily: "var(--font-geist-mono)" }}>
                    {weeklyHours}h
                  </span>
                </div>
                <input
                  type="range"
                  min={3} max={40} step={1}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--brand)" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted-foreground)", marginTop: 4 }}>
                  <span>3h</span><span>20h</span><span>40h</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "block" }}>
                  Em quais dias?
                </label>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {DAY_LABELS.map((label, i) => {
                    const bit = 1 << i;
                    const active = (availableDays & bit) !== 0;
                    return (
                      <button
                        key={i}
                        onClick={() => toggleDay(bit)}
                        style={{
                          flex: 1,
                          padding: "10px 0",
                          borderRadius: "var(--radius-sm)",
                          border: active ? "1px solid var(--brand)" : "1px solid var(--surface-2)",
                          background: active ? "color-mix(in srgb, var(--brand) 15%, transparent)" : "transparent",
                          color: active ? "var(--brand)" : "var(--muted-foreground)",
                          fontSize: 12,
                          fontWeight: active ? 700 : 500,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {daysSelected > 0 ? (
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    Aproximadamente <strong style={{ color: "var(--foreground)" }}>{avgPerDay} min/dia</strong> em {daysSelected} dia{daysSelected !== 1 ? "s" : ""} por semana.
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: "#f59e0b" }}>
                    Selecione pelo menos 1 dia disponível.
                  </p>
                )}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <Layers size={32} style={{ color: "var(--brand)", marginBottom: 16 }} />
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.025em", marginBottom: 8 }}>
                Quais recursos você quer no seu plano?
              </h2>
              <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 20, lineHeight: 1.5 }}>
                Escolha o que entra no cronograma diário — dá para mudar depois. Audiocards e resumos ficam sempre disponíveis à parte, fora do cronograma.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {PICKER_RESOURCES.map((r) => {
                  const on = resources.has(r.type);
                  return (
                    <button
                      key={r.type}
                      onClick={() => toggleResource(r.type)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "14px 16px", textAlign: "left", width: "100%",
                        borderRadius: "var(--radius-sm)",
                        border: on ? "1px solid var(--brand)" : "1px solid var(--surface-2)",
                        background: on ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "transparent",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      <div style={{
                        width: 22, height: 22, flexShrink: 0, borderRadius: 6,
                        border: on ? "none" : "1.5px solid var(--surface-2)",
                        background: on ? "var(--brand)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {on && <Check size={14} style={{ color: "var(--brand-fg)" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: on ? "var(--brand)" : "var(--foreground)" }}>
                          {r.label}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
                          {r.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {resources.size === 0 && (
                <p style={{ fontSize: 12, color: "#f59e0b", marginTop: 12 }}>
                  Selecione pelo menos 1 recurso.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "16px 24px",
          borderTop: "1px solid var(--surface-2)",
          position: "sticky", bottom: 0, background: "var(--background)",
        }}>
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              disabled={pending}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "8px 14px", borderRadius: "var(--radius-sm)",
                border: "1px solid var(--surface-2)", background: "transparent",
                fontSize: 13, fontWeight: 500, color: "var(--foreground)",
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              <ChevronLeft size={14} /> Voltar
            </button>
          ) : (
            <button
              onClick={skip}
              disabled={pending}
              style={{
                background: "transparent", border: "none",
                fontSize: 13, color: "var(--muted-foreground)",
                cursor: pending ? "not-allowed" : "pointer",
                padding: "8px 4px",
              }}
            >
              Pular por enquanto
            </button>
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
              disabled={pending || (step === 1 && !examDate) || (step === 3 && daysSelected === 0)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "10px 18px", borderRadius: "var(--radius-sm)",
                background: "var(--brand)", color: "var(--brand-fg)",
                border: "none", fontSize: 13, fontWeight: 600,
                cursor: pending ? "not-allowed" : "pointer",
                opacity: step === 3 && daysSelected === 0 ? 0.5 : 1,
              }}
            >
              {step === 2 && focusIds.length === 0 ? "Pular esta etapa" : "Continuar"}
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={pending || resources.size === 0}
              style={{
                padding: "10px 22px", borderRadius: "var(--radius-sm)",
                background: "var(--brand)", color: "var(--brand-fg)",
                border: "none", fontSize: 13, fontWeight: 600,
                cursor: pending || resources.size === 0 ? "not-allowed" : "pointer",
                opacity: resources.size === 0 ? 0.5 : 1,
              }}
            >
              {pending ? "Salvando…" : "Concluir calibração"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countBits(mask: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) n++;
  return n;
}

function daysToDate(dateKey: string): number {
  const target = new Date(dateKey + "T00:00:00").getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((target - today.getTime()) / 86_400_000));
}
