"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";

/* ════════════════════════════════════════════════════════════════════════════
   Desktop showcase — a large screenshot slider that answers "what does it
   actually look like on a computer?". The rest of the landing shows the app
   in-hand (portrait phone shots); this is the one place we show the full
   desktop experience, one real screen at a time. Minimal rounded-card framing
   (no browser/laptop chrome), a caption per slide, manual navigation only.

   Mechanics cloned from memorecards-carousel: native CSS scroll-snap is the
   primary control (touch swipe), arrows drive desktop click-through, dots
   indicate position, and the active index follows the real scroll position so
   swipe + buttons + caption stay in sync. Screenshots captured at 1731×1083
   (16:10), dark mode, from a seeded demo account ("João").
   ════════════════════════════════════════════════════════════════════════════ */

// `id` is the stable slug used for the per-slide site_content keys
// (`showcase.<id>.title` / `showcase.<id>.caption`) so each caption is editable
// in the front-page visual editor. `title`/`caption` are the seeded fallbacks.
type Shot = { id: string; src: string; title: string; caption: string };

const SHOTS: Shot[] = [
  {
    id: "painel",
    src: "/landing/desktop/painel.webp",
    title: "Seu painel de estudos",
    caption: "Contagem regressiva, plano do dia e todo o seu progresso em uma só tela.",
  },
  {
    id: "questoes",
    src: "/landing/desktop/questoes.webp",
    title: "Questões comentadas",
    caption: "Provas do Revalida com gabarito, comentário completo e o “pega” de cada questão.",
  },
  {
    id: "resumos",
    src: "/landing/desktop/resumos.webp",
    title: "Resumos narrativos",
    caption: "Clínica em cena: o que mais cai, contado como história para fixar de verdade.",
  },
  {
    id: "medvoice",
    src: "/landing/desktop/medvoice.webp",
    title: "MedVoice — a clínica fala",
    caption: "Áudios por tema com transcrição sincronizada, para estudar no seu ritmo.",
  },
  {
    id: "especialidade",
    src: "/landing/desktop/especialidade.webp",
    title: "Tudo por especialidade",
    caption: "Questões, resumos, áudios e flashcards de cada área, reunidos em um só lugar.",
  },
  {
    id: "relatorio",
    src: "/landing/desktop/relatorio.webp",
    title: "Relatório de desempenho",
    caption: "Acertos, sequência, mapa de atividade e seus pontos fracos por especialidade.",
  },
  {
    id: "medhelp-60d",
    src: "/landing/desktop/medhelp-60d.webp",
    title: "MedHelp 60D",
    caption: "O módulo intensivo que abre nos últimos 60 dias antes da prova.",
  },
];

