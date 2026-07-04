import type { LandingStats } from "@/lib/landing/stats";
import { SiteText } from "@/components/landing/site-text";

// Credibility band for cold paid traffic (idea 2, the honest half): a slim row of
// TRUE, self-updating signals — the live depth of the platform behind the free
// simulado + the fact these are real past-exam questions. No fabricated testimonial
// or invented student count (the brand's whole positioning is "Simulado Honesto").
// Server-rendered in the landing hero so it paints instantly and reinforces trust
// without competing with the primary CTA.

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function TrustStrip({ stats }: { stats: LandingStats }) {
  const chips = [
    { label: `${fmt(stats.questoes)} questões comentadas`, icon: "📝" },
    { label: `${fmt(stats.flashcards)} flashcards`, icon: "🃏" },
    { label: `${stats.especialidades} especialidades`, icon: "🩺" },
    { label: "Provas anteriores do Revalida", icon: "✅" },
  ];

  return (
    <div className="mx-auto mt-6 max-w-2xl">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <SiteText
          as="span"
          k="magnet.trust_label"
          fallback="Por trás do simulado, uma plataforma completa"
        />
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {chips.map((c) => (
          <span
            key={c.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <span aria-hidden className="text-sm leading-none">
              {c.icon}
            </span>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
