"use client";

import { setPaceMode } from "@/actions/study-plan";
import { useAutosave } from "@/lib/use-autosave";
import type { PaceMode, ResolvedPace } from "@/lib/study-plan/pace";

/**
 * "Ritmo de estudo" (Karina + Justin 2026-11-17). One control that is both the
 * on/off switch of the pace learning (Automático) and the manual adjustment
 * (Mais devagar / Padrão / Mais rápido). Fixed steps, each with what it means in
 * practice — a free slider is fiddly on a phone and "1.3×" means nothing.
 */

export type PaceOptions = {
  /** Questions per hour for each manual choice. */
  slow: number;
  standard: number;
  fast: number;
  /** Admin master switch: when off, "Automático" behaves like "Padrão". */
  adaptiveEnabled: boolean;
};

const ORDER: PaceMode[] = ["auto", "slow", "standard", "fast"];
const LABEL: Record<PaceMode, string> = {
  auto: "Automático",
  slow: "Mais devagar",
  standard: "Padrão",
  fast: "Mais rápido",
};

export function PaceEditor({
  mode,
  pace,
  options,
}: {
  mode: PaceMode;
  /** The pace in force right now (from the derived plan). */
  pace: ResolvedPace | null;
  options: PaceOptions;
}) {
  const saved = useAutosave<PaceMode>(mode, (m) => setPaceMode(m), 300);

  const perHour = (n: number) => `≈ ${n} questões por hora`;
  const autoSub = (): string => {
    if (!options.adaptiveEnabled) return `${perHour(options.standard)} · usando o ritmo padrão`;
    if (pace && pace.mode === "auto" && pace.source === "learned") {
      return `${perHour(pace.questionsPerHour)} · aprendido com as suas respostas`;
    }
    const left = pace ? Math.max(0, pace.samplesNeeded - pace.questionSamples) : null;
    return left && left > 0
      ? `Aprende com o seu ritmo · usa o padrão até mais ${left} ${left === 1 ? "resposta" : "respostas"}`
      : "Aprende com o seu ritmo ao responder questões e flashcards";
  };
  const sub: Record<PaceMode, string> = {
    auto: autoSub(),
    slow: perHour(options.slow),
    standard: perHour(options.standard),
    fast: perHour(options.fast),
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <span id="plano-ritmo" style={{ fontSize: 13, fontWeight: 600 }}>Ritmo de estudo</span>
        <span role="status" aria-live="polite" style={{ fontSize: 11, color: "var(--muted-foreground)", minHeight: 14 }}>
          {saved.status === "saving" ? "Salvando…" : saved.status === "saved" ? "Salvo" : saved.status === "error" ? "Não foi possível salvar" : ""}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
        Quanto tempo o plano reserva para cada questão, flashcard e Revalida Up. Um ritmo mais rápido coloca
        mais conteúdo no mesmo tempo de estudo.
      </p>
      <div role="radiogroup" aria-labelledby="plano-ritmo" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ORDER.map((m) => {
          const active = saved.value === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => saved.setValue(m)}
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
                {LABEL[m]}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, lineHeight: 1.4 }}>
                {sub[m]}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
