"use client";

import { useReveal } from "@/hooks/use-reveal";
import { SiteText } from "./site-text";

// "Por trás da MedHelpSpace" (Karina 2026-10-09; look 2026-10-12; text v4 2026-10-21) —
// her personal note, read as a quiet pause between the platform tour and the pricing:
// one centred reading column, left-aligned, no photo, no cards. Not all white (her ask):
// the title ends in the page's lilac like the hero headline, her italic passages are
// lilac, a lilac rule runs beside the text and a faint lilac glow sits behind the title.
// v4 replaced every paragraph, so its copy lives under NEW keys (behind.v4_*): the v3
// rows (behind.p1a … p5) are still in site_content and a DB row wins over a fallback.
// The id is the GA4 view_founder_section target.
export const FOUNDER_SECTION_ID = "por-tras";

const LILAC = "var(--brand-text)"; // #c084e8 on the dark sales page — the hero's lilac

/** Her italic passages: lilac italic, inline (wrap a whole paragraph's text in it too). */
function Em({ k, text }: { k: string; text: string }) {
  return (
    <em style={{ color: LILAC }}>
      <SiteText as="span" multiline k={k} fallback={text} />
    </em>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--lp-fg-75)" }}>{children}</p>;
}

export function FounderSection() {
  const ref = useReveal(0.15);

  return (
    <section
      id={FOUNDER_SECTION_ID}
      className="relative isolate scroll-mt-16 overflow-hidden bg-[var(--lp-alt-bg)] px-5 py-20 md:px-8 md:py-28"
    >
      {/* Faint lilac glow behind the title — atmosphere, not a card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 45% at 30% 12%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 70%)",
        }}
      />

      <div ref={ref} className="lp-reveal mx-auto max-w-[38rem]">
        <div aria-hidden className="mb-6 h-[3px] w-12 rounded-full" style={{ background: `linear-gradient(to right, var(--brand), ${LILAC})` }} />

        <h2
          className="text-[clamp(1.9rem,4.4vw,3rem)] font-black leading-[1.08] tracking-[-0.025em]"
          style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
        >
          <SiteText as="span" k="behind.title" fallback="Por trás da" />{" "}
          <span style={{ color: LILAC }}>
            <SiteText as="span" k="behind.title_hl" fallback="MedHelpSpace" />
          </span>
        </h2>

        <p
          className="mt-8 text-xl font-semibold leading-snug md:text-[1.375rem]"
          style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
        >
          <SiteText as="span" multiline k="behind.lead" fallback="Sou Karina, médica formada na Argentina e fundadora da MedHelpSpace." />
        </p>

        {/* Reading column with a lilac rule down its left edge. */}
        <div className="relative mt-8 space-y-6 pl-5 text-left text-[1.0625rem] leading-[1.75] md:pl-7 md:text-lg md:leading-[1.8]">
          <div
            aria-hidden
            className="absolute bottom-1 left-0 top-1 w-[2px] rounded-full"
            style={{ background: `linear-gradient(to bottom, ${LILAC}, color-mix(in srgb, var(--brand) 55%, transparent) 55%, transparent)` }}
          />
          <Para>
            <SiteText as="span" multiline k="behind.v4_p1" fallback="Durante meus anos de estudo, também passei por erros e acertos. Levei tempo para compreender que estudar muitas horas não significa necessariamente aprender melhor. Aprendi a importância de estudar de forma ativa, conectar informações e voltar ao que ainda não havia compreendido." />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.v4_p2" fallback="Mais tarde, ao conhecer de perto diferentes cursos e materiais de preparação para o Revalida, senti falta de algo que, para mim, era essencial: uma experiência de estudo realmente conectada à maneira como o INEP cobra o conhecimento médico." />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.v4_p3a" fallback="Foi então que comecei a me fazer uma pergunta:" />{" "}
            <Em k="behind.v4_p3_em" text="e se, em vez de partir de uma sequência de aulas, a preparação começasse pelas próprias provas?" />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.v4_p4" fallback="Dessa pergunta nasceu a MedHelpSpace." />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.v4_p5" fallback="Meu trabalho começa pela análise das questões do Revalida. Observo como os temas reaparecem ao longo dos anos, como as pistas mudam e quais informações são decisivas para chegar à resposta. Essa análise orienta a organização dos conteúdos e a forma como eles se conectam." />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.v4_p6" fallback="Quis reunir diferentes maneiras de estudar um mesmo assunto, permitindo que questões, revisões, recursos visuais e áudios se complementassem. Não para preencher horas com mais material, mas para que cada etapa do estudo tivesse um propósito." />
          </Para>
          <Para>
            <Em k="behind.v4_p7_em" text="Meu objetivo foi criar a experiência de preparação que eu gostaria de ter encontrado: uma plataforma construída a partir da prova, com atenção ao raciocínio, à revisão e ao tempo de quem estuda." />
          </Para>
          <Para>
            <SiteText as="span" multiline k="behind.v4_p8" fallback="Sei que o Revalida representa muito mais do que uma avaliação. Por trás de cada candidato existe uma trajetória, um esforço e um projeto de vida." />
          </Para>
          <Para>
            <Em k="behind.v4_p9_em" text="É com respeito a tudo isso que conduzo a MedHelpSpace, com o cuidado e a responsabilidade que essa etapa da sua trajetória merece." />
          </Para>
        </div>

        {/* Signature */}
        <div className="mt-12">
          <div aria-hidden className="mb-5 h-px w-16" style={{ background: `linear-gradient(to right, ${LILAC}, transparent)` }} />
          <div
            className="text-xl font-bold tracking-[-0.01em] md:text-2xl"
            style={{ fontFamily: "var(--font-bricolage)", color: "var(--lp-fg)" }}
          >
            <em>
              <SiteText as="span" k="behind.sign_name" fallback="Karina Razmus" />
            </em>
          </div>
          <div className="mt-1 text-[0.9375rem] font-medium" style={{ color: LILAC }}>
            <SiteText as="span" k="behind.sign_role" fallback="Fundadora da MedHelpSpace" />
          </div>
        </div>
      </div>
    </section>
  );
}
