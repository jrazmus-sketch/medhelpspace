// Gmail files most of our funnel mail under the Promotions tab, where candidates
// simply never look — they report "o e-mail não chegou" while it sits there. Every
// screen that says "we've emailed you" shows this note when the address is Gmail,
// telling them where it actually landed AND how to stop it happening again.
//
// Shown ONLY for Gmail: on any other provider it would be noise, and worse, it
// would send someone hunting for a tab their client does not have.
//
// Deliberately NOT a spam warning. Promotions is not spam — the mail was delivered
// and accepted; it is filed. Saying "check your spam folder" to a Gmail user sends
// them to the wrong place.

import { isGmailAddress } from "@/lib/gmail";

type Props = {
  /** Full or masked recipient address. Renders nothing unless it is Gmail. */
  email: string | null | undefined;
  /**
   * "card" — standalone bordered block, for a confirmation screen that is mostly
   * empty. "inline" — bare text, for slotting inside a box that already has a
   * border (nesting two bordered boxes reads as a mistake).
   */
  variant?: "card" | "inline";
  className?: string;
};

export function GmailPromotionsNote({ email, variant = "card", className = "" }: Props) {
  if (!isGmailAddress(email)) return null;

  // text-sm, not text-xs: this is an instruction the candidate has to act on, and
  // it is the whole reason the screen is on their phone.
  const body = (
    <>
      Você usa Gmail: o e-mail costuma cair na aba{" "}
      <strong className="font-semibold text-foreground">Promoções</strong>. Se não estiver na caixa
      de entrada, procure lá — e arraste para{" "}
      <strong className="font-semibold text-foreground">Principal</strong> para os próximos
      chegarem direto.
    </>
  );

  if (variant === "inline") {
    return <p className={`text-sm text-muted-foreground ${className}`}>{body}</p>;
  }

  return (
    <div
      className={`mx-auto max-w-sm rounded-xl border border-brand/25 bg-brand-muted/10 p-3 text-left text-sm text-muted-foreground ${className}`}
    >
      <span aria-hidden className="mr-1.5">
        📌
      </span>
      {body}
    </div>
  );
}