export function DesktopShowcase() {
  const ref = useReveal(0.1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [hintGone, setHintGone] = useState(false);
  const total = SHOTS.length;

  const goTo = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(total - 1, i));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
      setHintGone(true);
    },
    [total],
  );

  // Active index follows the actual scroll position, so swipe and buttons stay
  // in sync. Rounding to the nearest page is enough with scroll-snap.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.max(0, Math.min(total - 1, i));
    setIdx((prev) => (prev === clamped ? prev : clamped));
    if (el.scrollLeft > 4) setHintGone(true);
  }, [total]);

  const active = SHOTS[idx];

  return (
    <section
      className="relative overflow-hidden px-5 py-24 md:px-8 md:py-32"
      style={{ background: "var(--lp-base)" }}
    >
      {/* Ambient "lit stage" — a brand seam, a top spotlight + soft floor glow
          that make the product read as premium without adding any information. */}
      <div aria-hidden className="dsk-seam" />
      <div aria-hidden className="dsk-atmos" />

      <div ref={ref} className="lp-reveal relative z-10 mx-auto max-w-5xl">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div
            className="mb-5 flex items-center justify-center gap-3 text-sm uppercase tracking-[0.25em]"
            style={{ fontFamily: "var(--font-geist-mono)", color: "var(--brand)" }}
          >
            <span aria-hidden className="dsk-rule hidden sm:block" />
            <SiteText as="span" k="showcase.eyebrow" fallback="Por dentro da plataforma" />
            <span aria-hidden className="dsk-rule dsk-rule-flip hidden sm:block" />
          </div>
          <h2
            className="dsk-headline text-[clamp(1.9rem,4.4vw,3.2rem)] font-black leading-[1.08] tracking-[-0.025em]"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            <SiteText as="span" multiline k="showcase.headline" fallback="Feito para o computador também." />
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--lp-fg-40)" }}>
            <SiteText
              as="span"
              multiline
              k="showcase.body"
              fallback="Você já viu no celular. Na tela grande, cada recurso ganha espaço — questões comentadas, áudios com transcrição, relatórios e o módulo dos últimos 60 dias. Veja como é estudar por dentro."
            />
          </p>
        </div>

        {/* Slider */}
        <div className="relative mt-12 sm:mt-14">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            tabIndex={0}
            role="group"
            aria-roledescription="carrossel"
            aria-label="Telas do MedHelpSpace no computador — deslize para navegar"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                goTo(idx + 1);
              }
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                goTo(idx - 1);
              }
            }}
            className="flex snap-x snap-mandatory overflow-x-auto rounded-[16px] outline-none [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-[var(--brand)] [&::-webkit-scrollbar]:hidden"
          >
            {SHOTS.map((shot) => (
              <div key={shot.src} className="w-full flex-shrink-0 snap-center">
                <div className="dsk-frame overflow-hidden rounded-[16px] sm:rounded-[20px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot.src}
                    alt={`MedHelpSpace no computador — ${shot.title}`}
                    width={1731}
                    height={1083}
                    draggable={false}
                    loading="lazy"
                    className="block w-full"
                    style={{ aspectRatio: "1731 / 1083", objectFit: "cover", objectPosition: "top" }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Prev / Next — overlaid on the slide edges, vertically centred, so
              navigation stays reachable even when a tall slide fills a short laptop
              viewport (a control row below the image would sit under the fold).
              Disabled at the ends fade out; swipe still reaches them. */}
          <button
            type="button"
            onClick={() => goTo(idx - 1)}
            disabled={idx === 0}
            aria-label="Tela anterior"
            className="dsk-arrow absolute left-2 top-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full md:left-4 md:h-12 md:w-12"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(idx + 1)}
            disabled={idx === total - 1}
            aria-label="Próxima tela"
            className="dsk-arrow absolute right-2 top-1/2 z-10 flex h-11 w-11 items-center justify-center rounded-full md:right-4 md:h-12 md:w-12"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Swipe hint — fades on first interaction */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white transition-opacity duration-500 md:hidden"
            style={{ background: "rgba(0,0,0,0.55)", opacity: hintGone ? 0 : 1 }}
          >
            deslize
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>

        {/* Caption for the active slide — editable per slide via the front-page
            visual editor (keys `showcase.<id>.title` / `.caption`). Fixed
            min-height avoids layout shift as captions change length. */}
        <div className="mx-auto mt-7 flex min-h-[86px] max-w-xl flex-col items-center text-center sm:min-h-[76px]">
          <SiteText
            as="div"
            k={`showcase.${active.id}.title`}
            fallback={active.title}
            className="dsk-cap-title text-lg font-bold tracking-[-0.01em]"
          />
          <SiteText
            as="div"
            multiline
            k={`showcase.${active.id}.caption`}
            fallback={active.caption}
            className="dsk-cap-body mt-1.5 text-sm leading-relaxed sm:text-[15px]"
          />
        </div>

        {/* Position indicator — navigation lives on the slide (overlay arrows) and
            via swipe / arrow keys; these dots only show where you are. */}
        <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
          {SHOTS.map((shot, i) => (
            <span
              key={shot.src}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: i === idx ? 22 : 8,
                background: i === idx ? "var(--brand)" : "var(--lp-fg-25)",
                boxShadow: i === idx ? "0 0 10px color-mix(in srgb, var(--brand) 65%, transparent)" : "none",
              }}
            />
          ))}
        </div>
      </div>

      <style>{DSK_CSS}</style>
    </section>
  );
}

