"use client";

import { useId, useState, useTransition } from "react";
import { captureSimuladoLead, chooseSimuladoCohortAndSend } from "@/actions/magnet";
import { getFunnelSessionId } from "@/lib/magnet/funnel-track";
import {
  REVALIDA_2027_1_SLUG,
  REVALIDA_20272_SLUG,
  UNDECIDED_COHORT,
} from "@/lib/magnet/links";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";
import { SiteText } from "@/components/landing/site-text";

// Email-first gate for /simulado-revalida (mirrors FlashcardsGate): email → turma →
// "check your inbox". The 100-question simulado is delivered by a magic link
// (chooseSimuladoCohortAndSend), never inline — the link doubles as the resume
// link, which a multi-hour test needs from question 1. All copy is SiteText-wired
// (sim.gate.*) so Karina can edit it in the visual editor.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CohortOption = { slug: string; label: string; when: string; note?: string };
const COHORTS: CohortOption[] = [
  { slug: REVALIDA_2027_1_SLUG, label: "Revalida 2027.1", when: "Início de 2027", note: "Próxima prova" },
  { slug: REVALIDA_20272_SLUG, label: "Revalida 2027.2", when: "Setembro de 2027", note: "Mais tempo" },
  { slug: UNDECIDED_COHORT, label: "Ainda não decidi", when: "Escolho a turma depois" },
];

type Phase = "email" | "cohort" | "sent";

function clientContext() {
  return {
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    landingPath:
      typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
    sessionId: getFunnelSessionId(),
  };
}

export function SimuladoGate({ utm }: { utm: MagnetUtm }) {
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot
  const [err, setErr] = useState<string | null>(null);
  const [masked, setMasked] = useState("");
  const [emailed, setEmailed] = useState(true);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selecting, setSelecting] = useState<string | null>(null);
  const emailId = useId();

  function submitEmail() {
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setErr("Digite um e-mail válido para receber o seu simulado.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await captureSimuladoLead({
        email: em,
        utm,
        honeypot: hp,
        context: clientContext(),
      });
      if (!res.ok) {
        setErr(
          res.reason === "disposable_email"
            ? "Use um e-mail permanente — é pra onde vai o seu acesso."
            : "Não foi possível continuar. Confira o e-mail e tente de novo.",
        );
        return;
      }
      setPhase("cohort");
    });
  }

  function chooseCohort(slug: string) {
    if (pending) return;
    setSelecting(slug);
    setErr(null);
    startTransition(async () => {
      const res = await chooseSimuladoCohortAndSend({
        email: email.trim().toLowerCase(),
        targetCohort: slug,
        utm,
      });
      if (!res.ok) {
        setSelecting(null);
        setErr("Não foi possível enviar o seu acesso. Tente novamente.");
        return;
      }
      setMasked(res.maskedEmail ?? email.trim().toLowerCase());
      setEmailed(res.emailed ?? true);
      setDevLink(res.devLink ?? null);
      setPhase("sent");
    });
  }

  // ── Confirmation ────────────────────────────────────────────────────────────
  if (phase === "sent") {
    return (
      <div className="rounded-2xl border border-brand/30 bg-surface-1/80 p-6 text-center shadow-[0_0_60px_-15px] shadow-brand/40 sm:p-8">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-muted text-3xl"
        >
          📩
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
          <SiteText as="span" k="sim.gate.sent_title" fallback="Enviamos seu acesso!" />
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          <SiteText
            as="span"
            multiline
            k="sim.gate.sent_body"
            fallback="O link do seu simulado de 100 questões foi para {email}. Abra o e-mail e toque em “Começar meu simulado” para iniciar."
            vars={{ email: masked }}
          />
        </p>
        {!emailed && (
          <p className="mx-auto mt-3 max-w-sm text-xs text-amber-400">
            Tivemos um problema para enviar agora. Aguarde um instante e tente reenviar.
          </p>
        )}
        <p className="mx-auto mt-3 max-w-sm text-xs text-muted-foreground">
          <SiteText
            as="span"
            multiline
            k="sim.gate.sent_resume"
            fallback="💾 Guarde esse e-mail: você pode fazer o simulado em blocos de 20 e voltar de onde parou pelo mesmo link, quando quiser."
          />
        </p>
        <div className="mt-5 rounded-xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
          <SiteText
            as="span"
            multiline
            k="sim.gate.sent_spam"
            fallback="Não chegou em 2 minutos? Verifique a caixa de spam ou promoções — e marque como “não é spam” para receber os próximos."
          />
        </div>
        <button
          type="button"
          onClick={() => setPhase("email")}
          className="mt-4 min-h-[44px] text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Usar outro e-mail
        </button>
        {devLink && (
          <a
            href={devLink}
            className="mt-3 block break-all rounded-lg border border-dashed border-brand/40 bg-brand-muted/30 p-2 text-xs text-brand"
          >
            [dev] abrir acesso: {devLink}
          </a>
        )}
      </div>
    );
  }

  // ── Step 2: exam picker ───────────────────────────────────────────────────────
  if (phase === "cohort") {
    return (
      <div className="rounded-2xl border border-brand/30 bg-surface-1/80 p-6 shadow-[0_0_60px_-15px] shadow-brand/40 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">
          <SiteText as="span" k="sim.gate.cohort_eyebrow" fallback="Última etapa" />
        </p>
        <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
          <SiteText as="span" k="sim.gate.cohort_title" fallback="Para qual prova você está estudando?" />
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <SiteText
            as="span"
            multiline
            k="sim.gate.cohort_body"
            fallback="Assim personalizamos o seu relatório de desempenho e os lembretes."
          />
        </p>
        <div className="mt-5 space-y-2.5">
          {COHORTS.map((c) => {
            const loading = pending && selecting === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                disabled={pending}
                onClick={() => chooseCohort(c.slug)}
                className="group flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-muted/30 disabled:opacity-60"
              >
                <span>
                  <span className="block font-semibold text-foreground">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.when}</span>
                </span>
                <span className="flex items-center gap-2">
                  {c.note && (
                    <span className="hidden rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                      {c.note}
                    </span>
                  )}
                  <span aria-hidden className="text-brand transition-transform group-hover:translate-x-0.5">
                    {loading ? "…" : "→"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      </div>
    );
  }

  // ── Step 1: email ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-brand/30 bg-surface-1/80 p-6 shadow-[0_0_60px_-15px] shadow-brand/40 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">
        <SiteText as="span" k="sim.gate.eyebrow" fallback="Grátis · sem cartão" />
      </p>
      <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
        <SiteText as="span" k="sim.gate.headline" fallback="Para onde enviamos o seu simulado?" />
      </h2>
      <div className="mt-5 space-y-3">
        {/* Honeypot — visually hidden; real users never fill it. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />
        <label htmlFor={emailId} className="sr-only">
          Seu e-mail
        </label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitEmail()}
          className="min-h-[52px] w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button
          type="button"
          onClick={submitEmail}
          disabled={pending}
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-5 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? (
            "Um instante…"
          ) : (
            <SiteText as="span" k="sim.gate.cta" fallback="Começar meu simulado grátis →" />
          )}
        </button>
      </div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <span aria-hidden>🔒</span>
        <SiteText
          as="span"
          k="sim.gate.reassurance"
          fallback="Sem spam. Você recebe o simulado e pode cancelar quando quiser."
        />
      </p>
    </div>
  );
}
