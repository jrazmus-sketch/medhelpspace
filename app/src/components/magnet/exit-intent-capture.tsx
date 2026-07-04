"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveLeadForLater } from "@/actions/magnet";
import {
  getFunnelSessionId,
  isLeadCaptured,
  LEAD_CAPTURED_EVENT,
} from "@/lib/magnet/funnel-track";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";

// Exit-intent "salvar para depois" capture (idea 1, done as exit-intent — NOT a
// co-primary button, so it never cannibalizes a quiz start). It arms only for a
// visitor who is LEAVING before they gave an email:
//   • desktop → the cursor exits the top of the viewport (classic exit intent);
//   • mobile  → a gentle timed fallback (no cursor to track), fired once after the
//     visitor has lingered but not committed.
// It disarms the instant the funnel captures an email anywhere (the quiz gate fires
// LEAD_CAPTURED_EVENT), and shows at most once per session. Submitting hits
// saveLeadForLater — a soft capture that drops the lead into the recovery drip; no
// email is sent inline (same domain-reputation discipline as the Q5 capture).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHOWN_GUARD = "mhs_exit_shown"; // once-per-session
const MOBILE_DELAY_MS = 22_000; // linger window before the mobile fallback

export function ExitIntentCapture({ utm }: { utm: MagnetUtm }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Latch so the async triggers can't re-open after capture/dismiss within a render gap.
  const armedRef = useRef(true);

  // ── Arm the triggers ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Never arm if the funnel already has this visitor's email, or we've shown it.
    let shown = false;
    try {
      shown = sessionStorage.getItem(SHOWN_GUARD) === "1";
    } catch {
      /* storage blocked — treat as not-yet-shown */
    }
    if (isLeadCaptured() || shown) {
      armedRef.current = false;
      return;
    }

    const fire = () => {
      if (!armedRef.current) return;
      if (isLeadCaptured()) {
        armedRef.current = false;
        return;
      }
      armedRef.current = false;
      try {
        sessionStorage.setItem(SHOWN_GUARD, "1");
      } catch {
        /* best-effort */
      }
      setOpen(true);
    };

    // Desktop exit intent: cursor leaves through the top edge.
    const onMouseOut = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) fire();
    };

    // Mobile / touch: no cursor to track → a single timed fallback after lingering.
    const coarse =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches;

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (coarse) {
      timer = setTimeout(fire, MOBILE_DELAY_MS);
    } else {
      document.addEventListener("mouseout", onMouseOut);
    }

    // Disarm the moment an email is captured elsewhere in the funnel.
    const onCaptured = () => {
      armedRef.current = false;
      setOpen(false);
    };
    window.addEventListener(LEAD_CAPTURED_EVENT, onCaptured);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener(LEAD_CAPTURED_EVENT, onCaptured);
    };
  }, []);

  // ── Modal side-effects: Esc to close, body scroll lock, focus the field ────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the email field once the dialog paints (skip if it's the success state).
    if (!done) requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, done]);

  function submit() {
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) {
      setErr("Digite um e-mail válido.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await saveLeadForLater({
        email: em,
        utm,
        honeypot: hp,
        context: {
          referrer: typeof document !== "undefined" ? document.referrer || null : null,
          landingPath:
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : null,
          sessionId: getFunnelSessionId(),
        },
      });
      if (!res.ok) {
        setErr("Não foi possível salvar. Confira o e-mail e tente de novo.");
        return;
      }
      setDone(true);
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-intent-title"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-brand/30 bg-surface-1 p-6 shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <span aria-hidden className="text-lg leading-none">
            ×
          </span>
        </button>

        {done ? (
          <div className="text-center">
            <div
              aria-hidden
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted text-2xl"
            >
              ✓
            </div>
            <h2 id="exit-intent-title" className="text-lg font-bold tracking-tight">
              Guardado com você
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Quando quiser voltar, é só continuar de onde parou — te mandamos o link para o
              seu e-mail.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
            >
              Continuar o simulado agora →
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              Sem tempo agora?
            </p>
            <h2 id="exit-intent-title" className="mt-2 text-xl font-bold tracking-tight">
              Guardo o seu simulado para depois
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Deixe seu e-mail e a gente te manda o link para continuar de onde você parou —
              no seu tempo, sem pressa.
            </p>

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
              <input
                ref={inputRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base outline-none focus:border-brand"
              />
              {err && <p className="text-sm text-red-500">{err}</p>}
              <button
                onClick={submit}
                disabled={pending}
                className="w-full rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Salvando…" : "Salvar meu simulado →"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="min-h-[44px] w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Não, quero continuar agora
              </button>
              <p className="text-center text-xs text-muted-foreground">
                Sem spam. É só o link para voltar ao simulado.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
