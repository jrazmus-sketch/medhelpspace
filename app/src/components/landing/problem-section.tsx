"use client";

import { useRevealChildren } from "@/hooks/use-reveal";

const PROBLEMS = [
  "Aula interminável que não muda resultado",
  "PDF que parece livro didático",
  "Live que não muda nada no dia da prova",
  "Conteúdo infinito sem direção",
  "Motivação que não dura",
];

const SOLUTIONS = [
  "Treino do jeito que a prova cobra",
  "Revisão objetiva e constante",
  "Raciocínio + conduta automáticos na cabeça",
  "Método claro para a sua rotina real",
  "Estrutura que funciona mesmo sem tempo livre",
];

export function ProblemSection() {
  const ref = useRevealChildren(0.08);

  return (
    <section
      className="bg-[var(--lp-problem-bg)] px-5 py-20 md:px-8 md:py-28"
      ref={ref}
    >
      <div className="mx-auto max-w-5xl">
        {/* Section headline */}
        <div className="lp-reveal mb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
            O problema
          </p>
          <h2
            className="mx-auto max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl md:text-[2.6rem]"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            O Revalida não derruba por falta de esforço.
            <br />
            <span className="text-foreground/50">
              Ele derruba quando o esforço vira volume.
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-foreground/55 sm:text-lg">
            Muito conteúdo, pouca decisão, pouca fixação.
            A virada é simples: você não precisa de mais horas. Você precisa de método.
          </p>
        </div>

        {/* Two-column comparison */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {/* Problems */}
          <div className="lp-reveal-left lp-d1 rounded-2xl border border-destructive/20 bg-destructive/5 p-6 md:p-8">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive/15 text-sm font-bold text-destructive">✕</span>
              <h3 className="text-sm font-bold uppercase tracking-widest text-destructive/80">
                O ciclo que não funciona
              </h3>
            </div>
            <ul className="space-y-3">
              {PROBLEMS.map((p, i) => (
                <li
                  key={p}
                  className="lp-reveal flex items-start gap-3 text-sm text-foreground/55 sm:text-base"
                  style={{ transitionDelay: `${(i + 1) * 70}ms` }}
                >
                  <span className="mt-0.5 shrink-0 text-destructive/40">—</span>
                  <span className="line-through decoration-destructive/40">
                    {p}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="lp-reveal-right lp-d2 rounded-2xl border border-brand/20 bg-brand/5 p-6 md:p-8">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/15 text-sm font-bold text-brand">✓</span>
              <h3 className="text-sm font-bold uppercase tracking-widest text-brand/80">
                Com o MedHelpSpace
              </h3>
            </div>
            <ul className="space-y-3">
              {SOLUTIONS.map((s, i) => (
                <li
                  key={s}
                  className="lp-reveal flex items-start gap-3 text-sm text-foreground/75 sm:text-base"
                  style={{ transitionDelay: `${(i + 1) * 70 + 200}ms` }}
                >
                  <span className="mt-0.5 shrink-0 font-bold text-brand">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Callout */}
        <div className="lp-reveal lp-d3 mt-10 rounded-xl border border-brand/15 bg-brand/8 px-6 py-5 text-center text-sm font-medium text-foreground/70 sm:text-base">
          <strong className="text-foreground">
            Aqui você não vai colecionar PDF.
          </strong>{" "}
          Você vai treinar com material direto ao ponto — do jeito que a prova cobra
          e do jeito que a sua rotina aguenta.
        </div>
      </div>
    </section>
  );
}