/* "Lit stage" atmosphere + refined framing. Restraint is the point: the
   screenshots carry the information, so every added element is low-alpha
   ambience — a top spotlight, a soft floor glow, a gradient seam and hairline
   frame — that makes the product read as premium without competing for the eye. */
const DSK_CSS = `
/* Top seam — a thin brand-lit line marking the section edge (replaces a flat border). */
.dsk-seam{
  position:absolute; top:0; left:0; right:0; height:1px; z-index:1; pointer-events:none;
  background:linear-gradient(90deg, transparent 6%,
    color-mix(in srgb, var(--brand) 34%, var(--lp-border)) 50%, transparent 94%);
}

/* Stage lighting — a tight spotlight behind the headline and a broad soft glow
   behind the slider, so the whole panel reads as lit BY the product. Static. */
.dsk-atmos{
  position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden;
  background:
    radial-gradient(56% 40% at 50% 1%, color-mix(in srgb, var(--brand) 12%, transparent), transparent 60%),
    radial-gradient(92% 62% at 50% 60%, color-mix(in srgb, var(--brand) 6%, transparent), transparent 72%);
}

/* Whisper-gradient headline — pure white cooling to a faint lavender at the feet
   of the letters. Subtle luxury, not a colour statement. */
.dsk-headline{
  background:linear-gradient(176deg, var(--lp-fg) 44%, color-mix(in srgb, var(--brand) 42%, var(--lp-fg)) 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}

/* Eyebrow flanking rules — a hairline that fades into the label on each side. */
.dsk-rule{
  height:1px; width:clamp(20px,5vw,46px);
  background:linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand) 60%, transparent));
}
.dsk-rule-flip{ transform:scaleX(-1); }

/* The screenshot frame: a gradient hairline (light top-left → brand → subtle)
   over a deep brand-tinted lift + shadow, no device chrome. */
.dsk-frame{
  position:relative;
  background:var(--lp-alt);
  box-shadow:
    0 1px 0 0 color-mix(in srgb, var(--lp-fg) 7%, transparent) inset,
    0 50px 100px -55px color-mix(in srgb, var(--brand) 46%, transparent),
    0 24px 60px -42px rgba(0,0,0,0.78);
}
.dsk-frame::before{
  content:""; position:absolute; inset:0; border-radius:inherit; padding:1px; z-index:3;
  background:linear-gradient(150deg,
    color-mix(in srgb, var(--lp-fg) 24%, transparent) 0%,
    color-mix(in srgb, var(--brand) 32%, transparent) 32%,
    var(--lp-border) 64%);
  -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude;
  pointer-events:none;
}

/* Overlay nav arrows — dark-glass discs on the slide edges. Legible over any
   screenshot, and always reachable when the slide is visible (unlike a control
   row below the image, which falls under the fold on short laptop screens). */
.dsk-arrow{
  transform:translateY(-50%);
  color:var(--lp-fg);
  background:color-mix(in srgb, #05060a 58%, transparent);
  border:1px solid color-mix(in srgb, var(--lp-fg) 15%, transparent);
  -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px);
  box-shadow:0 10px 30px -14px rgba(0,0,0,0.85);
  transition:opacity .25s ease, border-color .2s ease, background .2s ease, box-shadow .2s ease;
}
.dsk-arrow:hover{
  border-color:color-mix(in srgb, var(--brand) 55%, transparent);
  background:color-mix(in srgb, #05060a 70%, transparent);
  box-shadow:0 10px 30px -14px rgba(0,0,0,0.85), 0 0 22px -6px color-mix(in srgb, var(--brand) 50%, transparent);
}
.dsk-arrow:active{ transform:translateY(-50%) scale(.94); }
.dsk-arrow:focus-visible{ outline:2px solid var(--brand); outline-offset:2px; }
.dsk-arrow:disabled{ opacity:0; pointer-events:none; }

/* Slide caption (SiteText carries only className, so the font/colour live here). */
.dsk-cap-title{ font-family:var(--font-bricolage); color:var(--lp-fg); }
.dsk-cap-body{ color:var(--lp-fg-40); }
`;
