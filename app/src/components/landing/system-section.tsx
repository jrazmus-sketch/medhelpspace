"use client";

import { useState } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

const FEATURES = [
  {
    num: "01",
    id: "questoes",
    name: "Estudo por Questões",
    tagline: "Treino real de Revalida: resolver, entender e acertar mais.",
    body: "Você faz questões oficiais por tema com comentários que mostram o raciocínio, a pegadinha e a conduta que marca ponto.",
    detail: "Reforça com simulados inéditos comentados no mesmo padrão: alternativa correta + comentário + pega Revalida + resumo-chave.",
    result: "Você treina o que cai, do jeito que cai — reduz pegadinhas e ganha segurança.",
    color: "var(--c-questoes)",
  },
  {
    num: "02",
    id: "resumos",
    name: "Resumos Narrativos",
    tagline: "Clínica em cena: menos teoria solta, mais raciocínio que vira acerto.",
    body: "Você acompanha o caso, reconhece o padrão, entende o raciocínio e fecha com a conduta do jeito que cai.",
    detail: "No final você recebe o que a prova quer + checklist de revisão rápida para destravar a questão em minutos.",
    result: "Menos decoreba, mais clareza — e mais acertos sob pressão.",
    color: "var(--c-resumos)",
  },
  {
    num: "03",
    id: "medvoice",
    name: "MedVoice",
    tagline: "Não é aula. É treinamento de decisão — em áudios curtos.",
    body: "Você entra numa cena clínica, aprende o raciocínio que cai, identifica a pegadinha e sai com a conduta pronta na cabeça.",
    detail: "Cada áudio: cena → diagnóstico → pegadinhas → conduta → grito da prova. Fecha com comando de sobrevivência + fica a dica.",
    result: "Revisão rápida, todo dia, sem enrolação — resposta mais automática na prova.",
    color: "var(--c-medvoice)",
  },
  {
    num: "04",
    id: "formula",
    name: "Fórmula MedHelp",
    tagline: "Não é resumo. É 'atalho de prova' — em dicas curtas e diretas.",
    body: "Você pega o tema que já caiu, vê onde a banca tenta te derrubar e grava a resposta certa em segundos.",
    detail: "Cada dica: pegadinha clássica → regrinha de memorização → o que fazer → dica extra. Com macetes, mnemônicos e frases-chave.",
    result: "Você reduz erro bobo, ganha velocidade — e marca certo quando a banca tenta te confundir.",
    color: "var(--c-formula)",
  },
  {
    num: "05",
    id: "audiocards",
    name: "Audiocards",
    tagline: "Flashcards em áudio com o que já caiu na prova.",
    body: "Para revisar em qualquer lugar, de forma leve, rápida e constante — do jeito que fixa.",
    detail: "Áudios curtos e objetivos, perfeitos para repetição diária. Só temas recorrentes do Revalida — para transformar conteúdo em memória ativa.",
    result: "Revisão rápida em qualquer momento do dia — conteúdo vivo na cabeça na hora da prova.",
    color: "var(--c-audiocards)",
  },
  {
    num: "06",
    id: "medhelp60d",
    name: "MedHelp 60D",
    tagline: "Fase final do sistema. Liberado 60 dias antes da prova.",
    body: "Aqui você revisa padrões recorrentes do INEP e as variações que a prova pode trazer, sem se perder em excesso.",
    detail: "Fórmula MedHelp (atalhos de prova: macetes, mnemônicos e frases-chave) + MemoreCards: biblioteca de cards visuais de alta fixação, baseada no que mais cai.",
    result: "Revisão rápida, visual e certeira — a sensação de 'eu já vi isso' na hora da prova.",
    color: "var(--c-pop)",
    special: true,
  },
];

