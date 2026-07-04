import { SiteText } from "@/components/landing/site-text";

// Payoff preview (idea 3, refined): a compact, illustrative diagram of the loop the
// visitor is about to enter — respond → see the comment instantly → get a plan. It
// uses stylized placeholder bars (NOT fabricated question text or medical claims), so
// it makes the reward concrete without pretending to be a real question. Rendered in
// the welcome step, BELOW the primary CTA, so it reassures scrollers without pushing
// "Começar agora" under the fold.

// A tiny answer mock: three option bars, the correct one lit green with a ✓.
function RespondMock() {
  return (
    <div className="space-y-1" aria-hidden>
      <div className="h-2 rounded-full bg-surface-2" />
      <div className="flex items-center gap-1 rounded-md border border-green-500/60 bg-green-500/10 px-1.5 py-1">
        <span className="text-[9px] leading-none text-green-500">✓</span>
        <div className="h-1.5 flex-1 rounded-full bg-green-500/40" />
      </div>
      <div className="h-2 rounded-full bg-surface-2" />
    </div>
  );
}

// A tiny comment mock: a brand-tinted block with two text bars.
function CommentMock() {
  return (
    <div className="space-y-1 rounded-md border border-brand/20 bg-brand-muted p-1.5" aria-hidden>
      <div className="h-1.5 w-full rounded-full bg-brand/40" />
      <div className="h-1.5 w-4/5 rounded-full bg-brand/25" />
      <div className="h-1.5 w-11/12 rounded-full bg-brand/25" />
    </div>
  );
}

// A tiny plan mock: two plan rows with brand bullets.
function PlanMock() {
  return (
    <div className="space-y-1.5" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-[8px] leading-none text-brand">●</span>
          <div className="h-1.5 flex-1 rounded-full bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  { n: "1", k: "magnet.pp_s1", label: "Você responde", mock: <RespondMock /> },
  { n: "2", k: "magnet.pp_s2", label: "Comentário na hora", mock: <CommentMock /> },
  { n: "3", k: "magnet.pp_s3", label: "Seu plano no final", mock: <PlanMock /> },
];

export function PayoffPreview() {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="grid grid-cols-3 gap-2">
        {STEPS.map((s) => (
          <div key={s.n} className="flex flex-col">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-brand-fg">
                {s.n}
              </span>
              <span className="text-[11px] font-semibold leading-tight text-foreground sm:text-xs">
                <SiteText as="span" k={s.k} fallback={s.label} />
              </span>
            </div>
            <div className="flex-1">{s.mock}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
