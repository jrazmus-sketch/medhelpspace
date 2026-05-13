"use client";

import { useState } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

const FAQS = [
  {
    q: "Para quem o MedHelpSpace foi feito?",
    a: "Para quem quer passar com método: rotina corrida ou não, treino do jeito que cai, menos pegadinha e mais segurança — sem conteúdo infinito.",
  },
  {
    q: "O que diferencia o MedHelpSpace Revalida dos outros cursos?",
    a: "Aqui você não compra aula — você entra num sistema de aprovação. O foco é marcar ponto: treino por padrões, revisão objetiva e repetição que fixa. E você ainda recebe algo que quase ninguém entrega: MemoreCards exclusivos no MedHelp 60D + simulados completos para treinar o dia da prova.",
  },
  {
    q: "O que eu recebo ao me inscrever?",
    a: "Acesso imediato ao sistema completo: Estudos por Questões, Resumos Narrativos, MedVoice, Audiocards e Fórmula MedHelp. O MedHelp 60D já está incluído na compra — ele só é liberado 60 dias antes da prova, como revisão final guiada.",
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
    a: "Não. Foi feito para rotina real: blocos curtos, constância e treino objetivo. Você faz no seu ritmo, com flexibilidade real, mesmo com faculdade, plantões e trabalho.",
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
    a: "Sim. O MedHelpSpace é atualizado continuamente — sempre que a prova muda o jeito de cobrar, a gente ajusta o treino. Você segue focado em padrões recorrentes + variações prováveis, sem virar conteúdo infinito.",
  },
  {
    q: "Como funciona o suporte?",
    a: "Você tem canal de suporte para acesso, pagamento e uso da plataforma.",
  },
] as const;

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useReveal(0.08);

  return (
    <section className="bg-[var(--lp-alt-bg)] px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-3xl">
        <div ref={ref} className="lp-reveal mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
            Dúvidas frequentes
          </p>
          <h2
            className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            Perguntas Frequentes
          </h2>
        </div>

        <div className="flex flex-col gap-2">
          {FAQS.map((faq, i) => (
            <div
              key={faq.q}
              className={cn(
                "overflow-hidden rounded-xl border transition-all duration-200",
                open === i
                  ? "border-brand/30 bg-brand/5"
                  : "border-border bg-background hover:border-brand/15",
              )}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-foreground sm:text-base"
                aria-expanded={open === i}
              >
                <span>{faq.q}</span>
                <Plus
                  className={cn(
                    "h-4 w-4 shrink-0 text-brand transition-transform duration-200",
                    open === i ? "rotate-45" : "",
                  )}
                />
              </button>
              <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{ maxHeight: open === i ? "400px" : "0px" }}
              >
                <p className="px-5 pb-5 text-sm leading-relaxed text-foreground/60 sm:text-base">
                  {faq.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
