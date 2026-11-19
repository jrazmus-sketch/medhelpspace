"use client";

import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { setSimuladoFrequency } from "@/actions/study-plan";
import type { SimuladoOption, SimuladoPlanInfo } from "@/lib/study-plan/derive";
import type { SimuladoFrequency } from "@/lib/study-plan/simulado";

/**
 * "Mini simulados" — the frequency (Karina 2026-11-17).
 *
 * The plan reserves the time and the frequency; the student picks the simulado
 * in the library and stays free to take more. Automática (default) keeps the
 * 25% reference; "1 por semana" / "2 por semana" are the student's own choice,
 * where that limit does not apply.
 *
 * A choice is NOT saved on click: the student first sees what it takes of the
 * week and what it does to the forecast, then confirms. A frequency whose
 * sessions alone exceed the whole week's study time is never offered as viable —
 * splitting a session between days does not fix a load bigger than the time there is.
 *
 * Every time shown is an ESTIMATE (answers × the student's pace); sessions are not timed.
 */

const LABEL: Record<string, string> = { auto: "Automática", "1": "1 por semana", "2": "2 por semana" };
const label = (f: SimuladoFrequency) => LABEL[String(f)];

/** Minutes → "62 min" / "2 h" / "2 h 05 min" (an exact half rounds down) — same format as the plan's block. */
function dur(minutes: number): string {
  const m = Math.max(1, Math.round(minutes - 1e-6));
  if (m < 90) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m - h * 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")} min`;
}

function cadenceText(o: SimuladoOption): string {
  if (o.sessionsPerWeek <= 0) return "nenhum mini simulado programado";
  if (o.everyWeeks > 1) return `${o.sessionsPerWeek === 1 ? "1 mini simulado" : `${o.sessionsPerWeek} mini simulados`} a cada ${o.everyWeeks} semanas`;
  return o.sessionsPerWeek === 1 ? "1 mini simulado por semana" : `${o.sessionsPerWeek} mini simulados por semana`;
}

