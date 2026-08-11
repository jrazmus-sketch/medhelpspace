"use client";

import { useState } from "react";
import { confirmSimuladoEmail, correctSimuladoEmail } from "@/actions/simulado";
import { TurnstileWidget } from "@/components/magnet/turnstile-widget";
import { GmailPromotionsNote } from "@/components/gmail-promotions-note";

// This form makes the server send mail to whatever address is typed here, so it
// carries the same challenge as the other send surfaces. Both-or-neither: with no
// site key the widget renders nothing and the server-side verifier skips too.
const TURNSTILE_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

// The in-exam address check — docs/simulado-drip-design.md §2, steps 4 and 5.
//
// A 100-question exam is inherently multi-session, so the resume link IS the exam.
// If it went to a typo'd address the candidate loses the whole thing, and we lose
// them silently: the bounce webhook sets drip_status='bounced' and every drip
// excludes them from then on. The exam page is the last surface that can catch it —
// the session is an httpOnly cookie good for 120 days, so a bounced candidate is
// still identifiable here long after the send failed.
//
// Two modes, same component:
//   • "check"  — the routine nudge, after N answered questions. Framed as serving
//                THEIR need (you'll want to come back to this), not our list.
//   • "bounce" — we know the address is dead. Shown immediately, not dismissible,
//                and the copy says plainly that the link did not arrive.
//
// Confirming persists to leads.sim_email_confirmed_at, so it is asked once ever
// rather than on every page load — which is what makes it fair to show the bounce
// variant as insistently as it deserves.

type Mode = "check" | "bounce";

export function SimuladoEmailCheck({
  mode,
  maskedEmail,
  onResolved,
}: {
  mode: Mode;
  maskedEmail: string;
  onResolved: () => void;
}) {
  const [editing, setEditing] = useState(mode === "bounce");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // A visually-hidden field humans leave blank; bots fill it.
  const [honeypot, setHoneypot] = useState("");

  const needsTurnstile = TURNSTILE_ENABLED && !turnstileToken;

  const isBounce = mode === "bounce";

  async function confirm() {
    setBusy(true);
    await confirmSimuladoEmail();
    setBusy(false);
    onResolved();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);

    const res = await correctSimuladoEmail({ email, turnstileToken, honeypot });
    setBusy(false);

    switch (res.status) {
      // ONE success message, whether or not that address already had a lead. The
      // server deliberately does not distinguish them, so we cannot either — the
      // difference is exactly the enumeration signal we are refusing to emit.
      case "sent":
        setMsg({
          tone: "ok",
          text: `Pronto! Enviamos o link de acesso para ${res.maskedEmail}. Pode continuar a prova — seu progresso está salvo aqui.`,
        });
        setEditing(false);
        return;
      case "unchanged":
        setMsg({ tone: "err", text: "Esse é o mesmo e-mail que já está cadastrado." });
        return;
      case "invalid":
        setMsg({ tone: "err", text: "Confira o e-mail — parece que falta alguma coisa." });
        return;
      case "blocked":
        setMsg({
          tone: "err",
          text:
            res.reason === "undeliverable_domain"
              ? "Esse domínio não parece receber e-mails. Confira e tente de novo."
              : res.reason === "disposable_email"
                ? "Use um e-mail permanente, para o link não se perder."
                : "Não conseguimos confirmar o envio. Recarregue a página e tente de novo.",
        });
        return;
      case "too_many":
        setMsg({
          tone: "err",
          text: "Você já trocou o e-mail algumas vezes. Fale com a gente pelo contato@medhelpspace.com.br.",
        });
        return;
      default:
        setMsg({ tone: "err", text: "Não conseguimos salvar agora. Tente de novo em instantes." });
    }
  }

  return (
    <div
      className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
        isBounce ? "border-destructive/40 bg-destructive/10" : "border-border bg-surface-1"
      }`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5">
          {isBounce ? "⚠️" : "📬"}
        </span>

        <div className="min-w-0 flex-1">
          {isBounce ? (
            <p className="text-foreground">
              Não conseguimos entregar o seu link em{" "}
              <strong className="break-all">{maskedEmail}</strong>. Corrija o endereço para não
              perder a prova — seu progresso continua salvo aqui.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Seu link de retorno foi para{" "}
              <strong className="break-all text-foreground">{maskedEmail}</strong>. É por ele que
              você volta a esta prova depois.
            </p>
          )}

          {/* Inline: this banner already draws its own border. Uses the address the
              link actually went to — after a correction the success message below
              carries the note for the NEW one.
              NEVER in bounce mode: that address is dead, the mail was never
              delivered, and sending them to the Promoções tab to look for it wastes
              the one surface left that can save their exam. */}
          {!isBounce && (
            <GmailPromotionsNote email={maskedEmail} variant="inline" className="mt-2" />
          )}

          {/* No `success` token exists in the theme (only the raw --c-success var,
              which is chart/mockup-scoped). Confirmation reads as plain foreground
              text; only errors take a colour. */}
          {msg && (
            <p
              role="status"
              className={`mt-2 ${msg.tone === "ok" ? "font-medium text-foreground" : "text-destructive"}`}
            >
              {msg.text}
            </p>
          )}

          {/* The corrected address, once the resend succeeded. `email` is what they
              typed; the note is silent unless it is Gmail. */}
          {msg?.tone === "ok" && (
            <GmailPromotionsNote email={email} variant="inline" className="mt-2" />
          )}

          {editing ? (
            // Stacked on phones, inline from sm up. type=email + inputMode bring up
            // the right keyboard; 16px font avoids iOS zoom-on-focus.
            <form onSubmit={submit} className="relative mt-3">
              {/* Field + action stack on phones, sit inline from sm up. type=email
                  raises the right keyboard; text-base is 16px so iOS never zooms. */}
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu e-mail correto"
                  aria-label="Corrigir o e-mail"
                  className="min-h-[48px] w-full flex-1 rounded-lg border border-border bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy || needsTurnstile}
                  className="min-h-[48px] shrink-0 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? "Enviando…" : needsTurnstile ? "Verificando…" : "Reenviar link"}
                </button>
              </div>

              {/* Honeypot — visually hidden; real users never fill it. Same markup
                  as the other magnet forms (flashcards-gate, magnet-quiz). */}
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />
              {/* Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset. */}
              <TurnstileWidget onVerify={setTurnstileToken} />
            </form>
          ) : (
            !msg && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy}
                  className="min-h-[44px] rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  Chegou, obrigado
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="min-h-[44px] rounded-lg px-3 text-sm font-medium text-brand underline underline-offset-4 transition-opacity hover:opacity-80"
                >
                  Não chegou / e-mail errado
                </button>
              </div>
            )
          )}
        </div>

        {/* The bounce variant has no dismiss: we KNOW it is broken, and dismissing
            it is how the candidate silently loses the exam. */}
        {!isBounce && (
          <button
            type="button"
            onClick={onResolved}
            aria-label="Dispensar aviso"
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
