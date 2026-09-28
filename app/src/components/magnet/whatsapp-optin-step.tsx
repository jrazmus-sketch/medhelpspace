"use client";

// The optional WhatsApp step — Karina, 2026-09-28. Shown right after the lead row
// exists (the e-mail step already saved it), never before. Two equal buttons: the
// visitor can always continue without a number, and nothing here can block the
// material. See lib/whatsapp-optin.ts for the copy, consent text and phone rules.
//
// Parent components decide WHETHER to render this (shouldShowWhatsappStep); this
// component only asks the question and reports "accepted" or "skipped" back.

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { skipWhatsappOptIn, submitWhatsappOptIn, whatsappStepShown } from "@/actions/whatsapp-optin";
import { trackEvent } from "@/lib/analytics/track";
import {
  WHATSAPP_CONSENT_LINK_HREF,
  WHATSAPP_CONSENT_LINK_LABEL,
  WHATSAPP_CONSENT_TEXT,
  WHATSAPP_STEP_COPY,
  maskBrMobileInput,
  normalizeBrMobile,
  type WhatsappFunnel,
  type WhatsappStepInfo,
} from "@/lib/whatsapp-optin";

// The consent sentence, with the policy name turned into a link.
function ConsentLabel() {
  const i = WHATSAPP_CONSENT_TEXT.indexOf(WHATSAPP_CONSENT_LINK_LABEL);
  if (i < 0) return <>{WHATSAPP_CONSENT_TEXT}</>;
  return (
    <>
      {WHATSAPP_CONSENT_TEXT.slice(0, i)}
      <Link
        href={WHATSAPP_CONSENT_LINK_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand underline underline-offset-2"
        onClick={(e) => e.stopPropagation()}
      >
        {WHATSAPP_CONSENT_LINK_LABEL}
      </Link>
      {WHATSAPP_CONSENT_TEXT.slice(i + WHATSAPP_CONSENT_LINK_LABEL.length)}
    </>
  );
}

export function WhatsappOptinStep({
  funnel,
  info,
  onDone,
}: {
  funnel: WhatsappFunnel;
  info: WhatsappStepInfo;
  onDone: (result: "accepted" | "skipped") => void;
}) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const phoneId = useId();
  const consentId = useId();
  const shownOnce = useRef(false);

  useEffect(() => {
    if (shownOnce.current) return;
    shownOnce.current = true;
    trackEvent("whatsapp_optin_shown", { funnel });
    void whatsappStepShown({ ref: info.ref }).catch(() => {});
  }, [funnel, info.ref]);

  function accept() {
    const e164 = normalizeBrMobile(phone);
    if (!e164) {
      setErr(WHATSAPP_STEP_COPY.errors.phone);
      return;
    }
    if (!consent) {
      setErr(WHATSAPP_STEP_COPY.errors.consent);
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await submitWhatsappOptIn({ ref: info.ref, phone: e164, consent: true }).catch(() => null);
      if (!res || !res.ok) {
        setErr(
          res && res.reason === "invalid_phone"
            ? WHATSAPP_STEP_COPY.errors.phone
            : WHATSAPP_STEP_COPY.errors.generic,
        );
        return;
      }
      trackEvent("whatsapp_optin_accepted", { funnel });
      onDone("accepted");
    });
  }

  function skip() {
    // The visitor moves on IMMEDIATELY; the "não" is recorded in the background.
    trackEvent("whatsapp_optin_skipped", { funnel });
    void skipWhatsappOptIn({ ref: info.ref }).catch(() => {});
    onDone("skipped");
  }

  return (
    <div
      data-whatsapp-optin-step={funnel}
      className="rounded-2xl border border-brand/30 bg-surface-1/80 p-6 shadow-[0_0_60px_-15px] shadow-brand/40 sm:p-7"
    >
      {!info.enabled && (
        <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          Em teste — só administradores estão vendo esta etapa.
        </p>
      )}
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">Opcional</p>
      <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
        {WHATSAPP_STEP_COPY.title}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{WHATSAPP_STEP_COPY.body}</p>

      <div className="mt-5 space-y-3">
        <label htmlFor={phoneId} className="block text-sm font-medium text-foreground">
          {WHATSAPP_STEP_COPY.label}
        </label>
        <input
          id={phoneId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={WHATSAPP_STEP_COPY.placeholder}
          value={phone}
          onChange={(e) => setPhone(maskBrMobileInput(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && accept()}
          className="min-h-[52px] w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/30"
        />

        <label htmlFor={consentId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background/60 p-3">
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
          />
          <span className="text-sm leading-snug text-foreground/90">
            <ConsentLabel />
          </span>
        </label>

        {err && (
          <p role="alert" className="text-sm text-red-400">
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={accept}
          disabled={pending}
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-5 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? "Salvando…" : WHATSAPP_STEP_COPY.accept}
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={pending}
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-border bg-background/60 px-5 text-base font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand-muted/30 disabled:opacity-60"
        >
          {WHATSAPP_STEP_COPY.skip[funnel]}
        </button>
      </div>
    </div>
  );
}