export function SystemSection() {
  const [active, setActive] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const headerRef = useReveal();

  const handleTab = (idx: number) => {
    if (idx === active) return;
    setTransitioning(true);
    setTimeout(() => {
      setActive(idx);
      setTransitioning(false);
    }, 180);
  };

  const f = FEATURES[active];

  return (
    <section id="sistema" className="bg-[var(--lp-alt-bg)] px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div ref={headerRef} className="lp-reveal mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand">
            O que está incluído
          </p>
          <h2
            className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-[2.5rem]"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            Um sistema completo.
            <span className="text-foreground/45"> Seis ferramentas. Uma aprovação.</span>
          </h2>
        </div>

        {/* Tab bar — desktop */}
        <div className="mb-8 hidden gap-1 overflow-x-auto md:flex">
          {FEATURES.map((feat, i) => (
            <button
              key={feat.id}
              onClick={() => handleTab(i)}
              className={cn(
                "relative flex-1 min-w-fit rounded-lg px-4 py-3 text-left text-sm font-semibold transition-all",
                active === i
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/45 hover:text-foreground/70 hover:bg-background/40",
              )}
            >
              <span className="mr-1.5 font-mono text-xs opacity-50">{feat.num}</span>
              {feat.name}
              {feat.special && (
                <span className="ml-1.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                  60D
                </span>
              )}
              {active === i && (
                <span
                  className="lp-tab-active-bar absolute inset-x-0 bottom-0 h-0.5 rounded-full"
                  style={{ backgroundColor: feat.color }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab bar — mobile accordion */}
        <div className="mb-6 flex flex-col gap-2 md:hidden">
          {FEATURES.map((feat, i) => (
            <div key={feat.id} className="rounded-xl border border-border bg-background overflow-hidden">
              <button
                onClick={() => handleTab(i)}
                className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-foreground/40">{feat.num}</span>
                  <span style={{ color: active === i ? feat.color : undefined }}>
                    {feat.name}
                  </span>
                  {feat.special && (
                    <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">60D</span>
                  )}
                </span>
                <span className="text-foreground/30 transition-transform duration-200"
                  style={{ transform: active === i ? "rotate(180deg)" : "rotate(0)" }}>
                  ↓
                </span>
              </button>
              {active === i && (
                <FeatureContent feat={f} transitioning={false} />
              )}
            </div>
          ))}
        </div>

        {/* Content panel — desktop */}
        <div
          className="hidden overflow-hidden rounded-2xl border border-border bg-background md:block"
          style={{ borderLeft: `4px solid ${f.color}` }}
        >
          <FeatureContent feat={f} transitioning={transitioning} />
        </div>

      </div>
    </section>
  );
}

type Feature = {
  num: string;
  id: string;
  name: string;
  tagline: string;
  body: string;
  detail: string;
  result: string;
  color: string;
  special?: boolean;
};

function FeatureContent({
  feat,
  transitioning,
}: {
  feat: Feature;
  transitioning: boolean;
}) {
  return (
    <div
      className="p-6 transition-opacity duration-180 md:p-10"
      style={{ opacity: transitioning ? 0 : 1 }}
    >
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <p
            className="mb-1 text-xs font-bold uppercase tracking-widest"
            style={{ color: feat.color }}
          >
            {feat.name}
          </p>
          <h3
            className="mb-4 text-xl font-bold leading-tight text-foreground sm:text-2xl md:text-3xl"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            {feat.tagline}
          </h3>
          <p className="mb-3 text-sm leading-relaxed text-foreground/65 sm:text-base">
            {feat.body}
          </p>
          <p className="mb-6 text-sm leading-relaxed text-foreground/55 sm:text-base">
            {feat.detail}
          </p>
          <div
            className="inline-flex items-start gap-2 rounded-lg px-4 py-3 text-sm font-semibold"
            style={{
              backgroundColor: `color-mix(in srgb, ${feat.color} 10%, transparent)`,
              color: feat.color,
            }}
          >
            <span>✦</span>
            <span>Resultado: {feat.result}</span>
          </div>
        </div>
        {feat.special && (
          <div className="hidden flex-col items-center justify-center rounded-xl border border-brand/20 bg-brand/5 px-6 py-5 text-center md:flex">
            <div className="mb-1 text-3xl">🔓</div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand">Liberado</p>
            <p className="mt-1 text-sm font-semibold text-foreground">60 dias antes da prova</p>
            <p className="mt-1 text-xs text-foreground/45">Já incluso na compra</p>
          </div>
        )}
      </div>
    </div>
  );
}
