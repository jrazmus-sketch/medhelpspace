import Link from "next/link";
import { WordCycle } from "./word-cycle";
import { SpecialtyMosaic } from "./specialty-mosaic";

const CHIPS = [
  { value: "204", label: "simulados" },
  { value: "3.506", label: "flashcards" },
  { value: "12", label: "especialidades" },
  { value: "94", label: "áudios MedVoice" },
  { value: "220+", label: "aulas em texto" },
];

export function HeroSection() {
  return (
    <section className="lp-hero-mesh relative overflow-hidden px-5 pb-20 pt-12 md:px-8 md:pb-28 md:pt-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">

          {/* ── Left column ── */}
          <div className="flex flex-col gap-6">
            {/* Eyebrow */}
            <div
              className="w-fit rounded-full border border-brand/25 bg-brand/8 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand"
              style={{
                animationName: "lp-fade-up",
                animationDuration: "0.6s",
                animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                animationFillMode: "both",
              }}
            >
              Revalida 2026.2 · 2027.1
            </div>

            {/* Headline */}
            <div
              style={{
                animationName: "lp-fade-up",
                animationDuration: "0.7s",
                animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                animationFillMode: "both",
                animationDelay: "80ms",
              }}
            >
              <h1
                className="text-[2.6rem] font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-[3.2rem] md:text-[3.8rem]"
                style={{ fontFamily: "var(--font-bricolage)" }}
              >
                É mais do que um{" "}
                <span className="text-brand">
                  <WordCycle />
                </span>
                .
                <br />
                <span className="text-foreground/90">
                  É um sistema de aprovação.
                </span>
              </h1>
            </div>

            {/* Subtext */}
            <p
              className="max-w-lg text-base leading-relaxed text-foreground/60 sm:text-lg"
              style={{
                animationName: "lp-fade-up",
                animationDuration: "0.7s",
                animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                animationFillMode: "both",
                animationDelay: "160ms",
              }}
            >
              Aqui o foco não é acumular conteúdo — é marcar ponto no Revalida.
              <br />
              Treino do jeito que a prova cobra: raciocínio, pegadinha e conduta na cabeça.
            </p>

            {/* CTAs */}
            <div
              className="flex flex-col gap-3 sm:flex-row"
              style={{
                animationName: "lp-fade-up",
                animationDuration: "0.7s",
                animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                animationFillMode: "both",
                animationDelay: "240ms",
              }}
            >
              <Link
                href="/loja"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-brand/20 transition-all hover:bg-brand/85 hover:shadow-brand/30 hover:-translate-y-0.5 active:scale-95"
              >
                Comprar Agora
                <span aria-hidden>→</span>
              </Link>
              <a
                href="#sistema"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-7 py-3.5 text-base font-semibold text-foreground/70 transition-all hover:border-brand/40 hover:text-foreground hover:bg-accent"
              >
                Ver o sistema
                <span aria-hidden>↓</span>
              </a>
            </div>

            {/* Stat chips */}
            <div
              className="flex flex-wrap gap-2"
              style={{
                animationName: "lp-fade-up",
                animationDuration: "0.7s",
                animationTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                animationFillMode: "both",
                animationDelay: "340ms",
              }}
            >
              {CHIPS.map((chip) => (
                <div
                  key={chip.label}
                  className="rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs font-medium backdrop-blur-sm"
                >
                  <span className="font-bold text-brand">{chip.value}</span>
                  {" "}
                  <span className="text-foreground/50">{chip.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right column: specialty mosaic ── */}
          <div
            className="flex flex-col gap-4"
            style={{
              animationName: "lp-fade-in",
              animationDuration: "0.9s",
              animationTimingFunction: "ease",
              animationFillMode: "both",
              animationDelay: "200ms",
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground/40">
              12 especialidades médicas
            </p>
            <SpecialtyMosaic />
            <p className="text-xs text-foreground/35 leading-relaxed">
              Questões, resumos, flashcards e áudios para cada especialidade —
              organizados pelo jeito que o Revalida cobra.
            </p>
          </div>

        </div>
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
}
