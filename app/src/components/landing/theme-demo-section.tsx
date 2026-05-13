"use client";

import { useState } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { Sun, Moon, BookOpen, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type MockTheme = "dark" | "light";

function QuizMockup({ theme }: { theme: MockTheme }) {
  const d = theme === "dark";
  return (
    <div
      className="w-full overflow-hidden rounded-xl border text-xs shadow-2xl transition-all duration-500"
      style={{
        backgroundColor: d ? "#0a0a0a" : "#ffffff",
        borderColor: d ? "rgba(255,255,255,0.09)" : "#e2d9ef",
        color: d ? "#ededed" : "#09090d",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 text-[10px]"
        style={{ backgroundColor: d ? "#141414" : "#faf8fd", borderBottom: `1px solid ${d ? "rgba(255,255,255,0.06)" : "#e2d9ef"}` }}
      >
        <span className="font-semibold" style={{ color: d ? "#8b7bff" : "#7a1d91" }}>MedHelpSpace</span>
        <span style={{ color: d ? "#a8a8a8" : "#6b5f7a" }}>Cardiologia · Questão 3 de 12</span>
      </div>

      {/* Question */}
      <div className="p-4">
        <div
          className="mb-3 rounded-lg p-3 text-[11px] leading-relaxed"
          style={{ backgroundColor: d ? "#141414" : "#f5f0fb", color: d ? "#a8a8a8" : "#3d0f4a" }}
        >
          Paciente masculino, 62 anos, hipertenso e dislipidêmico, apresenta dor precordial opressiva
          irradiada para o braço esquerdo há 40 minutos. ECG com supra de ST em V1–V4.
          A conduta imediata mais adequada é:
        </div>
        <div className="flex flex-col gap-1.5">
          {["Trombolítico IV imediato", "AAS + Clopidogrel + Heparina + ACTP primária", "Betabloqueador IV em bolus", "Nitrato sublingual isolado"].map((opt, i) => (
            <div
              key={opt}
              className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors"
              style={{
                backgroundColor: i === 1
                  ? (d ? "rgba(139,123,255,0.18)" : "rgba(122,29,145,0.08)")
                  : (d ? "#141414" : "#faf8fd"),
                border: `1px solid ${i === 1 ? (d ? "#8b7bff" : "#7a1d91") : (d ? "rgba(255,255,255,0.06)" : "#e2d9ef")}`,
                color: i === 1 ? (d ? "#8b7bff" : "#7a1d91") : (d ? "#ededed" : "#09090d"),
              }}
            >
              <span className="font-mono font-bold text-[10px] opacity-60">{String.fromCharCode(65 + i)}</span>
              <span className="leading-tight">{opt}</span>
              {i === 1 && <CheckCircle2 className="ml-auto h-3 w-3" />}
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full" style={{ backgroundColor: d ? "#1d1d1d" : "#f5f0fb" }}>
        <div className="h-1 w-1/4 rounded-full" style={{ backgroundColor: d ? "#8b7bff" : "#7a1d91" }} />
      </div>
    </div>
  );
}

function LessonMockup({ theme }: { theme: MockTheme }) {
  const d = theme === "dark";
  return (
    <div
      className="w-full overflow-hidden rounded-xl border text-xs shadow-2xl transition-all duration-500"
      style={{
        backgroundColor: d ? "#0a0a0a" : "#ffffff",
        borderColor: d ? "rgba(255,255,255,0.09)" : "#e2d9ef",
        color: d ? "#ededed" : "#09090d",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 text-[10px]"
        style={{ backgroundColor: d ? "#141414" : "#faf8fd", borderBottom: `1px solid ${d ? "rgba(255,255,255,0.06)" : "#e2d9ef"}` }}
      >
        <BookOpen className="h-3 w-3" style={{ color: d ? "#8b7bff" : "#7a1d91" }} />
        <span className="font-semibold" style={{ color: d ? "#ededed" : "#09090d" }}>Resumos Narrativos</span>
        <span className="ml-auto" style={{ color: d ? "#a8a8a8" : "#6b5f7a" }}>Cardiologia</span>
      </div>
      <div className="p-4 space-y-2.5">
        <h4 className="text-[13px] font-bold" style={{ color: d ? "#8b7bff" : "#7a1d91" }}>
          Síndrome Coronariana Aguda — O Raciocínio que Cai
        </h4>
        <p className="leading-relaxed" style={{ color: d ? "#a8a8a8" : "#3d0f4a" }}>
          O paciente chega com dor precordial. Sua primeira pergunta: <strong style={{ color: d ? "#ededed" : "#09090d" }}>isquemia ou não?</strong>
        </p>
        <div
          className="rounded-lg p-3 text-[11px] leading-relaxed"
          style={{ backgroundColor: d ? "#141414" : "#f5f0fb", borderLeft: `3px solid ${d ? "#8b7bff" : "#7a1d91"}` }}
        >
          <strong>Padrão do Revalida:</strong> SCA com supra = ACTP primária se disponível em &lt;120min.
          Sem supra + troponina = anticoagulação + estratificação.
        </div>
        <p className="text-[10px]" style={{ color: d ? "#727272" : "#6b5f7a" }}>
          Próxima seção: Estratificação de Risco →
        </p>
      </div>
    </div>
  );
}

export function ThemeDemoSection() {
  const [mockTheme, setMockTheme] = useState<MockTheme>("dark");
  const ref = useReveal(0.1);

  return (
    <section className="bg-[var(--lp-dark-bg)] px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div ref={ref} className="lp-reveal">

          {/* Header */}
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
              Modo de estudo
            </p>
            <h2
              className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              Estude no modo que você preferir.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base text-white/50">
              Claridade total de dia. Conforto total de noite. O tema segue você — mude a qualquer momento dentro da plataforma.
            </p>

            {/* Toggle */}
            <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              <button
                onClick={() => setMockTheme("dark")}
                className={cn(
                  "flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all",
                  mockTheme === "dark"
                    ? "bg-white/10 text-white shadow"
                    : "text-white/40 hover:text-white/60",
                )}
              >
                <Moon className="h-4 w-4" />
                Escuro
              </button>
              <button
                onClick={() => setMockTheme("light")}
                className={cn(
                  "flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all",
                  mockTheme === "light"
                    ? "bg-white/10 text-white shadow"
                    : "text-white/40 hover:text-white/60",
                )}
              >
                <Sun className="h-4 w-4" />
                Claro
              </button>
            </div>
          </div>

          {/* Mockup pair */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-white/30">
                Simulados por tema
              </p>
              <QuizMockup theme={mockTheme} />
            </div>
            <div>
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-white/30">
                Resumos narrativos
              </p>
              <LessonMockup theme={mockTheme} />
            </div>
          </div>

          {/* Footnote */}
          <p className="mt-8 text-center text-xs text-white/30">
            Preferência salva automaticamente no seu perfil · disponível em celular, tablet e computador
          </p>
        </div>
      </div>
    </section>
  );
}
