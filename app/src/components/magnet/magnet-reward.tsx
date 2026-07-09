"use client";

import type { PlanPreview } from "@/lib/magnet/plan-preview";
import type { MagnetFlashcard } from "@/lib/magnet/flashcards";
import { MagnetFlashcards } from "@/components/magnet/magnet-flashcards";
import { PlatformPeek } from "@/components/magnet/platform-peek";
import { WELCOME_COUPONS } from "@/lib/magnet/links";
import { trackLeadEvent } from "@/actions/magnet";

// Live storefront pricing for the turma, threaded from the server so the offer
// block never shows a stale/hardcoded number (or, worse, a promo price ABOVE the
// public price). Minimal serializable shape — mirrors CohortProduct's two fields.
export type RewardOffer = {
  priceCents: number;
  compareAtPriceCents: number | null;
};

// Brazilian currency, matching lib/queries/cohort-products.ts formatBRL (that one
// is server-only). "R$ 3.990" / "R$ 2.840,50".
function fmtBRL(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// The post-confirm REWARD — the gated payoff of the verify-to-claim flow. Rendered
// in two places from the SAME component so they never drift:
//   • inline on the results view once the 6-digit code is confirmed, and
//   • on the durable /questoes-revalida/resultado page (email links land here).
// FREE-FUNNEL-V2-SCOPE.md Groups 4 + 3. score card + stakes + interactive
// flashcard demo (with SM-2 spacing viz) + personalized plan + cost receipt +
// offer + immediate buy path.

export type MagnetRewardUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

// Adaptive, non-judgmental framing (item 3 / trust polish [3]): a low score is a
// starting point, a high score still has easy points to lose. Never a verdict.
export function scoreFraming(score: number): string {
  if (score <= 5)
    return "Isso é um começo, não um veredito — e é exatamente por isso que um plano nas matérias certas muda o jogo.";
  if (score <= 10)
    return "Você já tem base. O que separa você da aprovação são os pontos que dá pra recuperar com revisão dirigida.";
  return "Bom resultado — agora o risco é perder ponto bobo. O método fecha as brechas que ainda custam caro.";
}

export function MagnetReward({
  score,
  plan,
  sampleCards,
  email,
  utm,
  cohort,
  offer = null,
  showDeliveredNote = false,
  token = null,
}: {
  score: number;
  plan: PlanPreview | null;
  sampleCards: MagnetFlashcard[];
  email: string;
  utm: MagnetRewardUtm;
  cohort: string;
  /** Live storefront price for this turma (null → offer block omits the price line). */
  offer?: RewardOffer | null;
  /** Inline (post-verify) shows "enviamos para seu e-mail"; the durable page hides it. */
  showDeliveredNote?: boolean;
  /** Lead's result_token — enables per-lead tracking of the "ver recursos" click. */
  token?: string | null;
}) {
  const pct = Math.round((score / 15) * 100);
  const weak = plan?.weakSpecialties ?? [];
  const weakNames = weak.map((w) => w.name).join(", ");
  const days = plan?.daysToExam ?? null;
  const isReta = cohort === "revalida-2026-2"; // drives the 13/09 date framing only

  // The small welcome discount for this turma (5% on 2026-2, 10% on 2027.1). The
  // code is auto-applied at checkout; the percent is computed off the LIVE price so
  // the display can never undercut or exceed the public storefront number. Discount
  // math mirrors the redeem_coupon RPC exactly (integer division) → same final cent.
  const welcome = WELCOME_COUPONS[cohort] ?? null;
  const effCents = offer?.priceCents ?? null;
  const baseCents = offer?.compareAtPriceCents ?? effCents;
  const discountCents =
    welcome && effCents != null ? Math.floor((effCents * welcome.percent) / 100) : 0;
  const finalCents = effCents != null ? effCents - discountCents : null;
  const showStrike = baseCents != null && finalCents != null && baseCents > finalCents;

  const checkoutHref = (() => {
    const p = new URLSearchParams({
      cohort,
      email,
      utm_source: utm.source ?? "magnet",
      utm_medium: utm.medium ?? "site",
      utm_campaign: utm.campaign ?? "questoes-revalida",
    });
    if (welcome) p.set("cupom", welcome.code);
    return `/checkout?${p.toString()}`;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Score + adaptive, non-judgmental diagnostic */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6 text-center">
        <div className="text-5xl font-bold tabular-nums text-brand">
          {score}
          <span className="text-2xl font-normal text-muted-foreground">/15</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">acertos ({pct}%)</div>
        <div className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
          {scoreFraming(score)}
        </p>
      </div>

      {showDeliveredNote && (
        <p className="rounded-xl border border-brand/20 bg-brand-muted/40 px-4 py-3 text-center text-sm text-foreground">
          ✓ Enviamos tudo isto para o seu e-mail também — você pode voltar quando quiser.
        </p>
      )}

      {/* Stakes */}
      {days != null && (
        <p className="text-center text-sm font-medium">
          {isReta ? (
            <>
              Faltam <span className="text-brand">{days} dias</span> para a 1ª etapa (13/09). O
              que falta não é esforço — é método.
            </>
          ) : (
            <>
              Você tem <span className="text-brand">{days} dias</span> até a prova — tempo de
              sobra para construir uma base sólida, no seu ritmo.
            </>
          )}
        </p>
      )}

      {/* Flashcard demo — the interactive taste on the lead's weak specialties, with
          the truthful SM-2 spacing ladder. */}
      {sampleCards.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface-1 p-6">
          <h3 className="text-lg font-bold tracking-tight">
            Não basta reler — você precisa recordar
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {weakNames ? (
              <>Experimente agora, com {weakNames}. Vire o card e responda se você lembrou.</>
            ) : (
              <>Experimente agora. Vire o card e responda se você lembrou.</>
            )}
          </p>
          <div className="mt-4">
            <MagnetFlashcards
              cards={sampleCards}
              compact
              spacingViz
              doneTitle="É exatamente assim no método completo."
              doneNote="O baralho completo já está no seu e-mail."
              ctaHref="/flashcards-gratis"
              ctaLabel="Abrir o baralho grátis →"
            />
          </div>
        </div>
      )}

      {/* Personalized plan — first items visible, remainder blurred behind the offer */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6">
        <h3 className="text-lg font-bold tracking-tight">
          Seu plano de estudos até {isReta ? "13/09" : "a sua prova"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Montado a partir do seu resultado{weakNames ? <>, priorizando {weakNames}</> : null}.
        </p>

        <div className="mt-4 space-y-2">
          {(plan?.visibleItems ?? []).map((it, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
            >
              <span className="mt-0.5 text-brand">●</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{it.title}</div>
                <div className="truncate text-xs text-muted-foreground">{it.subtitle}</div>
              </div>
            </div>
          ))}

          {plan && plan.lockedCount > 0 && (
            <div className="relative overflow-hidden rounded-lg border border-border">
              <div className="space-y-2 p-3 blur-[5px]" aria-hidden>
                {Array.from({ length: Math.min(3, plan.lockedCount) }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-brand">●</span>
                    <div className="h-3 w-2/3 rounded bg-surface-2" />
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                <span className="text-xs font-semibold text-foreground">
                  + {plan.lockedCount} itens no plano completo
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Por dentro da plataforma — the "look how cool it is" moment delivered at the
          buying decision (ideas 2 + 3): the real desktop screens, inline, no navigation
          away. Reuses the same slider shown in the welcome peek. */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6">
        <h3 className="text-lg font-bold tracking-tight">Por dentro da plataforma</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          É isto que continua te esperando depois do simulado.
        </p>
        <div className="mt-4">
          <PlatformPeek showDeviceToggle />
        </div>
      </div>

      {/* Offer */}
      <div className="rounded-2xl border border-brand/30 bg-brand-muted p-6">
        <h3 className="text-lg font-bold tracking-tight">Continue sua revisão até a prova</h3>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>✓ Questões Revalida comentadas + Simulados no padrão da banca</li>
          <li>✓ Flashcards e AudioCards com revisão espaçada</li>
          <li>✓ MemoreCards + Resumos Narrativos por especialidade</li>
          <li>✓ Fórmula MedHelp + Revalida Up + áudio-aulas MedVoice</li>
          <li>✓ Plano de estudos personalizado até a sua prova</li>
        </ul>
        {finalCents != null ? (
          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            {showStrike && (
              <span className="text-sm text-muted-foreground line-through">
                {fmtBRL(baseCents!)}
              </span>
            )}
            <span className="text-2xl font-bold text-brand">{fmtBRL(finalCents)}</span>
            <span className="text-xs text-muted-foreground">
              em 12x ou Pix
              {welcome ? ` · ${welcome.percent}% de boas-vindas` : " · comece no seu ritmo"}
            </span>
          </div>
        ) : (
          <div className="mt-4 text-sm text-muted-foreground">em 12x ou Pix · no seu ritmo</div>
        )}
        {welcome && (
          <div className="mt-2 rounded-lg border border-brand/30 bg-brand-muted/30 px-3 py-2 text-center text-xs text-foreground">
            Cupom de boas-vindas{" "}
            <span className="font-mono font-bold tracking-widest">{welcome.code}</span> — aplicado
            automaticamente
          </div>
        )}
        <a
          href={checkoutHref}
          className="mt-4 block rounded-lg bg-brand px-5 py-3 text-center text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          {welcome ? "Garantir meu desconto →" : "Quero começar agora →"}
        </a>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          7 dias de garantia incondicional. Sem pegadinha.
        </p>
        {/* Secondary, de-emphasized info path for the not-yet-ready half (mirrors the
            flashcards reward). New tab keeps the offer + coupon alive; homepage top per
            Karina. Per-lead tracking fires only when the token is known (durable page +
            inline post-verify). Distinct utm_source so GA4 splits quiz vs flashcards. */}
        <a
          href="/?utm_source=quiz-reward&utm_medium=funnel&utm_campaign=ver-todos-recursos"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (token) void trackLeadEvent({ token, event: "clicked_ver_recursos" });
          }}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-1 px-5 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-surface-2"
        >
          Ver todos os recursos da plataforma →
        </a>
      </div>
    </div>
  );
}
