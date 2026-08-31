"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Clock, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitDecision, advanceAttempt, restartAttempt } from "@/actions/clinact";
import type { PlayerPayload, PublicScreen } from "@/lib/clinact/player-load";
import type { Reveal } from "@/lib/clinact/engine";
import { FORMAT_LABELS, type AttemptState, type Confidence, type Media, type StepDoc } from "@/lib/clinact/types";
import { Prose, MediaView } from "./prose";

// Member-facing: Portuguese only, no i18n (project rule).

const CONF: { v: Confidence; label: string }[] = [
  { v: "baixa", label: "Baixa" },
  { v: "media", label: "Média" },
  { v: "alta", label: "Alta" },
];

export function CasePlayer({ payload, subscribeCta = false }: { payload: PlayerPayload; subscribeCta?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<AttemptState>(payload.state);
  const [reveals, setReveals] = useState<Record<string, Reveal>>(payload.reveals);
  const [screens, setScreens] = useState<PublicScreen[]>(payload.screens);
  const [finished, setFinished] = useState(payload.finished);
  const [score, setScore] = useState<number | null>(payload.score);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const screen = screens[Math.min(state.cursor, screens.length - 1)];
  const key = screen.decision ? String(screen.decision.id ?? screen.decision.position) : null;
  const reveal = key ? reveals[key] : undefined;

  function onDecision(decision: { option_id?: number; order?: number[]; confidence: Confidence | null; time_ms: number }) {
    if (!screen.decision) return;
    setError(null);
    startTransition(async () => {
      const r = await submitDecision(payload.attemptId, screen.decision!.id!, decision);
      if (!r.ok) {
        setError(r.error === "wrong_step" ? "A página estava desatualizada. Recarregue para continuar." : r.error);
        return;
      }
      setReveals((m) => ({ ...m, [key!]: r.reveal }));
      setScreens((s) => s.map((sc, i) => (i === state.cursor ? { ...sc, after: r.reveal.after } : sc)));
      setState(r.state);
    });
  }

  function onContinue() {
    startTransition(async () => {
      const r = await advanceAttempt(payload.attemptId);
      setState(r.state);
      if (r.finished) {
        setFinished(true);
        setScore(r.score);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function onRestart() {
    startTransition(async () => {
      await restartAttempt(payload.caseId, payload.isPreview);
      router.refresh();
      setState({ cursor: 0, answered: {}, revealed: [], estado: {}, relogio: 0, scene_key: null });
      setReveals({});
      setScreens(payload.screens.map((s) => ({ ...s, after: null })));
      setFinished(false);
      setScore(null);
    });
  }

  const totalDecisions = screens.filter((s) => s.decision).length;
  const done = Object.keys(state.answered).length;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-4 sm:pt-6">
      {/* Case header */}
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wide text-brand">{FORMAT_LABELS[payload.format]}</p>
        <h1 className="mt-0.5 text-xl font-bold leading-snug sm:text-2xl">{payload.title}</h1>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          {payload.isPreview ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">Pré-visualização — não conta</span> : null}
          {!payload.isPreview && payload.hasCanonical && !finished ? <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Repetição — não altera sua evolução</span> : null}
          {totalDecisions > 1 ? <span>Decisão {Math.min(done + 1, totalDecisions)} de {totalDecisions}</span> : null}
        </div>
      </header>

      {finished || screen.closing ? (
        <ClosingScreen screen={screen} score={score} takeaway={payload.takeaway} isPreview={payload.isPreview} onRestart={onRestart} pending={pending} clues={payload.clues} subscribeCta={subscribeCta} />
      ) : (
        <ScreenView
          key={screen.index}
          screen={screen}
          reveal={reveal}
          clues={payload.clues}
          onDecision={onDecision}
          onContinue={onContinue}
          pending={pending}
          error={error}
        />
      )}
    </div>
  );
}

function ScreenView({
  screen,
  reveal,
  clues,
  onDecision,
  onContinue,
  pending,
  error,
}: {
  screen: PublicScreen;
  reveal: Reveal | undefined;
  clues: PlayerPayload["clues"];
  onDecision: (d: { option_id?: number; order?: number[]; confidence: Confidence | null; time_ms: number }) => void;
  onContinue: () => void;
  pending: boolean;
  error: string | null;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [order, setOrder] = useState<number[] | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  // Wall-clock start of this screen (time_ms). Set in an effect so render
  // stays pure; the component is keyed by screen index so it remounts per screen.
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const decision = screen.decision;

  const needsConfidence = screen.askConfidence && !confidence;
  const isOrder = decision?.kind === "ordenar";
  const items = isOrder ? (((decision!.content as { items?: string[] }).items ?? []) as string[]) : [];
  const currentOrder = order ?? items.map((_, i) => i);
  const canSubmit = !reveal && !pending && (isOrder ? !!order || items.length > 0 : chosen !== null) && !needsConfidence;

  function submit() {
    if (!decision) return;
    const time_ms = startedAt.current ? Date.now() - startedAt.current : 0;
    if (isOrder) onDecision({ order: currentOrder, confidence, time_ms });
    else if (chosen !== null) onDecision({ option_id: chosen, confidence, time_ms });
  }

  return (
    <div className="space-y-6">
      {screen.before.map((s) => (
        <PassiveBlock key={s.id ?? s.position} step={s} clues={clues} />
      ))}

      {decision ? (
        <section className="space-y-4">
          {screen.timerSeconds && !reveal ? <Timer seconds={screen.timerSeconds} /> : null}
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 sm:p-5">
            <Prose text={String((decision.content as { prompt?: string; text?: string }).prompt ?? (decision.content as { text?: string }).text ?? "")} className="font-medium" />
            <StepMedia step={decision} />
          </div>

          {isOrder ? (
            <ol className="space-y-2">
              {currentOrder.map((idx, pos) => (
                <li key={idx} className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 p-2 pl-3">
                  <span className="w-5 text-sm text-muted-foreground">{pos + 1}.</span>
                  <span className="flex-1 text-[15px]">{items[idx]}</span>
                  {!reveal ? (
                    <>
                      <button disabled={pos === 0} onClick={() => setOrder(swap(currentOrder, pos, pos - 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                      <button disabled={pos === currentOrder.length - 1} onClick={() => setOrder(swap(currentOrder, pos, pos + 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <span className={cn("text-xs font-medium", idx === pos ? "text-emerald-600 dark:text-emerald-300" : "text-destructive")}>{idx === pos ? "certo" : `era ${idx + 1}º`}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <ul className="space-y-2">
              {decision.options.map((o) => {
                const rv = reveal?.options.find((x) => x.id === o.id);
                const isChosen = reveal ? reveal.chosen_option_id === o.id : chosen === o.id;
                const tone = reveal
                  ? rv?.is_correct
                    ? "border-emerald-500/60 bg-emerald-500/10"
                    : isChosen
                      ? "border-destructive/60 bg-destructive/10"
                      : "border-border opacity-70"
                  : isChosen
                    ? "border-brand bg-brand/10"
                    : "border-border bg-surface-1 hover:border-brand/50";
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={!!reveal || pending}
                      onClick={() => setChosen(o.id)}
                      aria-pressed={isChosen}
                      className={cn("flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-[15px] leading-snug transition-colors sm:p-4", tone)}
                    >
                      <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs", isChosen ? "border-current" : "border-border")}>
                        {reveal ? (rv?.is_correct ? <Check className="h-3.5 w-3.5" /> : isChosen ? <X className="h-3.5 w-3.5" /> : null) : isChosen ? "●" : ""}
                      </span>
                      <span className="flex-1">
                        {o.label}
                        {reveal && rv?.quality ? <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">{rv.quality}</span> : null}
                        {reveal && (isChosen || rv?.is_correct) && rv?.feedback ? <span className="mt-2 block text-sm text-muted-foreground">{rv.feedback}</span> : null}
                        {reveal && isChosen && !rv?.is_correct && rv?.seduction ? (
                          <span className="mt-1.5 block text-sm italic text-muted-foreground">Por que engana: {rv.seduction}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {screen.askConfidence && !reveal ? (
            <div className="rounded-xl border border-border bg-surface-1 p-3.5">
              <p className="text-sm font-medium">Quanta segurança você tem nessa decisão?</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {CONF.map((c) => (
                  <button key={c.v} type="button" onClick={() => setConfidence(c.v)} aria-pressed={confidence === c.v} className={cn("min-h-11 rounded-lg border text-sm font-medium", confidence === c.v ? "border-brand bg-brand/10" : "border-border")}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {!reveal ? (
            <BottomBar>
              <button type="button" disabled={!canSubmit} onClick={submit} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-base font-semibold text-brand-fg disabled:opacity-40 sm:w-auto sm:px-8">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirmar decisão
              </button>
            </BottomBar>
          ) : (
            <>
              {reveal.revealed.length ? (
                <div className="space-y-2 rounded-xl border border-border bg-surface-1 p-4">
                  {reveal.revealed.map((r, i) => (
                    <div key={i}>
                      {r.texto ? <p className="text-sm"><span className="font-medium capitalize">{r.cat}:</span> {r.texto}</p> : null}
                      {r.midia ? <MediaView media={r.midia} className="mt-2" /> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {(screen.after ?? []).map((s) => (
                <AfterBlock key={s.id ?? s.position} step={s} />
              ))}
              <BottomBar>
                <button type="button" disabled={pending} onClick={onContinue} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-base font-semibold text-brand-fg sm:w-auto sm:px-8">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continuar
                </button>
              </BottomBar>
            </>
          )}
        </section>
      ) : (
        <BottomBar>
          <button type="button" disabled={pending} onClick={onContinue} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand text-base font-semibold text-brand-fg sm:w-auto sm:px-8">Continuar</button>
        </BottomBar>
      )}
    </div>
  );
}

/**
 * Fixed action bar on phones, static on ≥sm. The spacer below it is sized by a
 * ResizeObserver so the bar can never swallow the last tap target (project
 * invariant: fixed bottom overlays must reserve their real height).
 */
function BottomBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  // The cookie consent card (z-70, fixed bottom) reserves its own height as
  // body padding-bottom. Read that and sit ABOVE it, so a first-visit student
  // never finds "Confirmar decisão" underneath the notice.
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const fixed = window.getComputedStyle(el).position === "fixed";
      const pad = fixed ? parseFloat(document.body.style.paddingBottom || "0") || 0 : 0;
      setLift(pad);
      setH(fixed ? el.offsetHeight + pad : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return (
    <>
      <div
        ref={ref}
        style={lift ? { bottom: lift } : undefined}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0"
      >
        {children}
      </div>
      <div aria-hidden style={{ height: h }} />
    </>
  );
}

function swap(arr: number[], a: number, b: number): number[] {
  const n = [...arr];
  [n[a], n[b]] = [n[b], n[a]];
  return n;
}

/** Pressure, not a lock (§2.5): reaches zero and simply stays there. */
function Timer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      const rem = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(rem);
      if (rem === 0) window.clearInterval(id);
    }, 250);
    return () => window.clearInterval(id);
  }, [seconds]);
  const pct = (left / seconds) * 100;
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-3" role="timer" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-4 w-4" /> Decida em</span>
        <span className={cn("font-mono text-base font-semibold tabular-nums", left <= 5 && "text-destructive")}>{left}s</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-300", left <= 5 ? "bg-destructive" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
      {left === 0 ? <p className="mt-2 text-xs text-muted-foreground">O tempo acabou — na vida real também. Responda mesmo assim.</p> : null}
    </div>
  );
}

function StepMedia({ step }: { step: StepDoc | PublicScreen["decision"] }) {
  const media = (step?.content as { media?: Media[] })?.media;
  if (!Array.isArray(media) || !media.length) return null;
  return (
    <div className="mt-3 space-y-3">
      {media.map((m, i) => (
        <MediaView key={i} media={m} />
      ))}
    </div>
  );
}

function PassiveBlock({ step, clues }: { step: StepDoc; clues: PlayerPayload["clues"] }) {
  const c = step.content as { text?: string; media?: Media[] };
  switch (step.kind) {
    case "narrativa":
      return (
        <section>
          <Prose text={c.text} />
          <StepMedia step={step} />
        </section>
      );
    case "novo_dado":
      return (
        <section className="rounded-xl border-l-4 border-brand bg-surface-1 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">Novo dado</p>
          <Prose text={c.text} />
          <StepMedia step={step} />
        </section>
      );
    case "midia":
      return <StepMedia step={step} />;
    case "pistas":
      return (
        <section className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pistas</p>
          <ul className="space-y-2">
            {clues.map((k) => (
              <li key={k.id ?? k.position} className="text-[15px]">
                <span className="font-medium">{k.label}</span>
                {k.detail ? <span className="text-muted-foreground"> — {k.detail}</span> : null}
                {k.media ? <MediaView media={k.media} className="mt-2" /> : null}
              </li>
            ))}
          </ul>
        </section>
      );
    case "feedback":
    case "custo_do_atraso":
    case "leve_deste_caso":
      return <AfterBlock step={step} />;
    default:
      return c.text ? <Prose text={c.text} /> : null;
  }
}

function AfterBlock({ step }: { step: StepDoc }) {
  const c = step.content as { text?: string; window?: string; media?: Media[] };
  if (step.kind === "custo_do_atraso") {
    return (
      <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Custo do atraso{c.window ? ` · janela: ${c.window}` : ""}</p>
        <Prose text={c.text} />
      </section>
    );
  }
  if (step.kind === "leve_deste_caso") {
    return (
      <section className="rounded-xl border border-brand/40 bg-brand/10 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">Leve deste caso</p>
        <Prose text={c.text} className="font-medium" />
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feedback</p>
      <Prose text={c.text} />
      <StepMedia step={step} />
    </section>
  );
}

function ClosingScreen({ screen, score, takeaway, isPreview, onRestart, pending, clues, subscribeCta }: { screen: PublicScreen; score: number | null; takeaway: string | null; isPreview: boolean; onRestart: () => void; pending: boolean; clues: PlayerPayload["clues"]; subscribeCta?: boolean }) {
  const hasLeve = screen.before.some((s) => s.kind === "leve_deste_caso");
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-surface-1 p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caso concluído</p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{score != null ? `${Math.round(score)}%` : "—"}</p>
        {isPreview ? <p className="mt-1 text-xs text-muted-foreground">Pré-visualização: nada foi registrado na sua evolução.</p> : null}
      </section>
      {screen.before.map((s) => (
        <PassiveBlock key={s.id ?? s.position} step={s} clues={clues} />
      ))}
      {!hasLeve && takeaway ? <AfterBlock step={{ position: 0, kind: "leve_deste_caso", enabled: true, content: { text: takeaway }, options: [] }} /> : null}
      {subscribeCta ? (
        <section className="rounded-2xl border border-brand/40 bg-brand/10 p-5 text-center">
          <p className="font-semibold">Gostou do treino?</p>
          <p className="mt-1 text-sm text-muted-foreground">Este foi um dos casos gratuitos. A assinatura libera a biblioteca completa — com casos novos toda semana.</p>
          <Link href="/clinact" className="mt-3 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-8 text-base font-semibold text-brand-fg">Conhecer a assinatura</Link>
        </section>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/clinact/treinar" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-brand text-base font-semibold text-brand-fg">Voltar aos casos</Link>
        <button type="button" onClick={onRestart} disabled={pending} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-base font-medium">
          <RotateCcw className="h-4 w-4" /> Refazer {isPreview ? "" : "(não conta)"}
        </button>
      </div>
    </div>
  );
}
