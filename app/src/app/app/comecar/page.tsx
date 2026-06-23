import Link from "next/link";
import { ArrowRight, Compass, RotateCcw } from "lucide-react";
import { requireActiveMembership } from "@/lib/membership-gate";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { TipText } from "@/components/onboarding/tip-text";
import { ResetTipsButton } from "@/components/onboarding/reset-tips-button";
import { TIPS, GUIDE_GROUPS } from "@/lib/onboarding/tips";
import type { Crumb } from "@/lib/breadcrumbs";

export const metadata = { title: "Comece por aqui" };

export default async function ComecarPage() {
  await requireActiveMembership();

  const crumbs: Crumb[] = [{ label: "Início", href: "/app" }, { label: "Comece por aqui" }];

  return (
    <div className="mx-auto max-w-3xl px-[10px] pt-7 pb-16 sm:px-6">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" crumbs={crumbs} />

      {/* ── Header ── */}
      <header className="mb-8">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-brand">
          <Compass className="h-3.5 w-3.5" strokeWidth={2} />
          Comece por aqui
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          <TipText k="onboarding.guide.h1" fallback="Como usar a plataforma" />
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Um tour rápido por tudo que você precisa para começar a estudar hoje. As mesmas dicas
          também aparecem em caixas pelas seções do site — feche cada uma no{" "}
          <span className="font-semibold text-foreground">X</span> quando não precisar mais. Pode
          voltar aqui quando quiser.
        </p>
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
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* ── Footer: replay the inline tips ── */}
      <div className="mt-12 flex flex-col items-start gap-3 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          Quer rever as dicas que já fechou? Reative as caixas e elas voltam a aparecer pelas seções.
        </p>
        <ResetTipsButton />
      </div>
    </div>
  );
}
