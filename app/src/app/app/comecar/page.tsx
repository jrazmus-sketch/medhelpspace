import Link from "next/link";
import { ArrowRight, Lightbulb, RotateCcw } from "lucide-react";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { TipText } from "@/components/onboarding/tip-text";
import { TipStatus, RestoreAllTips } from "@/components/onboarding/tip-status";
import { TIPS, GUIDE_GROUPS, TIP_PLACES } from "@/lib/onboarding/tips";
import type { Crumb } from "@/lib/breadcrumbs";

export const metadata = { title: "Dicas da plataforma" };

export default async function ComecarPage() {
  await requireActiveMembership();

  const crumbs: Crumb[] = [{ label: "Início", href: "/app" }, { label: "Dicas da plataforma" }];

  return (
    <div className="mx-auto max-w-3xl px-[10px] pt-7 pb-16 sm:px-6">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      {/* ── Header ── */}
      <header className="mb-8">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand">
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} />
          Dicas da plataforma
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          <TipText k="onboarding.guide.h1" fallback="Como usar a plataforma" />
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Todas as dicas rápidas da plataforma em um só lugar. Elas também aparecem em caixas nas
          páginas indicadas em cada uma. Feche uma caixa no{" "}
          <span className="font-semibold text-foreground">X</span> quando não precisar mais: aqui você
          consulta o conteúdo a qualquer momento e pode fazer a dica voltar à página de origem.
        </p>
        <div className="mt-4">
          <RestoreAllTips />
        </div>
      </header>

      {/* ── Sections ── */}
      <div className="space-y-10">
        {GUIDE_GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.title}
            </h2>
            <div className="space-y-3">
              {group.keys.map((key) => {
                const tip = TIPS[key];
                return (
                  <article
                    key={key}
                    className="rounded-xl border border-border bg-surface-1 p-4 sm:p-5"
                  >
                    <h3 className="text-[15px] font-semibold leading-snug text-foreground">
                      <TipText k={`onboarding.${key}.title`} fallback={tip.title} />
                    </h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                      <TipText k={`onboarding.${key}.body`} fallback={tip.body} multiline />
                    </p>

                    {tip.section && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="text-[14px] font-semibold leading-snug text-foreground">
                          <TipText k={`onboarding.${key}.${tip.section.field}.title`} fallback={tip.section.title} />
                        </p>
                        <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
                          <TipText k={`onboarding.${key}.${tip.section.field}.body`} fallback={tip.section.body} multiline />
                        </p>
                      </div>
                    )}

                    {tip.reviewNote && (
                      <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand/10 px-3 py-2 text-[12.5px] leading-relaxed text-foreground/85">
                        <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" strokeWidth={2} />
                        <TipText as="span" k={`onboarding.${key}.review`} fallback={tip.reviewNote} multiline />
                      </p>
                    )}

                    {/* Skip "welcome" — its link points back to this very page. */}
                    {tip.href && tip.hrefLabel && key !== "welcome" && (
                      <Link
                        href={tip.href}
                        className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-semibold text-brand transition-opacity hover:opacity-80"
                      >
                        {tip.hrefLabel}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}

                    <TipStatus coachKey={key} place={TIP_PLACES[key]} />
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ── Footer: bring every closed tip back to its page ── */}
      <div className="mt-12 flex flex-col items-start gap-3 border-t border-border pt-6">
        <RestoreAllTips />
      </div>
    </div>
  );
}
