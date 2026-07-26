"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trackLeadEvent } from "@/actions/magnet";
import { PlatformPeek } from "@/components/magnet/platform-peek";
import { SiteText } from "@/components/landing/site-text";
import type { SessionOffer } from "@/components/magnet/flashcards-session";
import type { SimuladoAreaScore, SimuladoReviewItem } from "@/lib/magnet/simulado";

// The payoff page for /simulado-revalida. Structure follows Karina's spec:
//
//   diagnosis  →  invitation #1  →  commented review of all 100  →  invitation #2
//
// The first invitation sits ABOVE the review deliberately: by that point the
// candidate has seen their performance by área, which is enough to judge quality,
// and making them scroll 100 comentários before any offer wastes the warm moment.
//
// STATISTICAL DISCIPLINE: percentages are shown for the five grandes áreas (13–31
// questions each) and never for temas. All 100 questions cover distinct temas, so
// a per-tema rate would be 0% or 100% off one question. Temas appear only as a
// list of things worth revisiting, never as a verdict about what the candidate knows.

const LETTERS = ["A", "B", "C", "D"];

type Filter = "todas" | "erradas" | "branco" | "marcadas";

export function SimuladoReport({
  firstName,
  score,
  blank,
  wrong,
  total,
  areaScores,
  temasToReview,
  items,
  offer,
  storeCoupon,
  cohortLabel,
  token,
}: {
  firstName: string | null;
  score: number;
  blank: number;
  wrong: number;
  total: number;
  /** Still passed by the page and still admin-editable (site_content
   *  `sim.report.cut_score`), but not rendered since 2026-07-26 — deliberately
   *  kept so the verdict box can be restored without rebuilding the feature.
   *  Not destructured above only because an unused binding fails lint. */
  cutScore: number;
  areaScores: SimuladoAreaScore[];
  temasToReview: string[];
  items: SimuladoReviewItem[];
  offer: SessionOffer | null;
  storeCoupon: { code: string; percent: number; url: string } | null;
  cohortLabel: string;
  token: string;
}) {
  // Defaults to the COMPLETE review of all 100, per Karina's spec — the filters are
  // an option on top of it, not the starting state. Rows are collapsed, so showing
  // everything costs nothing and the candidate sees the full deliverable first.
  const [filter, setFilter] = useState<Filter>("todas");
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const pct = Math.round((score / total) * 100);

  const rated = useMemo(
    () =>
      areaScores
        .filter((a) => a.total > 0)
        .map((a) => ({ ...a, rate: Math.round((a.correct / a.total) * 100) })),
    [areaScores],
  );
  const ranked = useMemo(() => [...rated].sort((a, b) => b.rate - a.rate), [rated]);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  // Only call an área a priority when it's genuinely below the others.
  const priorities = useMemo(
    () => ranked.filter((a) => a.rate < 60).slice(-2).reverse(),
    [ranked],
  );

  const counts = useMemo(
    () => ({
      todas: items.length,
      erradas: items.filter((i) => i.chosenIndex !== null && i.chosenIndex !== i.correctIndex).length,
      branco: items.filter((i) => i.chosenIndex === null).length,
      marcadas: items.filter((i) => i.flagged).length,
    }),
    [items],
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "erradas":
        return items.filter((i) => i.chosenIndex !== null && i.chosenIndex !== i.correctIndex);
      case "branco":
        return items.filter((i) => i.chosenIndex === null);
      case "marcadas":
        return items.filter((i) => i.flagged);
      default:
        return items;
    }
  }, [items, filter]);

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "erradas", label: "Que eu errei" },
    { key: "branco", label: "Não respondidas" },
    { key: "marcadas", label: "Marcadas" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        {/* ── Diagnosis ───────────────────────────────────────────────────── */}
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-wider text-brand">
            <SiteText as="span" k="sim.report.eyebrow" fallback="Seu relatório de desempenho" />
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {firstName ? `Prova entregue, ${firstName}!` : "Prova entregue!"}
          </h1>

          <div className="mt-5 inline-flex items-baseline gap-1.5 rounded-2xl border border-border bg-surface-1 px-6 py-4">
            <span className="font-display text-5xl font-extrabold tabular-nums text-brand">{score}</span>
            <span className="text-xl text-muted-foreground">/{total}</span>
            <span className="ml-2 self-center rounded-full bg-brand-muted/50 px-2.5 py-1 text-xs font-semibold text-brand">
              {pct}% de acerto
            </span>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            <strong className="tabular-nums text-emerald-500">{score}</strong> certas ·{" "}
            <strong className="tabular-nums text-red-400">{wrong}</strong> erradas ·{" "}
            <strong className="tabular-nums text-foreground">{blank}</strong> não respondidas
          </p>

          {/* The cut-score verdict box was removed 2026-07-26 (Karina): the report
              states the score and the per-área breakdown, and does not compare the
              candidate to a reference nota de corte.

              The PLUMBING IS DELIBERATELY LEFT INTACT — the `cutScore` prop, the
              page's parseCutScore() read, and the site_content rows
              sim.report.cut_score / cut_above / cut_below all still exist, so
              restoring this is re-adding the block below, not rebuilding the
              feature. See RESTORE at the bottom of this file. */}
        </div>

        {/* Per-área */}
        <div className="mt-8 rounded-2xl border border-border bg-surface-1/50 p-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <SiteText as="span" k="sim.report.areas_label" fallback="Desempenho por grande área" />
          </p>
          <div className="mt-3 space-y-2.5">
            {rated.map((a) => (
              <div key={a.key} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-sm text-foreground sm:w-44">{a.label}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={`h-full rounded-full ${
                      a.rate >= 70 ? "bg-emerald-500" : a.rate >= 40 ? "bg-brand" : "bg-amber-500"
                    }`}
                    style={{ width: `${a.rate}%` }}
                  />
                </div>
                {/* Percentage leads, raw count follows — Karina asked for the
                    percentual por área, but the fraction is what makes it
                    interpretable when an área has 10 questions and another 39. */}
                <span className="w-[4.5rem] shrink-0 text-right tabular-nums">
                  <span className="text-sm font-semibold text-foreground">{a.rate}%</span>
                  <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                    {a.correct}/{a.total}
                  </span>
                </span>
              </div>
            ))}
          </div>

          {best && worst && best.key !== worst.key && (
            <p className="mt-4 border-t border-border/60 pt-3 text-sm text-muted-foreground">
              Melhor desempenho em <strong className="text-foreground">{best.label}</strong> ({best.rate}%);
              o mais baixo em <strong className="text-foreground">{worst.label}</strong> ({worst.rate}%).
            </p>
          )}
        </div>

        {/* Temas — a list, never a rate. */}
        {temasToReview.length > 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-surface-1/50 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <SiteText as="span" k="sim.report.temas_label" fallback="Temas que merecem revisão" />
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              <SiteText
                as="span"
                multiline
                k="sim.report.temas_note"
                fallback="São os temas das questões que você errou neste simulado. Cada tema aparece poucas vezes na prova, então trate a lista como um roteiro de revisão — não como um diagnóstico definitivo do seu conhecimento."
              />
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {temasToReview.map((t, i) => (
                <span
                  key={`${t}-${i}`}
                  className="rounded-md bg-surface-2 px-2 py-1 text-xs text-foreground ring-1 ring-border"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Where to start — área-level, because that's where the numbers are sound. */}
        <div className="mt-6 rounded-2xl border border-brand/25 bg-brand-muted/10 p-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
            <SiteText as="span" k="sim.report.start_label" fallback="Por onde começar" />
          </p>
          <p className="mt-1.5 text-sm text-foreground">
            {priorities.length > 0 ? (
              <>
                Comece por <strong>{priorities.map((a) => a.label).join(" e ")}</strong> — foi onde você
                deixou mais pontos na mesa. Depois, use a revisão comentada abaixo para entender o
                raciocínio de cada questão que errou.
              </>
            ) : (
              <>
                Seu desempenho está equilibrado entre as áreas. O melhor próximo passo é a revisão
                comentada abaixo: entender por que cada alternativa errada engana é o que separa 60 de 80.
              </>
            )}
          </p>
        </div>

        {/* ── Invitation #1 ───────────────────────────────────────────────── */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface-1">
          <div className="p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
              <SiteText as="span" k="sim.report.invite1_eyebrow" fallback="O próximo passo" />
            </p>
            <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
              <SiteText
                as="span"
                k="sim.report.invite1_title"
                fallback="Transforme esse diagnóstico em um plano"
              />
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              <SiteText
                as="span"
                multiline
                k="sim.report.invite1_body"
                fallback="O MedHelpSpace monta um plano de estudos que prioriza exatamente as áreas em que você teve mais dificuldade, com milhares de questões comentadas, simulados no padrão da banca, resumos, flashcards e MedVoice — ajustado até a data da sua prova."
              />
            </p>
            <Link
              href="/?utm_source=sim-report&utm_medium=funnel&utm_campaign=invite-1"
              onClick={() => {
                void trackLeadEvent({ token, event: "clicked_ver_recursos" });
              }}
              className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl border border-brand bg-brand-muted/20 px-6 text-base font-semibold text-foreground transition-colors hover:bg-brand-muted/40"
            >
              <SiteText
                as="span"
                k="sim.report.invite1_cta"
                fallback="Conhecer o MedHelpSpace →"
              />
            </Link>
          </div>
        </div>

        {/* ── Commented review ────────────────────────────────────────────── */}
        <div className="mt-10">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            <SiteText as="span" k="sim.report.review_title" fallback="Gabarito comentado" />
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <SiteText
              as="span"
              multiline
              k="sim.report.review_body"
              fallback="Todas as 100 questões, com a alternativa correta, por que ela está certa, onde cada alternativa errada engana e o conceito-chave."
            />
          </p>

          {/* Filters — horizontally scrollable on small screens */}
          <div className="-mx-5 mt-4 overflow-x-auto px-5">
            <div className="flex w-max gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold transition-colors ${
                    filter === f.key
                      ? "border-brand bg-brand text-brand-fg"
                      : "border-border bg-surface-1 text-muted-foreground hover:border-brand"
                  }`}
                >
                  {f.label}
                  <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-border bg-surface-1/30 p-6 text-center text-sm text-muted-foreground">
              {filter === "erradas"
                ? "Você não errou nenhuma questão. Impressionante."
                : filter === "branco"
                  ? "Você respondeu todas as questões."
                  : "Nenhuma questão marcada para revisar."}
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {visible.map((item) => {
                const isOpen = open.has(item.id);
                const isBlank = item.chosenIndex === null;
                const isRight = item.chosenIndex === item.correctIndex;
                return (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-2xl border border-border bg-surface-1"
                  >
                    {/* Collapsed header — 100 full comentários would be unusable expanded */}
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      aria-expanded={isOpen}
                      className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/50"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isBlank
                            ? "bg-surface-2 text-muted-foreground"
                            : isRight
                              ? "bg-emerald-500 text-white"
                              : "bg-red-500 text-white"
                        }`}
                      >
                        {isBlank ? "–" : isRight ? "✓" : "✗"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          Questão {item.position}
                          {item.flagged && <span className="ml-1.5 text-amber-500">★</span>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.areaLabel} · {item.tema}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                      >
                        ▾
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border/60 px-4 py-4">
                        {item.mediaUrl && (
                          <div className="mb-4 overflow-hidden rounded-lg border border-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.mediaUrl}
                              alt={`Imagem da questão ${item.position}`}
                              loading="lazy"
                              className="max-h-72 w-full bg-white object-contain dark:bg-neutral-100"
                            />
                          </div>
                        )}
                        <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground">
                          {item.enunciado}
                        </p>

                        <div className="mt-4 space-y-2">
                          {item.alternatives.map((text, i) => {
                            const correct = i === item.correctIndex;
                            const chosen = i === item.chosenIndex;
                            return (
                              <div
                                key={i}
                                className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                                  correct
                                    ? "border-emerald-500/60 bg-emerald-500/10"
                                    : chosen
                                      ? "border-red-500/60 bg-red-500/10"
                                      : "border-border bg-background"
                                }`}
                              >
                                <span
                                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                    correct
                                      ? "bg-emerald-500 text-white"
                                      : chosen
                                        ? "bg-red-500 text-white"
                                        : "bg-surface-2 text-muted-foreground"
                                  }`}
                                >
                                  {LETTERS[i] ?? "?"}
                                </span>
                                <span className="flex-1 text-sm leading-snug text-foreground">
                                  {text}
                                  {chosen && (
                                    <em className="ml-1.5 not-italic text-xs text-muted-foreground">
                                      (sua resposta)
                                    </em>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {isBlank && (
                          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
                            Você deixou esta questão em branco.
                          </p>
                        )}

                        <div className="mt-4 space-y-3 text-sm leading-relaxed">
                          <div>
                            <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
                              Comentário
                            </p>
                            <p className="mt-1 text-foreground">{item.comentario}</p>
                          </div>
                          <div>
                            <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
                              Por que as outras estão erradas
                            </p>
                            <p className="mt-1 text-muted-foreground">{item.distratores}</p>
                          </div>
                          <div className="rounded-xl border border-brand/25 bg-brand-muted/10 px-3 py-2.5">
                            <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
                              Conceito-chave
                            </p>
                            <p className="mt-1 text-foreground">{item.conceitoChave}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Invitation #2 — the offer ───────────────────────────────────── */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-surface-1">
          <div className="border-b border-border/60 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
              <SiteText as="span" k="sim.report.invite2_eyebrow" fallback="Continue a partir daqui" />
            </p>
            <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">
              <SiteText
                as="span"
                k="sim.report.invite2_title"
                fallback="Esse nível de comentário, em toda a sua preparação"
              />
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              <SiteText
                as="span"
                multiline
                k="sim.report.invite2_body"
                fallback="Você acabou de ver como tratamos 100 questões. Na plataforma são milhares — com simulados no padrão da banca, revisão espaçada, resumos, MedVoice e um plano que ataca primeiro as áreas em que você foi pior neste simulado."
              />
            </p>
          </div>
          <div className="border-b border-border/60 p-5">
            <PlatformPeek showDeviceToggle />
          </div>
          <div className="p-5">
            {offer ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm text-muted-foreground">{offer.cohortName} ·</span>
                  {offer.compareAtLabel && (
                    <span className="text-sm text-muted-foreground line-through">
                      {offer.compareAtLabel}
                    </span>
                  )}
                  <span className="font-display text-2xl font-bold text-foreground">
                    {offer.priceLabel}
                  </span>
                </div>
                {offer.couponCode && offer.couponPercent && (
                  <p className="mt-1.5 text-sm text-brand">
                    Cupom de boas-vindas{" "}
                    <strong className="rounded bg-brand-muted/50 px-1.5 py-0.5 font-mono">
                      {offer.couponCode}
                    </strong>{" "}
                    — {offer.couponPercent}% de desconto para a {cohortLabel}.
                  </p>
                )}
                <a
                  href={offer.checkoutUrl}
                  className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-opacity hover:opacity-95"
                >
                  Garantir minha vaga{offer.couponPercent ? ` com ${offer.couponPercent}% OFF` : ""} →
                </a>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Acesso imediato · Pix ou cartão · 7 dias de garantia
                </p>
              </>
            ) : storeCoupon ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Você escolhe a turma quando quiser — e leva um desconto de boas-vindas.
                </p>
                <p className="mt-1.5 text-sm text-brand">
                  Cupom{" "}
                  <strong className="rounded bg-brand-muted/50 px-1.5 py-0.5 font-mono">
                    {storeCoupon.code}
                  </strong>{" "}
                  — {storeCoupon.percent}% de desconto em qualquer turma.
                </p>
                <a
                  href={storeCoupon.url}
                  className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg shadow-lg shadow-brand/25 transition-opacity hover:opacity-95"
                >
                  Ver turmas com {storeCoupon.percent}% OFF →
                </a>
              </>
            ) : (
              <Link
                href="/loja"
                className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-fg transition-opacity hover:opacity-95"
              >
                Conhecer a plataforma completa →
              </Link>
            )}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <SiteText
            as="span"
            multiline
            k="sim.report.durable_note"
            fallback="Guarde o e-mail que enviamos: o mesmo link traz você de volta a este relatório quando quiser."
          />
        </p>
      </div>
    </div>
  );
}

// ── RESTORE: the cut-score verdict box (removed 2026-07-26, Karina) ───────────
//
// Everything it needs still exists — the `cutScore` prop, the page's
// parseCutScore() read, and the site_content rows sim.report.cut_score /
// cut_above / cut_below. To bring it back: add `cutScore` to the destructuring
// at the top, re-add the two derived values, and drop the block back in
// immediately after the "certas · erradas · não respondidas" line.
//
//   const aboveCut = score >= cutScore;
//   const gap = Math.abs(cutScore - score);
//
//   <div className={`mx-auto mt-5 max-w-md rounded-2xl border px-5 py-4 text-sm ${
//       aboveCut ? "border-emerald-500/40 bg-emerald-500/10"
//                : "border-amber-500/40 bg-amber-500/10"}`}>
//     <p className="text-foreground">
//       {aboveCut ? (
//         <SiteText as="span" multiline k="sim.report.cut_above"
//           fallback="Você ficou {gap} ponto(s) acima da nota de corte de referência do Revalida ({cut}/100). Bom sinal — agora o trabalho é sustentar isso em todas as áreas."
//           vars={{ gap, cut: cutScore }} />
//       ) : (
//         <SiteText as="span" multiline k="sim.report.cut_below"
//           fallback="Faltaram {gap} ponto(s) para a nota de corte de referência do Revalida ({cut}/100). Essa distância é totalmente recuperável — e o seu desempenho por área mostra exatamente onde ela está."
//           vars={{ gap, cut: cutScore }} />
//       )}
//     </p>
//   </div>
