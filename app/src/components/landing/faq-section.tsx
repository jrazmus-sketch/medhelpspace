"use client";

import { useState } from "react";

const FAQS = [
  {
    q: "Para quem o MedHelpSpace foi feito?",
    a: "Para quem quer passar com método: rotina corrida ou não, treino do jeito que cai, menos pegadinha e mais segurança — sem conteúdo infinito.",
  },
  {
    q: "O que diferencia o MedHelpSpace dos outros cursos?",
    a: "Aqui você não compra aula — você entra num sistema de aprovação. O foco é marcar ponto: treino por padrões, revisão objetiva e repetição que fixa. E você ainda recebe algo que quase ninguém entrega: MemoreCards exclusivos no MedHelp 60D + simulados completos para treinar o dia da prova.",
  },
  {
    q: "O que eu recebo ao me inscrever?",
    a: "Acesso imediato ao sistema completo: Estudos por Questões, Resumos Narrativos, MedVoice, Audiocards e Fórmula MedHelp. O MedHelp 60D já está incluído na compra — liberado automaticamente 60 dias antes da prova.",
  },
  {
    q: "O acesso é imediato?",
    a: "Sim. Pagamento confirmado, você entra e já começa.",
  },
  {
    q: "Serve para qual edição do Revalida?",
    a: "Você escolhe a turma e estuda com o sistema organizado para a sua janela de prova. Disponíveis: Revalida 2026.2 e 2027.1.",
  },
  {
    q: "Preciso ter muito tempo livre?",
    a: "Não. Foi feito para rotina real: blocos curtos, constância e treino objetivo. Você faz no seu ritmo, mesmo com faculdade, plantões e trabalho.",
  },
  {
    q: "O MedHelp 60D é liberado quando?",
    a: "60 dias antes da prova — revisão final guiada com MemoreCards exclusivos, Revalida Up e simulados completos (100 questões).",
  },
  {
    q: "Posso acessar pelo celular?",
    a: "Sim. Celular, tablet ou computador. Com tema claro ou escuro, do jeito que você preferir estudar.",
  },
  {
    q: "Quais são as formas de pagamento?",
    a: "Pix e cartão de crédito (parcelamento em até 12x diretamente no checkout). Processamento 100% seguro via PagBank.",
  },
  {
    q: "Tem garantia?",
    a: "Sim. Garantia incondicional de 7 dias. Você pode solicitar reembolso total dentro desse prazo, sem precisar justificar.",
  },
  {
    q: "Tem atualizações?",
    a: "Sim. O MedHelpSpace é atualizado continuamente — sempre que a prova muda o jeito de cobrar, a gente ajusta o treino.",
  },
  {
    q: "Como funciona o suporte?",
    a: "Você tem canal de suporte para acesso, pagamento e uso da plataforma.",
  },
] as const;

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      className="px-5 py-20 md:px-8 md:py-28"
      style={{ background: "#030303" }}
    >
      <div
        className="mx-auto max-w-3xl"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Header */}
        <div className="pt-16 text-center md:pt-24">
          <div
            className="mb-8 text-[10px] uppercase tracking-[0.25em] text-white/25"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            Dúvidas frequentes
          </div>
          <h2
            className="text-[clamp(2rem,4vw,3.2rem)] font-black leading-tight tracking-[-0.025em] text-white"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            Perguntas Frequentes
          </h2>
        </div>

        {/* Items */}
        <div className="mt-12 flex flex-col">
          {FAQS.map((faq, i) => (
            <div
              key={faq.q}
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
                aria-expanded={open === i}
              >
                <span
                  className="text-sm font-semibold text-white/75 transition-colors hover:text-white sm:text-base"
                >
                  {faq.q}
                </span>
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs transition-all duration-200"
                  style={{
                    borderColor: open === i ? "rgba(139,123,255,0.5)" : "rgba(255,255,255,0.12)",
                    color: open === i ? "var(--brand)" : "rgba(255,255,255,0.3)",
                    transform: open === i ? "rotate(45deg)" : "none",
                  }}
                >
                  +
                </span>
              </button>
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{ maxHeight: open === i ? "300px" : "0px" }}
              >
                <p className="pb-5 text-sm leading-relaxed text-white/40 sm:text-[0.95rem]">
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
          {/* Last border */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} />
        </div>
      </div>
    </section>
  );
}
