"use client";

import type { PlanPreview } from "@/lib/magnet/plan-preview";
import type { MagnetFlashcard } from "@/lib/magnet/flashcards";
import { MagnetFlashcards } from "@/components/magnet/magnet-flashcards";

// The post-confirm REWARD — the gated payoff of the verify-to-claim flow. Rendered
// in two places from the SAME component so they never drift:
//   • inline on the results view once the 6-digit code is confirmed, and
//   • on the durable /simulado-honesto/resultado page (email links land here).
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
  showDeliveredNote = false,
}: {
  score: number;
  plan: PlanPreview | null;
  sampleCards: MagnetFlashcard[];
  email: string;
  utm: MagnetRewardUtm;
  cohort: string;
  /** Inline (post-verify) shows "enviamos para seu e-mail"; the durable page hides it. */
  showDeliveredNote?: boolean;
}) {
  const pct = Math.round((score / 15) * 100);
  const weak = plan?.weakSpecialties ?? [];
  const weakNames = weak.map((w) => w.name).join(", ");
  const days = plan?.daysToExam ?? null;
  const isReta = cohort === "revalida-2026-2"; // near-term cohort gets the discount

  const checkoutHref = (() => {
    const p = new URLSearchParams({
      cohort,
      email,
      utm_source: utm.source ?? "magnet",
      utm_medium: utm.medium ?? "site",
      utm_campaign: utm.campaign ?? "simulado-honesto",
    });
    if (isReta) p.set("cupom", "RETA2026"); // 2027.1 = full price, no coupon
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

      {/* Cost-of-failing receipt */}
      <div className="rounded-2xl border border-border bg-surface-1 p-6 text-sm">
        <h3 className="font-bold">A conta que ninguém te mostra</h3>
        <ul className="mt-3 space-y-1.5 text-muted-foreground">
          <li>• A taxa da 1ª etapa já custou <strong className="text-foreground">R$410</strong>.</li>
          <li>• A prova custa <strong className="text-foreground">R$4.516</strong> em taxas.</li>
          <li>
            • Reprovar e refazer a 2ª fase: <strong className="text-foreground">+~R$4.106</strong> —
            e mais um ano sem poder exercer.
          </li>
        </ul>
        <p className="mt-3">
          O método completo da 1ª etapa custa <strong className="text-foreground">R$3.990</strong> —
          menos do que custa reprovar uma vez.
        </p>
      </div>

      {/* Offer */}
      <div className="rounded-2xl border border-brand/30 bg-brand-muted p-6">
        <h3 className="text-lg font-bold tracking-tight">Continue sua revisão até a prova</h3>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>✓ Questões reais comentadas das 12 especialidades</li>
          <li>✓ Flashcards com revisão espaçada nos seus pontos fracos</li>
          <li>✓ Áudio-aulas MedVoice + plano de estudo personalizado</li>
        </ul>
        {isReta ? (
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground line-through">R$3.990</span>
            <span className="text-2xl font-bold text-brand">R$3.290</span>
            <span className="text-xs text-muted-foreground">em 12x ou Pix · reta final</span>
          </div>
        ) : (
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand">R$4.990</span>
            <span className="text-xs text-muted-foreground">
              em 12x ou Pix · comece no seu ritmo
            </span>
          </div>
        )}
        <a
          href={checkoutHref}
          className="mt-4 block rounded-lg bg-brand px-5 py-3 text-center text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          {isReta ? "Desbloquear meu plano completo →" : "Quero começar agora →"}
        </a>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          7 dias de garantia incondicional. Sem pegadinha.
        </p>
      </div>
    </div>
  );
}
