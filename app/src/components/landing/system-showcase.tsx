"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";

/* ════════════════════════════════════════════════════════════════════════════
   System showcase — replaces the flipping tablet. Each tool is a real app
   screenshot (borderless, soft-shadow) beside its copy, alternating sides on
   desktop and stacking on mobile. Reveals on scroll. Theme-aware tokens.
   ════════════════════════════════════════════════════════════════════════════ */

type Feature = {
  num: string;
  id: string;
  name: string;
  tagline: string;
  body: string;
  result: string;
  color: string;
  shot: string;
  alt: string;
};

const FEATURES: Feature[] = [
  {
    num: "01",
    id: "questoes",
    name: "Estudo por Questões",
    tagline: "Treine do jeito que a banca cobra.",
    body: "Questões no estilo INEP com comentário em cada alternativa — a pegadinha, o raciocínio e a conduta que marca ponto. Refaça só as que errou até dominar.",
    result: "Você treina o que cai, do jeito que cai — e ganha segurança.",
    color: "var(--c-questoes)",
    shot: "/landing/shot-questoes-comentario.webp",
    alt: "Tela de questão respondida, com a alternativa correta e o comentário.",
  },
  {
    num: "02",
    id: "resumos",
    name: "Resumos Narrativos",
    tagline: "Clínica em cena, não teoria solta.",
    body: "Você acompanha o caso, reconhece o padrão e fecha com a conduta do jeito que cai. No fim: o que a prova quer + checklist de revisão rápida.",
    result: "Menos decoreba, mais clareza — e mais acertos sob pressão.",
    color: "var(--c-resumos)",
    shot: "/landing/shot-resumos.webp",
    alt: "Tela de um resumo narrativo no formato Clínica em Cena.",
  },
  {
    num: "03",
    id: "medvoice",
    name: "MedVoice",
    tagline: "Estude de ouvido — no plantão, no ônibus, na madrugada.",
    body: "Cenas clínicas em áudio: diagnóstico, pegadinha e conduta entrando na sua cabeça. Com transcrição para ler enquanto ouve.",
    result: "Revisão rápida todo dia — resposta mais automática na prova.",
    color: "var(--c-medvoice)",
    shot: "/landing/shot-medvoice.webp",
    alt: "Player de áudio MedVoice em tela cheia.",
  },
  {
    num: "04",
    id: "flashcards",
    name: "Flashcards",
    tagline: "5.140 cartões que decidem sozinhos quando voltar.",
    body: "Você se autoavalia — “errei” ou “acertei” — e a repetição espaçada cuida do resto. O que você domina espaça; o que você erra volta amanhã.",
    result: "Fixação real, não releitura passiva.",
    color: "var(--c-flashcards)",
    shot: "/landing/shot-flashcards.webp",
    alt: "Tela de um flashcard com a frente da pergunta.",
  },
  {
    num: "05",
    id: "revalida-up",
    name: "Revalida Up",
    tagline: "Os padrões que mais caem — em recordação ativa.",
    body: "Temas de “caiu na prova” no formato que fixa: a pista aparece, você tenta prever, e só então revela o padrão de prova.",
    result: "Você não lê o padrão — você se lembra dele.",
    color: "var(--c-revalida)",
    shot: "/landing/shot-revalida-up.webp",
    alt: "Tela do Revalida Up no modo de recordação ativa.",
  },
];

function FeatureRow({ f, i }: { f: Feature; i: number }) {
  const ref = useReveal(0.18);
  const reversed = i % 2 === 1;

  return (
    <div
      ref={ref}
      className={`lp-reveal grid items-center gap-10 py-14 md:grid-cols-2 md:gap-16 md:py-20`}
    >
      {/* Copy */}
      <div className={reversed ? "md:order-2" : ""}>
        <div className="mb-5 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.25em]" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}>
            {f.num}
          </span>
          <span className="h-px w-8" style={{ background: f.color, opacity: 0.5 }} />
          <span className="text-[10px] uppercase tracking-[0.2em]" style={{ fontFamily: "var(--font-geist-mono)", color: f.color }}>
            <SiteText as="span" k={`sys.${f.id}.name`} fallback={f.name} />
          </span>
        </div>
        <h3 className="text-[clamp(1.6rem,3.6vw,2.6rem)] font-black leading-[1.1] tracking-[-0.02em]" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
          <SiteText as="span" multiline k={`sys.${f.id}.tagline`} fallback={f.tagline} />
        </h3>
        <p className="mt-5 text-base leading-relaxed sm:text-[1.05rem]" style={{ color: "var(--lp-fg-40)" }}>
          <SiteText as="span" multiline k={`sys.${f.id}.body`} fallback={f.body} />
        </p>
        <div className="mt-6 flex items-start gap-2 text-sm font-semibold" style={{ color: f.color }}>
          <span className="mt-0.5 flex-shrink-0">✦</span>
          <SiteText as="span" multiline k={`sys.${f.id}.result`} fallback={f.result} />
        </div>
      </div>

      {/* Real app screenshot — borderless, soft-shadow */}
      <div className={`flex justify-center ${reversed ? "md:order-1" : ""}`}>
        <div
          className="overflow-hidden rounded-[26px]"
          style={{
            maxWidth: 270,
            border: "1px solid var(--lp-border)",
            boxShadow: "0 30px 70px rgba(0,0,0,0.45)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.shot} alt={f.alt} width={1170} height={2532} className="block w-full" style={{ height: "auto" }} loading="lazy" />
        </div>
      </div>
    </div>
  );
}

export function SystemShowcase() {
  return (
    <div id="features" style={{ background: "var(--lp-base)", borderTop: "1px solid var(--lp-border)" }}>
      <div className="mx-auto max-w-6xl px-5 pt-16 md:px-8 md:pt-24">
        <div className="text-[10px] uppercase tracking-[0.25em]" style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}>
          <SiteText as="span" k="sys.eyebrow" fallback="O que está incluído" />
        </div>
        <h2 className="mt-4 max-w-3xl text-[clamp(1.7rem,3.6vw,2.8rem)] font-black leading-tight tracking-[-0.02em]" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
          <SiteText as="span" k="sys.title1" fallback="Um sistema completo." />
          <span style={{ color: "var(--lp-fg-15)" }}> <SiteText as="span" k="sys.title2" fallback="Não um curso a mais." /></span>
        </h2>

        <div className="mt-6 divide-y" style={{ borderColor: "var(--lp-border)" }}>
          {FEATURES.map((f, i) => (
            <FeatureRow key={f.id} f={f} i={i} />
          ))}
        </div>
      </div>
      <div className="h-16 md:h-24" />
    </div>
  );
}
