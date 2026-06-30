"use client";

import { useReveal } from "@/hooks/use-reveal";

const ROWS = [
  {
    category: "Feito para",
    mhs: "Feito só para o Revalida — pensado para quem se formou fora",
    tradicional: "Curso de residência adaptado às pressas para o Revalida",
    mhsWins: true,
  },
  {
    category: "Fixação",
    mhs: "Repetição espaçada inclusa: o que você erra volta no momento certo",
    tradicional: "Você relê o conteúdo e torce para lembrar na prova",
    mhsWins: true,
  },
  {
    category: "Direção",
    mhs: "Um plano diário que se monta sozinho a partir do seu desempenho",
    tradicional: "Você decide sozinho por onde começar, no meio do volume",
    mhsWins: true,
  },
  {
    category: "Formatos",
    mhs: "Questões · Resumos · Áudios · Flashcards — feitos para o celular",
    tradicional: "Videoaulas longas, difíceis de consumir no plantão",
    mhsWins: true,
  },
  {
    category: "Reta final",
    mhs: "MedHelp 60D já incluso — libera sozinho 60 dias antes da prova",
    tradicional: "Módulo de reta final cobrado à parte",
    mhsWins: true,
  },
  {
    category: "Cobrança",
    mhs: "Uma compra, sem mensalidade e sem renovação automática",
    tradicional: "Assinatura que renova sozinha — e multa para cancelar",
    mhsWins: true,
  },
  {
    category: "Garantia",
    mhs: "7 dias para testar e pedir reembolso, sem precisar justificar",
    tradicional: "Reembolso travado nas letras miúdas do contrato",
    mhsWins: true,
  },
];

function CheckIcon() {
  return (
    <svg className="h-5 w-5 flex-shrink-0 text-[var(--c-success)]" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg className="h-5 w-5 flex-shrink-0 text-foreground/25" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

export function ComparisonSection() {
  const headerRef = useReveal();
  const tableRef = useReveal(0.05);

  return (
    <section className="bg-[var(--lp-alt-bg)] px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div ref={headerRef} className="lp-reveal mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
            Por que MedHelpSpace?
          </p>
          <h2
            className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-[2.5rem]"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            MedHelpSpace vs.{" "}
            <span className="text-foreground/40">Cursos Tradicionais</span>
          </h2>
        </div>

        {/* Table */}
        <div ref={tableRef} className="lp-reveal overflow-hidden rounded-2xl border border-border">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_auto] border-b border-border bg-[var(--surface-1)] px-4 py-3 md:grid-cols-[1.2fr_2fr_2fr] md:px-6">
            <div className="text-xs font-bold uppercase tracking-widest text-foreground/40">
              Critério
            </div>
            <div className="hidden text-center text-xs font-bold uppercase tracking-widest text-brand md:block">
              MedHelpSpace
            </div>
            <div className="hidden text-center text-xs font-bold uppercase tracking-widest text-foreground/30 md:block">
              Cursos Tradicionais
            </div>
            <div className="text-center text-xs font-bold uppercase tracking-widest text-brand md:hidden">
              MHS
            </div>
            <div className="text-center text-xs font-bold uppercase tracking-widest text-foreground/30 md:hidden">
              Outros
            </div>
          </div>

          {/* Rows */}
          {ROWS.map((row, i) => (
            <div
              key={row.category}
              className={`lp-comparison-row grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border px-4 py-4 transition-colors last:border-0 md:grid-cols-[1.2fr_2fr_2fr] md:gap-6 md:px-6 md:py-5 ${i % 2 === 0 ? "" : "bg-[var(--surface-1)]/40"}`}
            >
              {/* Category */}
              <div className="flex items-start pt-0.5">
                <span className="text-sm font-semibold text-foreground/70">{row.category}</span>
              </div>

              {/* MHS column */}
              <div className="flex items-start gap-2">
                <CheckIcon />
                <p className="hidden text-sm leading-relaxed text-foreground/70 md:block">
                  {row.mhs}
                </p>
              </div>

              {/* Traditional column */}
              <div className="flex items-start gap-2">
                <CrossIcon />
                <p className="hidden text-sm leading-relaxed text-foreground/40 md:block">
                  {row.tradicional}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile detail rows (below the table) */}
        <div className="mt-6 space-y-3 md:hidden">
          {ROWS.map((row) => (
            <div key={row.category} className="rounded-xl border border-border p-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground/40">
                {row.category}
              </div>
              <div className="mb-1.5 flex items-start gap-2">
                <CheckIcon />
                <p className="text-sm text-foreground/70">{row.mhs}</p>
              </div>
              <div className="flex items-start gap-2">
                <CrossIcon />
                <p className="text-sm text-foreground/40">{row.tradicional}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
