"use client";

import { useEffect, useRef } from "react";

const FEATURES = [
  {
    num: "01",
    id: "questoes",
    name: "Estudo por Questões",
    tagline: "Treino real de Revalida: resolver, entender e acertar mais.",
    body: "Você faz questões oficiais por tema com comentários que mostram o raciocínio, a pegadinha e a conduta que marca ponto. Reforça com simulados inéditos comentados no mesmo padrão.",
    result: "Você treina o que cai, do jeito que cai — reduz pegadinhas e ganha segurança.",
    color: "var(--c-questoes)",
  },
  {
    num: "02",
    id: "resumos",
    name: "Resumos Narrativos",
    tagline: "Clínica em cena: menos teoria solta, mais raciocínio que vira acerto.",
    body: "Você acompanha o caso, reconhece o padrão, entende o raciocínio e fecha com a conduta do jeito que cai. No final: o que a prova quer + checklist de revisão rápida.",
    result: "Menos decoreba, mais clareza — e mais acertos sob pressão.",
    color: "var(--c-resumos)",
  },
  {
    num: "03",
    id: "medvoice",
    name: "MedVoice",
    tagline: "Não é aula. É treinamento de decisão — em áudios curtos.",
    body: "Você entra numa cena clínica, aprende o raciocínio que cai, identifica a pegadinha e sai com a conduta pronta na cabeça. Cena → diagnóstico → pegadinhas → conduta → grito da prova.",
    result: "Revisão rápida, todo dia, sem enrolação — resposta mais automática na prova.",
    color: "var(--c-medvoice)",
  },
  {
    num: "04",
    id: "formula",
    name: "Fórmula MedHelp",
    tagline: "Não é resumo. É atalho de prova — em dicas curtas e diretas.",
    body: "Você pega o tema que já caiu, vê onde a banca tenta te derrubar e grava a resposta certa em segundos. Com macetes, mnemônicos e frases-chave que fixam.",
    result: "Você reduz erro bobo, ganha velocidade — e marca certo quando a banca tenta te confundir.",
    color: "var(--c-formula)",
  },
  {
    num: "05",
    id: "audiocards",
    name: "Audiocards",
    tagline: "Flashcards em áudio com o que já caiu na prova.",
    body: "Para revisar em qualquer lugar, de forma leve, rápida e constante — do jeito que fixa. Áudios curtos e objetivos, só temas recorrentes do Revalida.",
    result: "Revisão rápida em qualquer momento do dia — conteúdo vivo na cabeça na hora da prova.",
    color: "var(--c-audiocards)",
  },
];

function FeatureItem({ feature: f, index }: { feature: typeof FEATURES[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-cin-visible");
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      id={f.id}
      ref={ref}
      className="lp-cin-block"
      style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="mx-auto max-w-5xl px-5 py-20 md:px-8 md:py-28">

        {/* Label row */}
        <div className="mb-8 flex items-center gap-3">
          <span
            className="text-[10px] uppercase tracking-[0.25em] text-white/20"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {f.num}
          </span>
          <span
            className="h-px flex-1 max-w-[32px]"
            style={{ background: f.color, opacity: 0.5 }}
          />
          <span
            className="text-[10px] uppercase tracking-[0.2em]"
            style={{ fontFamily: "var(--font-geist-mono)", color: f.color }}
          >
            {f.name}
          </span>
        </div>

        {/* Tagline */}
        <h3
          className="max-w-3xl text-[clamp(1.9rem,4.5vw,3.8rem)] font-black leading-[1.08] tracking-[-0.02em] text-white"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          {f.tagline}
        </h3>

        {/* Body */}
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/40 sm:text-[1.05rem]">
          {f.body}
        </p>

        {/* Result */}
        <div className="mt-8 flex items-start gap-2 text-sm font-semibold" style={{ color: f.color }}>
          <span className="mt-0.5 flex-shrink-0">✦</span>
          <span>{f.result}</span>
        </div>
      </div>
    </div>
  );
}

export function CinematicFeatures() {
  return (
    <div id="features" style={{ background: "#030303" }}>
      {/* Section label */}
      <div
        className="mx-auto max-w-5xl px-5 pb-2 pt-20 md:px-8 md:pt-28"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div
          className="text-[10px] uppercase tracking-[0.25em] text-white/25"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          O que está incluído
        </div>
        <h2
          className="mt-4 text-[clamp(1.6rem,3.5vw,2.6rem)] font-black leading-tight tracking-[-0.02em] text-white"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          Um sistema completo.
          <span style={{ color: "rgba(255,255,255,0.2)" }}> Cinco ferramentas.</span>
        </h2>
      </div>

      {FEATURES.map((feat, i) => (
        <FeatureItem key={feat.id} feature={feat} index={i} />
      ))}
    </div>
  );
}
