"use client";

import { useEffect, useRef, useState } from "react";
import { SiteText } from "./site-text";

/* ═══════════════════════════════════════════════════════════════════════════
   Cinematic features — one portrait tablet that follows you down sections
   01→05 and flips 180° on its Y axis between each, landing flat on the next
   face. Each face mirrors a real member-page UI and plays a one-shot
   micro-interaction when it settles. Mobile: static faces inline (no flip).
   The whole motion layer is scroll-driven via a single rAF handler that reads
   each section's center; `motion` is intentionally avoided so the rotation is
   glued to scroll position with zero spring lag.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Feature copy (left column) ────────────────────────────────────────────── */

type FaceId = "questoes" | "resumos" | "medvoice" | "formula" | "audiocards";

const FEATURES: {
  num: string;
  id: FaceId;
  name: string;
  tagline: string;
  body: string;
  result: string;
  color: string;
}[] = [
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

const ACCENT: Record<FaceId, string> = {
  questoes: "var(--c-questoes)",
  resumos: "var(--c-resumos)",
  medvoice: "var(--c-medvoice)",
  formula: "var(--c-formula)",
  audiocards: "var(--c-audiocards)",
};

/* ─── Shared mono overline ──────────────────────────────────────────────────── */
function Overline({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ft-overline"
      style={{
        fontSize: 8.5,
        letterSpacing: ".22em",
        textTransform: "uppercase",
        color: "var(--lp-fg-25)",
        fontFamily: "var(--font-geist-mono)",
      }}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACE 01 — Estudo por Questões (mirrors QuizPlayer)
   ═══════════════════════════════════════════════════════════════════════════ */
function QuizFace() {
  const opts = [
    "Insuficiência Cardíaca Congestiva",
    "Fibrilação Atrial Isolada",
    "Hipertensão Pulmonar Primária",
    "Estenose Aórtica Grave",
  ];
  return (
    <div className="ft-pad ft-quiz">
      <div className="ft-row-between" style={{ marginBottom: 8 }}>
        <Overline>Cardiologia · Simulado</Overline>
        <span style={monoMuted}>3 / 12</span>
      </div>
      <div className="ft-progress" style={{ marginBottom: 14 }}>
        <i className="ft-quiz-prog" />
      </div>

      <p className="ft-stem">
        Mulher, 58 anos, com dispneia progressiva aos esforços há 3 meses. Ao
        exame: B3, estertores bibasais e edema de membros inferiores. Diagnóstico
        mais provável?
      </p>

      <div className="ft-opts">
        {opts.map((t, i) => (
          <div
            key={i}
            className={`ft-opt${i === 0 ? " ft-opt-a" : ""}`}
            style={{ animationDelay: `${0.12 + i * 0.08}s` }}
          >
            <span className="ft-opt-letter">{String.fromCharCode(65 + i)}</span>
            <span className="ft-opt-text">{t}</span>
            {i === 0 && <span className="ft-check">✓</span>}
          </div>
        ))}
      </div>

      <div className="ft-feedback">
        <div className="ft-feedback-tag">PEGA REVALIDA</div>
        <p>
          B3 + congestão sistêmica e pulmonar = IC descompensada. Não confunda
          com causas isoladas de dispneia.
        </p>
      </div>

      <span className="ft-cursor ft-cursor-quiz" aria-hidden />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACE 02 — Resumos Narrativos (mirrors PlainContentRenderer + TOC)
   ═══════════════════════════════════════════════════════════════════════════ */
function ResumosFace() {
  const nav = ["Diagnóstico", "Critérios EULAR", "Tratamento", "Complicações"];
  const lines = [1, 0.92, 0.7, 0.96, 0.84, 0.6, 0.88, 0.5];
  return (
    <div className="ft-pad ft-resumos">
      <Overline>Reumatologia · Resumos</Overline>
      <h4 className="ft-title">Artrite Reumatoide</h4>

      <div className="ft-nav">
        {nav.map((s, i) => (
          <div
            key={s}
            className={`ft-nav-item${i === 0 ? " ft-nav-on" : ""}`}
            style={{ animationDelay: `${0.1 + i * 0.07}s` }}
          >
            <span className="ft-nav-dot" />
            {s}
          </div>
        ))}
      </div>

      <div className="ft-sub">Diagnóstico</div>
      <div className="ft-lines">
        {lines.map((w, i) => (
          <i
            key={i}
            className="ft-line"
            style={{ width: `${w * 100}%`, animationDelay: `${0.3 + i * 0.07}s` }}
          />
        ))}
      </div>

      <div className="ft-cta">Próxima seção →</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACE 03 — MedVoice (mirrors DesktopAudioPlayerChrome)
   ═══════════════════════════════════════════════════════════════════════════ */
const WAVE = [3, 5, 8, 4, 7, 6, 9, 4, 6, 8, 5, 3, 7, 9, 5, 4, 8, 6, 3, 7, 5, 9, 4, 6, 7, 5, 8, 4];
function MedVoiceFace() {
  return (
    <div className="ft-pad ft-medvoice">
      <div className="ft-row-between" style={{ marginBottom: 10 }}>
        <div className="ft-mv-head">
          <span className="ft-mv-dot" />
          <span>MedVoice · Cardiologia</span>
        </div>
        <div className="ft-continuo">
          <span className="ft-continuo-dot" /> CONTÍNUO
        </div>
      </div>

      <h4 className="ft-title" style={{ marginBottom: 2 }}>
        Fibrilação Atrial
      </h4>
      <div style={{ ...monoMuted, marginBottom: 14 }}>Áudio 4 de 19 · 4:32</div>

      <div className="ft-wave">
        {WAVE.map((h, i) => (
          <i
            key={i}
            className="ft-bar"
            style={{ height: `${h * 9 + 8}%`, animationDelay: `${(i % 12) * 0.06}s` }}
          />
        ))}
      </div>

      <div className="ft-row-between" style={{ ...monoMuted, margin: "8px 0 4px" }}>
        <span className="ft-mv-elapsed">02:14</span>
        <span>04:32</span>
      </div>
      <div className="ft-progress">
        <i className="ft-mv-prog" />
      </div>

      <div className="ft-mv-controls">
        <span className="ft-mv-skip">⏮</span>
        <span className="ft-mv-15">−15</span>
        <button className="ft-mv-play" aria-hidden tabIndex={-1}>
          <span className="ft-ico-play">▶</span>
          <span className="ft-ico-pause">❚❚</span>
        </button>
        <span className="ft-mv-15">+15</span>
        <span className="ft-mv-skip">⏭</span>
      </div>

      <div className="ft-tags">
        {["Cena", "Diagnóstico", "Pegadinha", "Conduta"].map((t) => (
          <span key={t} className="ft-tag">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACE 04 — Fórmula MedHelp (mirrors prose-formula tip cards)
   ═══════════════════════════════════════════════════════════════════════════ */
function FormulaFace() {
  const tips = [
    { tag: "LEMBRAR", c: "var(--c-questoes)", t: "Tosse seca + dispneia progressiva + nódulos hilares bilaterais → Sarcoidose." },
    { tag: "PEGADINHA", c: "var(--c-audiocards)", t: "Sibilos no adulto: diferencie DPOC, asma e ICC antes de tratar." },
    { tag: "CONDUTA", c: "var(--c-pop)", t: "Hemoptise maciça → estabilizar + broncoscopia + avaliar cirurgia." },
  ];
  return (
    <div className="ft-pad ft-formula">
      <div className="ft-crumb">
        <span>Fórmula MedHelp</span>
        <span className="ft-crumb-sep">›</span>
        <span>Pneumologia</span>
      </div>

      <div className="ft-tips">
        {tips.map((tip, i) => (
          <div
            key={tip.tag}
            className="ft-tip"
            style={{ animationDelay: `${0.12 + i * 0.13}s` }}
          >
            <div className="ft-tip-tag" style={{ color: tip.c }}>
              <i className="ft-tip-sweep" style={{ animationDelay: `${0.4 + i * 0.13}s` }} />
              {tip.tag}
            </div>
            <p className="ft-tip-text">{tip.t}</p>
          </div>
        ))}
      </div>

      <div className="ft-formula-foot">3 dicas · Pneumologia · Fórmula MedHelp</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACE 05 — Audiocards (mirrors FlashcardPlayer flip + self-assessment)
   ═══════════════════════════════════════════════════════════════════════════ */
function AudiocardsFace() {
  return (
    <div className="ft-pad ft-audiocards">
      <div className="ft-row-between" style={{ marginBottom: 12 }}>
        <Overline>Audiocards</Overline>
        <span style={monoMuted}>7 / 24</span>
      </div>

      <div className="ft-ac-stage">
        <div className="ft-ac-front">
          <Overline>Cardiologia</Overline>
          <p className="ft-ac-q">Qual o achado eletrocardiográfico patognomônico da Fibrilação Atrial?</p>
          <span className="ft-ac-play">▶</span>
          <span className="ft-ac-hint">Toque para ver</span>
        </div>
        <div className="ft-ac-back">
          <Overline>Resposta</Overline>
          <p className="ft-ac-a">
            Ausência de ondas P, substituídas por ondas <b>f</b> irregulares, com
            intervalos R-R irregularmente irregulares.
          </p>
        </div>
      </div>

      <div className="ft-ac-buttons">
        <span className="ft-ac-btn ft-ac-errei">Errei</span>
        <span className="ft-ac-btn ft-ac-acertei">Acertei</span>
      </div>
    </div>
  );
}

const FACES: Record<FaceId, () => React.JSX.Element> = {
  questoes: QuizFace,
  resumos: ResumosFace,
  medvoice: MedVoiceFace,
  formula: FormulaFace,
  audiocards: AudiocardsFace,
};

const monoMuted: React.CSSProperties = {
  fontSize: 9,
  color: "var(--lp-fg-25)",
  fontFamily: "var(--font-geist-mono)",
};

/* ─── Tablet shell (portrait device frame) ──────────────────────────────────── */
function TabletScreen({ id, active }: { id: FaceId; active: boolean }) {
  const Face = FACES[id];
  return (
    <div
      className={`ft-screen ft-face-${id}${active ? " ft-active" : ""}`}
      style={{ ["--acc" as string]: ACCENT[id] }}
    >
      <Face />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Desktop: one tablet, scroll-driven Y-flip across sections 01→05.
   ═══════════════════════════════════════════════════════════════════════════ */
function FlippingTablet({
  sectionRefs,
}: {
  sectionRefs: React.RefObject<(HTMLElement | null)[]>;
}) {
  const flipRef = useRef<HTMLDivElement>(null);
  const [front, setFront] = useState(0);
  const [back, setBack] = useState(1);
  const [active, setActive] = useState(-1); // -1 = mid-flip / nothing settled
  const [view, setView] = useState(0); // nearest section (reduced-motion display)
  const [reduced, setReduced] = useState(false);
  const cur = useRef({ front: 0, back: 1, active: -1, view: 0 });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(mq.matches);
    const onMq = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onMq);

    const N = FEATURES.length;
    const LO = 0.34; // fraction of a gap held flat before the flip starts
    const HI = 0.66; // fraction after which it's flat again
    let raf = 0;

    function compute() {
      raf = 0;
      const els = sectionRefs.current;
      if (!els || !els[0]) return;
      const vp = window.innerHeight / 2;
      const centers = els.map((el) => {
        if (!el) return Number.POSITIVE_INFINITY;
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });

      // sectionFloat x ∈ [0, N-1] — viewport-center position among section centers
      let x: number;
      if (vp <= centers[0]) x = 0;
      else if (vp >= centers[N - 1]) x = N - 1;
      else {
        x = N - 1;
        for (let k = 0; k < N - 1; k++) {
          if (vp >= centers[k] && vp < centers[k + 1]) {
            x = k + (vp - centers[k]) / (centers[k + 1] - centers[k] || 1);
            break;
          }
        }
      }

      const k = Math.floor(x);
      const fr = x - k;

      // Plateau easing: hold flat near each section, smoothstep flip in the gap
      let e: number;
      if (fr <= LO) e = 0;
      else if (fr >= HI) e = 1;
      else {
        const t = (fr - LO) / (HI - LO);
        e = t * t * (3 - 2 * t);
      }
      const deg = (k + e) * 180;

      // Two physical faces: front holds even indices, back holds odd. By
      // construction a face's content only ever changes while it's hidden.
      const lo = Math.min(Math.max(k, 0), N - 2);
      const f = lo % 2 === 0 ? lo : lo + 1;
      const b = lo % 2 === 0 ? lo + 1 : lo;

      // Nearest section center — drives the reduced-motion crossfade, and
      // (within a threshold) the one-shot micro-interaction. Going to -1
      // between sections is what lets a face replay its animation each time
      // it lands flat again.
      let nearest = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < N; i++) {
        const d = Math.abs(vp - centers[i]);
        if (d < bestD) { bestD = d; nearest = i; }
      }
      const a = bestD <= window.innerHeight * 0.34 ? nearest : -1;

      if (!mq.matches && flipRef.current) {
        const edge = Math.abs(Math.sin((deg * Math.PI) / 180)); // 0 flat → 1 edge-on
        flipRef.current.style.transform = `rotateY(${deg}deg)`;
        flipRef.current.style.setProperty("--ft-edge", edge.toFixed(3));
      }

      const s = cur.current;
      if (f !== s.front) { s.front = f; setFront(f); }
      if (b !== s.back) { s.back = b; setBack(b); }
      if (a !== s.active) { s.active = a; setActive(a); }
      if (nearest !== s.view) { s.view = nearest; setView(nearest); }
    }

    function onScroll() {
      if (!raf) raf = requestAnimationFrame(compute);
    }

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sectionRefs]);

  // Reduced motion: no flip — cross-fade the nearest face in place.
  if (reduced) {
    const id = FEATURES[view].id;
    return (
      <div className="ft-perspective" aria-hidden>
        <div className="ft-flip ft-flip-static">
          <span className="ft-cam" />
          <div className="ft-face ft-face-front" key={id} style={{ animation: "ftFadeFace .4s ease both" }}>
            <TabletScreen id={id} active />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ft-perspective" aria-hidden>
      <div ref={flipRef} className="ft-flip">
        <span className="ft-cam" />
        <div className="ft-face ft-face-front">
          <TabletScreen id={FEATURES[front].id} active={active === front} />
        </div>
        <div className="ft-face ft-face-back">
          <TabletScreen id={FEATURES[back].id} active={active === back} />
        </div>
      </div>
    </div>
  );
}

/* ─── Left text block ───────────────────────────────────────────────────────── */
function FeatureText({
  feature: f,
  setRef,
}: {
  feature: (typeof FEATURES)[0];
  setRef: (el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setRef(el);
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-cin-visible");
          obs.disconnect();
        }
      },
      { threshold: 0.18 },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      id={f.id}
      ref={ref}
      className="lp-cin-block ft-section flex flex-col justify-center py-16 md:min-h-screen md:py-24"
    >
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
          <SiteText as="span" k={`features.${f.id}.name`} fallback={f.name} />
        </span>
      </div>

      <h3
        className="text-[clamp(1.75rem,3.8vw,3rem)] font-black leading-[1.08] tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
      >
        <SiteText as="span" multiline k={`features.${f.id}.tagline`} fallback={f.tagline} />
      </h3>

      <p className="mt-5 text-base leading-relaxed sm:text-[1.05rem]" style={{ color: "var(--lp-fg-40)" }}>
        <SiteText as="span" multiline k={`features.${f.id}.body`} fallback={f.body} />
      </p>

      <div className="mt-6 flex items-start gap-2 text-sm font-semibold" style={{ color: f.color }}>
        <span className="mt-0.5 flex-shrink-0">✦</span>
        <SiteText as="span" multiline k={`features.${f.id}.result`} fallback={f.result} />
      </div>

      {/* Mobile-only static face (no follow, no flip). */}
      <div className="mt-10 flex justify-center md:hidden">
        <div className="ft-perspective ft-perspective-mobile">
          <div className="ft-flip ft-flip-static">
            <span className="ft-cam" />
            <div className="ft-face ft-face-front">
              <TabletScreen id={f.id} active={false} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Section composition ───────────────────────────────────────────────────── */
export function CinematicFeatures() {
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  return (
    <div id="features" style={{ background: "var(--lp-base)", borderTop: "1px solid var(--lp-border)" }}>
      <style>{FT_CSS}</style>

      {/* Header */}
      <div className="mx-auto max-w-7xl px-5 pb-2 pt-16 md:px-8 md:pt-24">
        <div
          className="text-[10px] uppercase tracking-[0.25em]"
          style={{ fontFamily: "var(--font-geist-mono)", color: "var(--lp-fg-25)" }}
        >
          <SiteText as="span" k="features.eyebrow" fallback="O que está incluído" />
        </div>
        <h2
          className="mt-4 text-[clamp(1.6rem,3.5vw,2.6rem)] font-black leading-tight tracking-[-0.02em]"
          style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
        >
          <SiteText as="span" k="features.title1" fallback="Um sistema completo." />
          <span style={{ color: "var(--lp-fg-15)" }}> <SiteText as="span" k="features.title2" fallback="Cinco ferramentas." /></span>
        </h2>
      </div>

      {/* Two-column scrollytelling: text left, sticky flipping tablet right. */}
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="md:grid md:grid-cols-2 md:gap-16 lg:gap-24">
          <div>
            {FEATURES.map((f, i) => (
              <FeatureText
                key={f.id}
                feature={f}
                setRef={(el) => {
                  sectionRefs.current[i] = el;
                }}
              />
            ))}
          </div>

          {/* Desktop tablet column — sticky, vertically centered. */}
          <div className="hidden md:block">
            <div className="sticky top-0 flex h-screen items-center justify-center">
              <FlippingTablet sectionRefs={sectionRefs} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Styles — tablet chassis, 3D flip lighting, and per-face micro-interactions.
   ═══════════════════════════════════════════════════════════════════════════ */
const FT_CSS = `
.ft-perspective{ perspective:1700px; transform:scale(0.82); transform-origin:center; }
@media (min-width:1024px){ .ft-perspective{ transform:scale(0.92); } }
@media (min-width:1280px){ .ft-perspective{ transform:scale(1); } }
/* Mobile uses zoom (collapses layout box, unlike transform:scale) so the fixed
   320px frame can never force horizontal overflow on small phones. */
.ft-perspective-mobile{ transform:none; perspective:none; zoom:0.82; }
@media (min-width:430px){ .ft-perspective-mobile{ zoom:0.94; } }

.ft-flip{
  position:relative; width:320px; height:444px;
  transform-style:preserve-3d; will-change:transform;
  border-radius:30px;
  background:linear-gradient(150deg,#1a1a24 0%,#0c0c14 55%,#16161f 100%);
  box-shadow:0 40px 90px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04);
}
.ft-flip-static{ transform:rotateY(0deg); }
.ft-cam{
  position:absolute; top:9px; left:50%; width:6px; height:6px; margin-left:-3px;
  border-radius:50%; background:radial-gradient(circle at 35% 30%,#3a3a52,#08080d);
  box-shadow:0 0 0 1px rgba(255,255,255,0.05); transform:translateZ(8px);
  backface-visibility:hidden; z-index:3;
}
.ft-face{
  position:absolute; inset:11px; border-radius:20px; overflow:hidden;
  backface-visibility:hidden;
  box-shadow:0 0 0 1px rgba(255,255,255,0.05) inset;
}
.ft-face-front{ transform:translateZ(8px); }
.ft-face-back{ transform:rotateY(180deg) translateZ(8px); }
/* Edge-on dim + sweeping glare driven by --ft-edge (set per frame). */
.ft-face::after{
  content:''; position:absolute; inset:0; pointer-events:none; z-index:9;
  background:#05050a; opacity:calc(var(--ft-edge,0) * 0.62);
}
.ft-face::before{
  content:''; position:absolute; inset:0; pointer-events:none; z-index:10;
  background:linear-gradient(105deg,transparent 32%,rgba(255,255,255,0.16) 50%,transparent 68%);
  opacity:calc(var(--ft-edge,0) * 0.85);
}

.ft-screen{
  position:absolute; inset:0; background:var(--lp-alt);
  color:var(--lp-fg); font-family:var(--font-geist-sans,system-ui,sans-serif);
  overflow:hidden;
}
.ft-pad{ position:absolute; inset:0; padding:18px 16px; display:flex; flex-direction:column; }
.ft-row-between{ display:flex; align-items:center; justify-content:space-between; }
.ft-title{ font-family:var(--font-bricolage); font-weight:800; font-size:15px; color:var(--lp-fg); letter-spacing:-0.01em; margin:3px 0 6px; }
.ft-progress{ height:3px; border-radius:99px; background:var(--lp-fg-08); overflow:hidden; }

/* ── 01 Quiz ─────────────────────────────────────────────────────────────── */
.ft-quiz-prog{ display:block; height:100%; border-radius:99px; background:var(--acc); width:25%; }
.ft-active .ft-quiz-prog{ animation:ftQuizProg .6s ease both; }
.ft-stem{ font-size:11px; line-height:1.5; color:var(--lp-fg-55); margin-bottom:11px; }
.ft-opts{ display:flex; flex-direction:column; gap:7px; }
.ft-opt{
  position:relative; display:flex; align-items:flex-start; gap:8px;
  border-radius:10px; padding:9px 10px; font-size:10.5px; line-height:1.3;
  background:var(--lp-fg-05); border:1px solid var(--lp-border); color:var(--lp-fg-40);
}
.ft-active .ft-opt{ animation:ftFadeUp .5s ease both; }
.ft-opt-letter{ font-family:var(--font-geist-mono); font-weight:700; flex-shrink:0; }
.ft-opt-text{ flex:1; }
.ft-check{ color:#22c55e; font-weight:800; opacity:0; }
.ft-opt-a{ }
.ft-active .ft-opt-a{ animation:ftFadeUp .5s ease both, ftCorrect .5s ease 1.35s both; }
.ft-active .ft-opt-a .ft-opt-letter,
.ft-active .ft-opt-a .ft-opt-text{ animation:ftCorrectText .5s ease 1.35s both; }
.ft-active .ft-opt-a .ft-check{ animation:ftPop .35s ease 1.5s both; }
.ft-feedback{
  margin-top:10px; border-radius:10px; padding:9px 11px;
  background:color-mix(in srgb,var(--acc) 10%,transparent);
  border:1px solid color-mix(in srgb,var(--acc) 26%,transparent);
  opacity:0; transform:translateY(6px);
}
.ft-active .ft-feedback{ animation:ftReveal .5s ease 1.7s both; }
.ft-feedback-tag{ font-family:var(--font-geist-mono); font-size:8px; font-weight:700; letter-spacing:.18em; color:var(--acc); margin-bottom:4px; }
.ft-feedback p{ font-size:10px; line-height:1.45; color:var(--lp-fg-55); }
.ft-cursor-quiz{
  position:absolute; width:15px; height:15px; border-radius:50%;
  background:rgba(255,255,255,0.9); box-shadow:0 2px 8px rgba(0,0,0,0.4);
  left:120px; top:150px; opacity:0; z-index:12; pointer-events:none;
}
.ft-active .ft-cursor-quiz{ animation:ftCursorQuiz 1.6s cubic-bezier(0.5,0,0.2,1) .55s both; }

/* ── 02 Resumos ──────────────────────────────────────────────────────────── */
.ft-nav{ position:relative; display:flex; flex-direction:column; gap:8px; margin:4px 0 14px; padding-left:2px; }
.ft-nav-item{ display:flex; align-items:center; gap:8px; font-size:10.5px; color:var(--lp-fg-25); }
.ft-active .ft-nav-item{ animation:ftFadeUp .45s ease both; }
.ft-nav-dot{ width:6px; height:6px; border-radius:50%; background:var(--lp-fg-15); flex-shrink:0; }
.ft-nav-on{ color:var(--lp-fg-55); }
.ft-nav-on .ft-nav-dot{ background:var(--acc); box-shadow:0 0 8px var(--acc); }
.ft-active .ft-nav-on .ft-nav-dot{ animation:ftPulse 1.6s ease-in-out 1s infinite; }
.ft-sub{ font-size:11px; font-weight:700; color:var(--lp-fg); border-bottom:1px solid var(--lp-border); padding-bottom:7px; margin-bottom:10px; }
.ft-lines{ display:flex; flex-direction:column; gap:7px; flex:1; }
.ft-line{ display:block; height:5px; border-radius:99px; background:var(--lp-fg-08); transform-origin:left; }
.ft-active .ft-line{ animation:ftType .5s cubic-bezier(0.16,1,0.3,1) both; }
.ft-cta{ margin-top:auto; border-radius:10px; padding:9px; text-align:center; font-size:10.5px; font-weight:600; background:var(--lp-fg-05); border:1px solid var(--lp-border); color:var(--lp-fg-40); }

/* ── 03 MedVoice ─────────────────────────────────────────────────────────── */
.ft-medvoice .ft-screen{ }
.ft-mv-head{ display:flex; align-items:center; gap:7px; font-family:var(--font-geist-mono); font-size:8.5px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--acc); }
.ft-mv-dot{ width:6px; height:6px; border-radius:50%; background:color-mix(in srgb,var(--acc) 40%,transparent); }
.ft-active .ft-mv-dot{ background:var(--acc); box-shadow:0 0 6px var(--acc); animation:mhs-ap-bar-bob 1.4s ease-in-out infinite; }
.ft-continuo{ display:inline-flex; align-items:center; gap:5px; font-family:var(--font-geist-mono); font-size:8px; font-weight:700; letter-spacing:.08em; padding:3px 7px; border-radius:99px; border:1px solid color-mix(in srgb,var(--acc) 55%,transparent); background:color-mix(in srgb,var(--acc) 18%,transparent); color:var(--acc); }
.ft-continuo-dot{ width:5px; height:5px; border-radius:50%; background:var(--acc); box-shadow:0 0 6px var(--acc); }
.ft-wave{ display:flex; align-items:center; gap:2px; height:54px; }
.ft-bar{ flex:1; border-radius:2px; background:color-mix(in srgb,var(--acc) 22%,var(--lp-fg-08)); }
.ft-active .ft-bar{ animation:mhs-ap-bar-bob 1.4s ease-in-out infinite; }
.ft-active .ft-bar:nth-child(-n+15){ background:linear-gradient(180deg,color-mix(in srgb,var(--acc) 60%,white) 0%,var(--acc) 100%); }
.ft-bar:nth-child(-n+15){ background:color-mix(in srgb,var(--acc) 45%,var(--lp-fg-08)); }
.ft-mv-prog{ display:block; height:100%; border-radius:99px; background:var(--acc); width:49%; }
.ft-active .ft-mv-prog{ animation:ftMvProg 7s linear both; }
.ft-mv-controls{ display:flex; align-items:center; justify-content:center; gap:14px; margin:16px 0 6px; }
.ft-mv-skip{ font-size:15px; color:var(--lp-fg-25); }
.ft-mv-15{ font-family:var(--font-geist-mono); font-size:8.5px; font-weight:700; color:var(--acc); }
.ft-mv-play{
  position:relative; width:46px; height:46px; border-radius:50%; border:none; cursor:default;
  background:linear-gradient(135deg,var(--acc) 0%,color-mix(in srgb,var(--acc) 65%,white) 100%);
  color:#fff; display:flex; align-items:center; justify-content:center; font-size:13px;
  box-shadow:0 6px 18px color-mix(in srgb,var(--acc) 50%,transparent);
}
.ft-ico-pause{ display:none; }
.ft-active .ft-mv-play{ animation:mhs-ap-pulse-ring 1.8s ease-out infinite; }
.ft-active .ft-ico-play{ display:none; }
.ft-active .ft-ico-pause{ display:inline; }
.ft-tags{ display:flex; flex-wrap:wrap; gap:5px; margin-top:auto; }
.ft-tag{ font-family:var(--font-geist-mono); font-size:8.5px; padding:2px 7px; border-radius:6px; background:var(--lp-fg-05); border:1px solid var(--lp-border); color:var(--lp-fg-25); }

/* ── 04 Fórmula ──────────────────────────────────────────────────────────── */
.ft-crumb{ display:flex; align-items:center; gap:6px; font-family:var(--font-geist-mono); font-size:9px; color:var(--lp-fg-25); margin-bottom:14px; }
.ft-crumb-sep{ color:var(--lp-fg-15); }
.ft-tips{ display:flex; flex-direction:column; gap:9px; }
.ft-tip{ border-radius:11px; padding:11px 12px; background:var(--lp-fg-05); border:1px solid var(--lp-border); }
.ft-active .ft-tip{ animation:ftFadeUp .5s cubic-bezier(0.16,1,0.3,1) both; }
.ft-tip-tag{ position:relative; overflow:hidden; display:inline-block; font-family:var(--font-geist-mono); font-size:8.5px; font-weight:700; letter-spacing:.18em; margin-bottom:5px; }
.ft-tip-sweep{ position:absolute; inset:0; background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,0.55) 50%,transparent 70%); transform:translateX(-120%); }
.ft-active .ft-tip-sweep{ animation:ftSweep .9s ease both; }
.ft-tip-text{ font-size:10.5px; line-height:1.5; color:var(--lp-fg-55); }
.ft-formula-foot{ margin-top:auto; font-family:var(--font-geist-mono); font-size:8.5px; color:var(--lp-fg-25); padding-top:12px; }

/* ── 05 Audiocards ───────────────────────────────────────────────────────── */
.ft-ac-stage{ position:relative; flex:1; margin-bottom:12px; }
.ft-ac-front,.ft-ac-back{
  position:absolute; inset:0; border-radius:16px; padding:16px;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  text-align:center; gap:9px; backface-visibility:hidden;
}
.ft-ac-front{ background:var(--lp-fg-05); border:1px solid var(--lp-border); }
.ft-ac-back{ background:color-mix(in srgb,var(--acc) 8%,var(--lp-alt)); border:1px solid color-mix(in srgb,var(--acc) 30%,transparent); opacity:0; transform:perspective(700px) rotateY(90deg); }
.ft-ac-q{ font-size:12px; font-weight:600; line-height:1.45; color:var(--lp-fg); }
.ft-ac-a{ font-size:10.5px; line-height:1.5; color:var(--lp-fg-55); }
.ft-ac-a b{ color:var(--acc); }
.ft-ac-play{ width:36px; height:36px; border-radius:50%; background:var(--acc); color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; box-shadow:0 0 16px color-mix(in srgb,var(--acc) 55%,transparent); }
.ft-ac-hint{ font-size:9px; color:var(--lp-fg-25); }
.ft-active .ft-ac-front{ animation:ftCardOut .6s ease 1.1s both; }
.ft-active .ft-ac-back{ animation:ftCardIn .6s ease 1.1s both; }
.ft-active .ft-ac-play{ animation:ftPulse 1s ease-in-out .2s 1; }
.ft-ac-buttons{ display:flex; gap:8px; }
.ft-ac-btn{ flex:1; border-radius:11px; padding:9px; text-align:center; font-size:10.5px; font-weight:600; }
.ft-ac-errei{ background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); color:#f87171; }
.ft-ac-acertei{ background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25); color:#4ade80; }
.ft-active .ft-ac-acertei{ animation:ftHighlight .5s ease 1.9s both; }

/* ── Keyframes ───────────────────────────────────────────────────────────── */
@keyframes ftFadeUp{ from{ opacity:0; transform:translateY(7px); } to{ opacity:1; transform:translateY(0); } }
@keyframes ftReveal{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:translateY(0); } }
@keyframes ftFadeFace{ from{ opacity:0; } to{ opacity:1; } }
@keyframes ftQuizProg{ from{ width:16%; } to{ width:25%; } }
@keyframes ftType{ from{ transform:scaleX(0); opacity:.4; } to{ transform:scaleX(1); opacity:1; } }
@keyframes ftCorrect{ to{ background:color-mix(in srgb,#22c55e 16%,transparent); border-color:color-mix(in srgb,#22c55e 60%,transparent); } }
@keyframes ftCorrectText{ to{ color:#22c55e; } }
@keyframes ftPop{ 0%{ opacity:0; transform:scale(0.4); } 70%{ transform:scale(1.25); } 100%{ opacity:1; transform:scale(1); } }
@keyframes ftPulse{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.12); } }
@keyframes ftCursorQuiz{
  0%{ opacity:0; left:150px; top:185px; transform:scale(1); }
  18%{ opacity:1; }
  55%{ left:36px; top:150px; transform:scale(1); }
  68%{ transform:scale(0.7); }
  80%{ transform:scale(1); }
  100%{ opacity:0; left:36px; top:150px; }
}
@keyframes ftMvProg{ from{ width:18%; } to{ width:82%; } }
@keyframes ftSweep{ from{ transform:translateX(-120%); } to{ transform:translateX(120%); } }
@keyframes ftCardOut{ 0%{ opacity:1; transform:perspective(700px) rotateY(0deg); } 45%{ opacity:1; } 50%{ opacity:0; transform:perspective(700px) rotateY(-90deg); } 100%{ opacity:0; transform:perspective(700px) rotateY(-90deg); } }
@keyframes ftCardIn{ 0%{ opacity:0; transform:perspective(700px) rotateY(90deg); } 50%{ opacity:0; transform:perspective(700px) rotateY(90deg); } 100%{ opacity:1; transform:perspective(700px) rotateY(0deg); } }
@keyframes ftHighlight{ 0%{ box-shadow:0 0 0 0 rgba(34,197,94,0.5); } 100%{ box-shadow:0 0 0 4px rgba(34,197,94,0); } }

@media (prefers-reduced-motion:reduce){
  .ft-active *{ animation:none !important; }
  .ft-check,.ft-feedback,.ft-ac-back{ opacity:1 !important; transform:none !important; }
}
`;
