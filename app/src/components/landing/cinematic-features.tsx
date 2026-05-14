"use client";

import { useEffect, useRef } from "react";

/* ─── Inline mockup frames ─────────────────────────────────────────────────── */

function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full overflow-hidden rounded-xl shadow-2xl"
      style={{
        border: "1px solid var(--lp-border)",
        background: "var(--lp-alt)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px var(--lp-border)",
      }}
    >
      {/* Chrome bar */}
      <div
        className="flex items-center gap-1.5 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--lp-border)", background: "var(--lp-alt-2)" }}
      >
        <div className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,95,87,0.45)" }} />
        <div className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255,188,46,0.45)" }} />
        <div className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(40,201,64,0.45)" }} />
        <div
          className="ml-2 flex-1 rounded py-0.5 px-3 text-[9px]"
          style={{ background: "var(--lp-fg-05)", color: "var(--lp-fg-25)" }}
        >
          medhelpspace.com.br
        </div>
      </div>
      {children}
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[220px]">
      <div
        className="overflow-hidden rounded-[2rem]"
        style={{
          border: "7px solid var(--lp-alt-2)",
          boxShadow: "0 0 0 1px var(--lp-border), 0 40px 100px rgba(0,0,0,0.22)",
        }}
      >
        {/* Notch */}
        <div
          className="flex justify-center py-2"
          style={{ background: "var(--lp-alt-2)" }}
        >
          <div className="h-3 w-16 rounded-full" style={{ background: "var(--lp-alt)" }} />
        </div>
        {/* Screen */}
        <div style={{ background: "var(--lp-alt)", minHeight: 380 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Mockup content: 01 Questões (desktop quiz) ───────────────────────────── */
function QuizMockup() {
  const opts = [
    { text: "Insuficiência Cardíaca Congestiva", sel: true },
    { text: "Fibrilação Atrial Isolada", sel: false },
    { text: "Hipertensão Pulmonar Primária", sel: false },
    { text: "Estenose Aórtica Grave", sel: false },
  ];
  return (
    <BrowserFrame>
      <div className="p-5">
        {/* Breadcrumb + progress */}
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[9px] uppercase tracking-widest" style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}>
            Cardiologia · Simulado
          </div>
          <div className="text-[9px]" style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}>
            3 / 12
          </div>
        </div>
        <div className="mb-5 h-0.5 rounded-full" style={{ background: "var(--lp-fg-08)" }}>
          <div className="h-full rounded-full" style={{ background: "var(--brand)", width: "25%" }} />
        </div>
        {/* Question */}
        <div className="mb-5 text-[12px] leading-relaxed" style={{ color: "var(--lp-fg-55)" }}>
          Mulher, 58 anos, refere dispneia progressiva aos esforços há 3 meses. Ao exame: B3, estertores bibasais e edema de membros inferiores. O diagnóstico mais provável é:
        </div>
        {/* Options */}
        <div className="flex flex-col gap-2">
          {opts.map((opt, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[11px]"
              style={{
                background: opt.sel ? "rgba(139,123,255,0.1)" : "var(--lp-fg-05)",
                border: `1px solid ${opt.sel ? "rgba(139,123,255,0.3)" : "var(--lp-border)"}`,
                color: opt.sel ? "var(--brand)" : "var(--lp-fg-40)",
              }}
            >
              <span className="mt-0.5 flex-shrink-0 font-mono font-bold">{String.fromCharCode(65 + i)}</span>
              <span>{opt.text}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <div
            className="rounded-lg px-4 py-2 text-[11px] font-bold text-white"
            style={{ background: "var(--brand)" }}
          >
            Confirmar →
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/* ─── Mockup content: 02 Resumos (phone lesson) ────────────────────────────── */
function ResumosMockup() {
  return (
    <PhoneFrame>
      <div className="p-4">
        <div className="mb-3 text-[8px] uppercase tracking-widest" style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}>
          Reumatologia · Resumos
        </div>
        <div className="mb-1 text-[13px] font-black" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
          Artrite Reumatoide
        </div>
        {/* Sections nav */}
        <div className="mb-4 flex flex-col gap-1.5">
          {["Diagnóstico", "Critérios EULAR", "Tratamento", "Complicações"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ background: i === 0 ? "var(--brand)" : "var(--lp-fg-15)" }}
              />
              <div
                className="text-[10px]"
                style={{ color: i === 0 ? "var(--lp-fg-55)" : "var(--lp-fg-25)" }}
              >
                {s}
              </div>
            </div>
          ))}
        </div>
        <div
          className="mb-2 text-[11px] font-semibold"
          style={{ color: "var(--lp-fg)", borderBottom: "1px solid var(--lp-border)", paddingBottom: 8 }}
        >
          Diagnóstico
        </div>
        {/* Content lines */}
        <div className="space-y-1.5 mb-4">
          {[1, 0.85, 1, 0.7, 0.9, 0.6].map((w, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full"
              style={{ background: "var(--lp-fg-08)", width: `${w * 100}%` }}
            />
          ))}
        </div>
        <div
          className="rounded-lg px-3 py-2 text-center text-[10px] font-semibold"
          style={{ background: "var(--lp-fg-05)", border: "1px solid var(--lp-border)", color: "var(--lp-fg-40)" }}
        >
          Próxima seção →
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ─── Mockup content: 03 MedVoice (phone audio) ────────────────────────────── */
function MedVoiceMockup() {
  const bars = [3,5,8,4,7,6,9,4,6,8,5,3,7,9,5,4,8,6,3,7,5,9,4,6];
  return (
    <PhoneFrame>
      <div className="p-4">
        <div className="mb-3 text-[8px] uppercase tracking-widest" style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}>
          MedVoice · Cardiologia
        </div>
        <div className="mb-0.5 text-[13px] font-black" style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}>
          Fibrilação Atrial
        </div>
        <div className="mb-5 text-[10px]" style={{ color: "var(--lp-fg-40)" }}>
          Áudio 4 de 19 · 4:32
        </div>
        {/* Waveform */}
        <div className="flex items-end gap-0.5 mb-4" style={{ height: 48 }}>
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: h * 5 + "px",
                background: i < 14 ? "var(--brand)" : "var(--lp-fg-15)",
                opacity: i < 14 ? 0.85 : 0.5,
              }}
            />
          ))}
        </div>
        {/* Progress */}
        <div className="flex justify-between text-[9px] mb-1.5" style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}>
          <span>02:14</span><span>04:32</span>
        </div>
        <div className="h-0.5 rounded-full mb-5" style={{ background: "var(--lp-fg-08)" }}>
          <div className="h-full rounded-full" style={{ background: "var(--brand)", width: "49%" }} />
        </div>
        {/* Controls */}
        <div className="flex items-center justify-center gap-5">
          <div className="text-[16px]" style={{ color: "var(--lp-fg-25)" }}>⏮</div>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-white text-sm"
            style={{ background: "var(--brand)", boxShadow: "0 0 20px var(--lp-glow)" }}
          >
            ▶
          </div>
          <div className="text-[16px]" style={{ color: "var(--lp-fg-25)" }}>⏭</div>
        </div>
        {/* Tags */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          {["Diagnóstico", "Tratamento", "Pegadinha"].map(tag => (
            <div
              key={tag}
              className="rounded-md px-2 py-0.5 text-[9px]"
              style={{ background: "var(--lp-fg-05)", border: "1px solid var(--lp-border)", color: "var(--lp-fg-25)" }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ─── Mockup content: 04 Fórmula (desktop tips) ────────────────────────────── */
function FormulaMockup() {
  const tips = [
    { tag: "LEMBRAR", text: "Tosse seca + dispneia progressiva + nódulos hilares bilaterais → Sarcoidose", color: "var(--c-questoes)" },
    { tag: "PEGADINHA", text: "Sibilos em adulto: diferenciar DPOC, asma e ICC antes de tratar", color: "var(--c-audiocards)" },
    { tag: "CONDUTA", text: "Hemoptise maciça → estabilizar + broncoscopia + avaliar cirurgia", color: "var(--c-pop)" },
  ];
  return (
    <BrowserFrame>
      <div className="p-5">
        <div className="mb-4 flex items-center gap-2 text-[9px]" style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}>
          <span>Fórmula MedHelp</span>
          <span style={{ color: "var(--lp-fg-15)" }}>›</span>
          <span>Pneumologia</span>
        </div>
        <div className="flex flex-col gap-3">
          {tips.map(tip => (
            <div
              key={tip.tag}
              className="rounded-lg p-3.5"
              style={{ background: "var(--lp-fg-05)", border: "1px solid var(--lp-border)" }}
            >
              <div
                className="mb-1.5 text-[9px] font-bold uppercase tracking-widest"
                style={{ fontFamily: "var(--font-geist-mono)", color: tip.color }}
              >
                {tip.tag}
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: "var(--lp-fg-55)" }}>
                {tip.text}
              </div>
            </div>
          ))}
        </div>
        <div
          className="mt-4 text-[9px]"
          style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}
        >
          3 dicas · Pneumologia · Fórmula MedHelp
        </div>
      </div>
    </BrowserFrame>
  );
}

/* ─── Mockup content: 05 Audiocards (phone card) ───────────────────────────── */
function AudiocardsMockup() {
  return (
    <PhoneFrame>
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[8px] uppercase tracking-widest" style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}>
            Audiocards
          </div>
          <div className="text-[9px]" style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}>
            7 / 24
          </div>
        </div>
        {/* Card */}
        <div
          className="mb-4 rounded-2xl p-4"
          style={{
            background: "var(--lp-fg-05)",
            border: "1px solid var(--lp-border)",
            minHeight: 160,
          }}
        >
          <div
            className="mb-2 text-[8px] uppercase tracking-widest"
            style={{ color: "var(--lp-fg-25)", fontFamily: "var(--font-geist-mono)" }}
          >
            Cardiologia
          </div>
          <div
            className="text-[12px] font-semibold leading-relaxed"
            style={{ color: "var(--lp-fg)" }}
          >
            Qual o achado ECG patognomônico de Fibrilação Atrial?
          </div>
          {/* Play button */}
          <div className="mt-4 flex justify-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-white"
              style={{ background: "var(--brand)", boxShadow: "0 0 16px var(--lp-glow)" }}
            >
              <span className="text-xs">▶</span>
            </div>
          </div>
        </div>
        {/* Self-assessment */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-xl py-2.5 text-center text-[10px] font-semibold"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
          >
            Errei
          </div>
          <div
            className="rounded-xl py-2.5 text-center text-[10px] font-semibold"
            style={{ background: "rgba(5,150,105,0.08)", border: "1px solid rgba(5,150,105,0.2)", color: "#059669" }}
          >
            Acertei
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

/* ─── Feature data ──────────────────────────────────────────────────────────── */

type MockupType = "quiz" | "resumos" | "medvoice" | "formula" | "audiocards";

const FEATURES: {
  num: string;
  id: string;
  name: string;
  tagline: string;
  body: string;
  result: string;
  color: string;
  mockup: MockupType;
  bg: "base" | "alt";
}[] = [
  {
    num: "01",
    id: "questoes",
    name: "Estudo por Questões",
    tagline: "Treino real de Revalida: resolver, entender e acertar mais.",
    body: "Você faz questões oficiais por tema com comentários que mostram o raciocínio, a pegadinha e a conduta que marca ponto. Reforça com simulados inéditos comentados no mesmo padrão.",
    result: "Você treina o que cai, do jeito que cai — reduz pegadinhas e ganha segurança.",
    color: "var(--c-questoes)",
    mockup: "quiz",
    bg: "base",
  },
  {
    num: "02",
    id: "resumos",
    name: "Resumos Narrativos",
    tagline: "Clínica em cena: menos teoria solta, mais raciocínio que vira acerto.",
    body: "Você acompanha o caso, reconhece o padrão, entende o raciocínio e fecha com a conduta do jeito que cai. No final: o que a prova quer + checklist de revisão rápida.",
    result: "Menos decoreba, mais clareza — e mais acertos sob pressão.",
    color: "var(--c-resumos)",
    mockup: "resumos",
    bg: "alt",
  },
  {
    num: "03",
    id: "medvoice",
    name: "MedVoice",
    tagline: "Não é aula. É treinamento de decisão — em áudios curtos.",
    body: "Você entra numa cena clínica, aprende o raciocínio que cai, identifica a pegadinha e sai com a conduta pronta na cabeça. Cena → diagnóstico → pegadinhas → conduta → grito da prova.",
    result: "Revisão rápida, todo dia, sem enrolação — resposta mais automática na prova.",
    color: "var(--c-medvoice)",
    mockup: "medvoice",
    bg: "base",
  },
  {
    num: "04",
    id: "formula",
    name: "Fórmula MedHelp",
    tagline: "Não é resumo. É atalho de prova — em dicas curtas e diretas.",
    body: "Você pega o tema que já caiu, vê onde a banca tenta te derrubar e grava a resposta certa em segundos. Com macetes, mnemônicos e frases-chave que fixam.",
    result: "Você reduz erro bobo, ganha velocidade — e marca certo quando a banca tenta te confundir.",
    color: "var(--c-formula)",
    mockup: "formula",
    bg: "alt",
  },
  {
    num: "05",
    id: "audiocards",
    name: "Audiocards",
    tagline: "Flashcards em áudio com o que já caiu na prova.",
    body: "Para revisar em qualquer lugar, de forma leve, rápida e constante — do jeito que fixa. Áudios curtos e objetivos, só temas recorrentes do Revalida.",
    result: "Revisão rápida em qualquer momento do dia — conteúdo vivo na cabeça na hora da prova.",
    color: "var(--c-audiocards)",
    mockup: "audiocards",
    bg: "base",
  },
];

function MockupRenderer({ type }: { type: MockupType }) {
  switch (type) {
    case "quiz":      return <QuizMockup />;
    case "resumos":   return <ResumosMockup />;
    case "medvoice":  return <MedVoiceMockup />;
    case "formula":   return <FormulaMockup />;
    case "audiocards": return <AudiocardsMockup />;
  }
}

function FeatureItem({ feature: f }: { feature: typeof FEATURES[0] }) {
  const ref = useRef<HTMLElement>(null);

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
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const isPhone = f.mockup === "resumos" || f.mockup === "medvoice" || f.mockup === "audiocards";

  return (
    <section
      id={f.id}
      ref={ref}
      className="lp-cin-block"
      style={{
        background: f.bg === "base" ? "var(--lp-base)" : "var(--lp-alt)",
        borderTop: "1px solid var(--lp-border)",
      }}
    >
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16 lg:gap-24">
          {/* Text column */}
          <div>
            {/* Label */}
            <div className="mb-6 flex items-center gap-3">
              <span
                className="text-[10px] uppercase tracking-[0.25em]"
                style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
              >
                {f.num}
              </span>
              <span className="h-px w-8" style={{ background: f.color, opacity: 0.5 }} />
              <span
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{ fontFamily: "var(--font-geist-mono)", color: f.color }}
              >
                {f.name}
              </span>
            </div>

            {/* Tagline */}
            <h3
              className="text-[clamp(1.75rem,3.8vw,3rem)] font-black leading-[1.08] tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
            >
              {f.tagline}
            </h3>

            {/* Body */}
            <p
              className="mt-5 text-base leading-relaxed sm:text-[1.05rem]"
              style={{ color: "var(--lp-fg-40)" }}
            >
              {f.body}
            </p>

            {/* Result */}
            <div
              className="mt-6 flex items-start gap-2 text-sm font-semibold"
              style={{ color: f.color }}
            >
              <span className="mt-0.5 flex-shrink-0">✦</span>
              <span>{f.result}</span>
            </div>
          </div>

          {/* Mockup column */}
          <div className={isPhone ? "flex items-center justify-center py-4" : "py-4"}>
            <MockupRenderer type={f.mockup} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function CinematicFeatures() {
  return (
    <div id="features">
      {/* Section header */}
      <div
        style={{
          background: "var(--lp-base)",
          borderTop: "1px solid var(--lp-border)",
        }}
      >
        <div className="mx-auto max-w-7xl px-5 pb-4 pt-16 md:px-8 md:pt-24">
          <div
            className="text-[10px] uppercase tracking-[0.25em]"
            style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
          >
            O que está incluído
          </div>
          <h2
            className="mt-4 text-[clamp(1.6rem,3.5vw,2.6rem)] font-black leading-tight tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            Um sistema completo.
            <span style={{ color: "var(--lp-fg-15)" }}> Cinco ferramentas.</span>
          </h2>
        </div>
      </div>

      {FEATURES.map((feat) => (
        <FeatureItem key={feat.id} feature={feat} />
      ))}
    </div>
  );
}
