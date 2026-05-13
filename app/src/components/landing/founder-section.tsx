"use client";

import { useReveal } from "@/hooks/use-reveal";

export function FounderSection() {
  const ref = useReveal(0.15);

  return (
    <section className="bg-[var(--lp-alt-bg)] px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-3xl">
        <div ref={ref} className="lp-reveal relative">

          {/* Decorative quote mark */}
          <div
            className="pointer-events-none absolute -top-4 -left-4 select-none text-[120px] font-black leading-none text-brand/8 md:-top-6 md:-left-8 md:text-[180px]"
            aria-hidden
          >
            "
          </div>

          {/* Quote */}
          <blockquote className="relative">
            <p
              className="text-xl font-semibold leading-[1.55] tracking-tight text-foreground sm:text-2xl md:text-3xl"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              Criar o MedHelpSpace foi uma decisão de repensar o jeito de estudar para o Revalida. Não mais aulas que precisam de 3 horas para dizer o que a prova cobra em 30 segundos. A ideia foi simples:{" "}
              <span className="text-brand">
                tirar o excesso, deixar o que cai, e treinar do jeito que a banca pensa.
              </span>
            </p>

            {/* Attribution */}
            <footer className="mt-8">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{ background: "var(--brand)" }}
                >
                  M
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">Equipe MedHelpSpace</div>
                  <div className="text-xs text-foreground/45">
                    Médicos e especialistas em aprovação no Revalida
                  </div>
                </div>
              </div>
            </footer>
          </blockquote>

          {/* Accent line */}
          <div
            className="mt-10 h-px"
            style={{
              background: "linear-gradient(to right, var(--brand), transparent)",
            }}
          />

          {/* Stat row */}
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[
              { value: "12", label: "especialidades cobertas" },
              { value: "220+", label: "aulas com raciocínio clínico" },
              { value: "3.506", label: "flashcards de fixação" },
            ].map((stat) => (
              <div key={stat.label}>
                <div
                  className="text-2xl font-extrabold text-foreground md:text-3xl"
                  style={{ fontFamily: "var(--font-bricolage)" }}
                >
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-foreground/45">{stat.label}</div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
