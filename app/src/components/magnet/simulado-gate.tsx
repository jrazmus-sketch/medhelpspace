"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startSimulado } from "@/actions/simulado";
import { getFunnelSessionId, trackFunnel } from "@/lib/magnet/funnel-track";
import { UNDECIDED_COHORT } from "@/lib/magnet/links";
import type { CohortOption } from "@/lib/magnet/simulado";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";
import { SiteText } from "@/components/landing/site-text";

// Single-screen entry for /simulado-revalida. Nome + e-mail + turma, then the exam
// starts IMMEDIATELY — no "check your inbox" step. The expensive drop-off is the
// app-switch to the inbox, not the number of fields, so all three are collected
// here and the resume link is emailed in the background.
//
// The turma list comes from the DB (every ACTIVE turma, not just the ones for
// sale): its job is segmentation, so someone sitting the nearest exam can say so
// even when that turma is closed. Copy is SiteText-wired (sim.gate.*) for Karina.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientContext() {
  return {
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    landingPath:
      typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
    sessionId: getFunnelSessionId(),
  };
}

export function SimuladoGate({ utm, cohorts }: { utm: MagnetUtm; cohorts: CohortOption[] }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [cohort, setCohort] = useState<string>(cohorts[0]?.slug ?? UNDECIDED_COHORT);
  const [hp, setHp] = useState(""); // honeypot
  const [err, setErr] = useState<string | null>(null);
  const [resumeSentTo, setResumeSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nameId = useId();
  const emailId = useId();

  function submit() {
    const name = firstName.trim();
    const em = email.trim().toLowerCase();

    if (name.length < 2) {
      setErr("Digite seu nome para começarmos.");
      return;
    }
    if (!EMAIL_RE.test(em)) {
      setErr("Digite um e-mail válido — é para lá que vai o seu link de retorno.");
      return;
    }
    setErr(null);

    startTransition(async () => {
      const res = await startSimulado({
        firstName: name,
        email: em,
        targetCohort: cohort,
        honeypot: hp,
        utm,
        context: clientContext(),
      });

      if (res.status === "started") {
        trackFunnel("quiz_start", utm, "simulado-100");
        router.push("/simulado-revalida/prova");
        return;
      }
      if (res.status === "resume_emailed") {
        setResumeSentTo(res.maskedEmail);
        return;
      }
      setErr(
        res.reason === "disposable_email"
          ? "Use um e-mail permanente para conseguir voltar ao seu simulado depois."
          : "Não conseguimos começar agora. Confira os dados e tente de novo.",
      );
    });
  }

  // Returning candidate with an exam already in progress: we never hand out a
  // session from a form post, so they resume through the e-mail link.
  if (resumeSentTo) {
    return (
      <div className="rounded-2xl border border-brand/25 bg-brand-muted/10 p-6 text-center">
        <div aria-hidden className="mx-auto mb-3 text-3xl">
          📬
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
          <SiteText as="span" k="sim.gate.resume_title" fallback="Você já tem um simulado em andamento" />
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <SiteText
            as="span"
            multiline
            k="sim.gate.resume_body"
            fallback="Enviamos o link de retorno para {email}. Abra o e-mail para continuar exatamente de onde você parou — seu progresso está salvo."
            vars={{ email: resumeSentTo }}
          />
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-5 sm:p-6">
      <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
        <SiteText as="span" k="sim.gate.eyebrow" fallback="Prepare-se para começar" />
      </p>
      <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        <SiteText as="span" k="sim.gate.title" fallback="Receba gratuitamente o simulado completo" />
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        <SiteText
          as="span"
          multiline
          k="sim.gate.body"
          fallback="Informe seus dados para começar agora o simulado com 100 questões inéditas e gabarito comentado."
        />
      </p>

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* honeypot — hidden from humans, catches naive bots */}
        <input
          type="text"
          name="company"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute left-[-9999px] h-px w-px opacity-0"
        />

        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-sm font-medium text-foreground">
            <SiteText as="span" k="sim.gate.name_label" fallback="Nome" />
          </label>
          <input
            id={nameId}
            type="text"
            autoComplete="given-name"
            placeholder="Como podemos te chamar?"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="min-h-[52px] w-full rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand"
          />
        </div>

        <div>
          <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium text-foreground">
            <SiteText as="span" k="sim.gate.email_label" fallback="Seu melhor e-mail" />
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[52px] w-full rounded-xl border border-border bg-background px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand"
          />
        </div>

        {/* Turma picker as a compact 2-up grid. Four full-width stacked cards made
            this form ~900px tall and left the hero visibly lopsided; the exam date
            moves inline so the option stays one line without losing the detail
            that makes people pick the right turma. */}
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-foreground">
            <SiteText as="span" k="sim.gate.cohort_label" fallback="Para qual Revalida você está estudando?" />
          </legend>
          {/* Single column on small phones: at 375px a 2-up grid leaves ~120px of
              text and truncates "Revalida 2026.2". */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              ...cohorts.map((c) => ({ slug: c.slug, label: c.label, hint: c.hint })),
              { slug: UNDECIDED_COHORT, label: "Ainda não decidi", hint: "escolho depois" },
            ].map((c) => (
              <label
                key={c.slug}
                className={`flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
                  cohort === c.slug
                    ? "border-brand bg-brand-muted/20"
                    : "border-border bg-background hover:border-brand/50"
                }`}
              >
                <input
                  type="radio"
                  name="cohort"
                  value={c.slug}
                  checked={cohort === c.slug}
                  onChange={() => setCohort(c.slug)}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {c.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{c.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? (
            "Preparando seu simulado…"
          ) : (
            <SiteText as="span" k="sim.gate.cta" fallback="Começar meu simulado grátis →" />
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          <SiteText
            as="span"
            multiline
            k="sim.gate.reassurance"
            fallback="Começa agora, direto no navegador. Também enviamos um link para você continuar depois. Seus dados estão seguros e não enviamos spam."
          />
        </p>
      </form>
    </div>
  );
}