export function SimuladoFrequencyEditor({ info }: { info: SimuladoPlanInfo }) {
  const [pending, setPending] = useState<SimuladoFrequency | null>(null);
  const [status, setStatus] = useState<"idle" | "saved" | "infeasible" | "failed">("idle");
  const [saving, startTransition] = useTransition();

  const option = (f: SimuladoFrequency) => info.options.find((o) => o.frequency === f)!;
  const current = option(info.inForce);
  const selected = pending ?? info.chosen;
  const preview = pending != null && pending !== info.chosen ? option(pending) : null;
  const week = dur(info.weeklyStudyMinutes);

  function confirm() {
    if (!preview) return;
    startTransition(async () => {
      const res = await setSimuladoFrequency(preview.frequency);
      if (res.ok) {
        setPending(null);
        setStatus("saved");
      } else {
        setStatus(res.error === "infeasible" ? "infeasible" : "failed");
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <span id="plano-simulados" style={{ fontSize: 13, fontWeight: 600 }}>Mini simulados</span>
        <span role="status" aria-live="polite" style={{ fontSize: 11, color: "var(--muted-foreground)", minHeight: 14 }}>
          {saving ? "Salvando…" : status === "saved" ? "Salvo" : status === "failed" ? "Não foi possível salvar" : ""}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
        O plano reserva o tempo e você escolhe o simulado na biblioteca — e pode fazer outros ou repetir os
        anteriores quando quiser. Cada mini simulado tem {info.questions} questões: cerca de {dur(info.sessionMinutes)} no
        seu ritmo. Os tempos são estimativas, calculadas pelas suas respostas e pelo seu ritmo; as sessões não são
        cronometradas.
      </p>

      {!info.enabled ? (
        <p style={{ fontSize: 13, lineHeight: 1.5, padding: "12px 14px", background: "var(--surface-1)", border: "1px solid var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
          Os mini simulados estão desmarcados em Conteúdo, por isso o plano não reserva tempo para eles. Marque
          “Mini simulados” em Conteúdo para escolher a frequência.
        </p>
      ) : (
        <>
          {/* The saved choice no longer fits the availability: say so, and what is in force. */}
          {info.chosen !== info.inForce && !preview && (
            <Notice>
              A frequência escolhida ({label(info.chosen)}, cerca de {dur(option(info.chosen).weeklyMinutes)} por semana)
              não cabe no seu tempo de estudo da semana ({week}). O plano está usando a frequência automática. Aumente a
              disponibilidade acima ou escolha outra frequência.
            </Notice>
          )}

          <div role="radiogroup" aria-labelledby="plano-simulados" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {info.options.map((o) => {
              const active = selected === o.frequency;
              return (
                <button
                  key={String(o.frequency)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { setPending(o.frequency === info.chosen ? null : o.frequency); setStatus("idle"); }}
                  className="min-h-11"
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius)",
                    border: active ? "2px solid var(--brand)" : "1px solid var(--surface-2)",
                    background: active ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "var(--background)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: active ? "var(--brand-text, var(--brand))" : "var(--foreground)" }}>
                    {label(o.frequency)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.4 }}>
                    {o.frequency === "auto"
                      ? `Calculada pela sua disponibilidade: ${cadenceText(o)}`
                      : o.feasible
                        ? `Cerca de ${dur(o.weeklyMinutes)} por semana`
                        : `Cerca de ${dur(o.weeklyMinutes)} por semana — não cabe no seu tempo`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* The impact, BEFORE the choice is saved. */}
          {preview && (
            <div
              role="region"
              aria-label="Impacto da frequência escolhida"
              style={{
                marginTop: 10, padding: "14px 16px",
                background: "var(--surface-1)", border: "1px solid var(--surface-2)", borderRadius: "var(--radius)",
              }}
            >
              {preview.feasible && status !== "infeasible" ? (
                <>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{label(preview.frequency)}</p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.55, listStyle: "disc" }}>
                    <li>
                      Os mini simulados passam a ocupar cerca de {dur(preview.weeklyMinutes)} por semana, de um total
                      de {week} de estudo ({cadenceText(preview)}). Atualmente: cerca de {dur(current.weeklyMinutes)} por
                      semana.
                    </li>
                    {preview.expectedTopics != null && current.expectedTopics != null && info.pendingTopics != null && (
                      <li>
                        {preview.expectedTopics === current.expectedTopics
                          ? `A previsão de cobertura não muda: ${current.expectedTopics} de ${info.pendingTopics} temas pendentes previstos até a abertura do MedHelp 60D.`
                          : `Previstos até a abertura do MedHelp 60D: de ${current.expectedTopics} para ${preview.expectedTopics} dos ${info.pendingTopics} temas pendentes.`}
                      </li>
                    )}
                    <li>As outras atividades são distribuídas no tempo que sobra; o que você já fez é preservado.</li>
                  </ul>
                  {preview.expectedTopics != null && current.expectedTopics != null && preview.expectedTopics < current.expectedTopics && (
                    <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>
                      Para manter a cobertura, aumente a disponibilidade acima ou fique na frequência automática.
                    </p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={confirm}
                      disabled={saving}
                      className="min-h-11"
                      style={{
                        padding: "0 18px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
                        background: "var(--brand)", color: "var(--brand-fg)", fontSize: 14, fontWeight: 600,
                        opacity: saving ? 0.6 : 1,
                      }}
                    >
                      {saving ? "Salvando…" : "Confirmar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPending(null); setStatus("idle"); }}
                      disabled={saving}
                      className="min-h-11"
                      style={{
                        padding: "0 18px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                        background: "transparent", border: "1px solid var(--surface-2)", color: "var(--foreground)",
                        fontSize: 14, fontWeight: 600,
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <AlertCircle size={18} style={{ color: "var(--destructive)", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                        {label(preview.frequency)} não cabe na sua disponibilidade
                      </p>
                      <p style={{ fontSize: 13, lineHeight: 1.55 }}>
                        São cerca de {dur(preview.weeklyMinutes)} de mini simulados por semana, e o seu tempo de estudo
                        da semana é de {week}. Dividir a sessão entre dias não resolve uma carga maior que o tempo
                        disponível. Aumente a disponibilidade acima ou escolha outra frequência.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPending(null); setStatus("idle"); }}
                    className="min-h-11"
                    style={{
                      marginTop: 12, padding: "0 18px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                      background: "transparent", border: "1px solid var(--surface-2)", color: "var(--foreground)",
                      fontSize: 14, fontWeight: 600,
                    }}
                  >
                    Voltar
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10, padding: "12px 14px",
        background: "color-mix(in srgb, var(--destructive) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--destructive) 30%, transparent)",
        borderRadius: "var(--radius-sm)", fontSize: 13, lineHeight: 1.55,
      }}
    >
      <AlertCircle size={16} style={{ color: "var(--destructive)", flexShrink: 0, marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}
