"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Headphones } from "lucide-react";
import { recordFlashcardAttempt } from "@/actions/flashcard-attempts";
import { updateFlashcardSM2 } from "@/actions/flashcard-sm2";
import { safe } from "@/lib/sanitize";
import { EditableText } from "@/components/admin/editable-text";
import { SiteText } from "@/components/landing/site-text";

export interface FlashCard {
  id: number;
  text: string;
  answer: string;
  image_url: string | null;
  tip: string | null;
}

export interface CardGroup {
  position: number;
  label: string | null;
  cards: FlashCard[];
}

type Result = "correct" | "incorrect";
type Phase = "play" | "group-done" | "deck-done";

interface Props {
  groups: CardGroup[];
  pageId: number;
  dueTodayCount?: number;
  totalCards?: number;
  /** Back-to-category-grid link. Null for single-category decks (no grid). */
  gridHref?: string | null;
  /** Next category within the same deck (null on the last/only category). */
  nextCategoryHref?: string | null;
  nextCategoryName?: string | null;
  nextDeckHref: string | null;
  nextDeckTitle: string | null;
  specialtyHref: string;
  specialtyName: string;
  /** Passive nudge to this specialty's audiocards page on the deck-done summary. Null = none. */
  audiocardsHref?: string | null;
}

export function FlashcardPlayer({
  groups,
  pageId,
  dueTodayCount,
  totalCards,
  gridHref = null,
  nextCategoryHref = null,
  nextCategoryName = null,
  nextDeckHref,
  nextDeckTitle,
  specialtyHref,
  specialtyName,
  audiocardsHref = null,
}: Props) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [groupIdx, setGroupIdx] = useState(0);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [phase, setPhase] = useState<Phase>("play");
  // When set, retry mode: only show cards with IDs in this set (flattened into one group)
  const [retryIds, setRetryIds] = useState<Set<number> | null>(null);

  // In retry mode, present all incorrect cards as a single flat group
  const activeDeck = useMemo<CardGroup[]>(() => {
    if (!retryIds) return groups;
    const wrongCards = groups.flatMap((g) => g.cards).filter((c) => retryIds.has(c.id));
    return [{ position: -1, label: `Refazendo ${retryIds.size} erradas`, cards: wrongCards }];
  }, [groups, retryIds]);

  const group = activeDeck[groupIdx];
  const card = group?.cards[cardIdx];
  const isLastCard = cardIdx === (group?.cards.length ?? 0) - 1;
  const isLastGroup = groupIdx === activeDeck.length - 1;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCardIdx(0);
     
    setFlipped(false);
  }, [groupIdx]);

  useEffect(() => {
    if (retryIds !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroupIdx(0);
       
      setCardIdx(0);
       
      setFlipped(false);
       
      setPhase("play");
    }
  }, [retryIds]);

  const handleAnswer = useCallback(
    (result: Result) => {
      if (!card || phase !== "play") return;
      setResults((prev) => ({ ...prev, [card.id]: result }));
      void recordFlashcardAttempt(card.id, result, sessionId);
      void updateFlashcardSM2(card.id, result);
      if (isLastCard) {
        setPhase(isLastGroup ? "deck-done" : "group-done");
      } else {
        setCardIdx((i) => i + 1);
        setFlipped(false);
      }
    },
    [card, isLastCard, isLastGroup, phase, sessionId],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== "play") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
      } else if (e.code === "ArrowLeft" && flipped) {
        handleAnswer("incorrect");
      } else if (e.code === "ArrowRight" && flipped) {
        handleAnswer("correct");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, phase, handleAnswer]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function goToGroup(i: number) {
    setGroupIdx(i);
    setRetryIds(null);
    setPhase("play");
  }

  function handleNextGroup() {
    setGroupIdx((i) => i + 1);
    setRetryIds(null);
    setPhase("play");
  }

  function handleRestartGroup() {
    setResults((prev) => {
      const next = { ...prev };
      group.cards.forEach((c) => delete next[c.id]);
      return next;
    });
    setCardIdx(0);
    setFlipped(false);
    setPhase("play");
    setRetryIds(null);
  }

  function handleRetryDeck() {
    const wrong = new Set(
      groups.flatMap((g) => g.cards)
        .filter((c) => results[c.id] === "incorrect")
        .map((c) => c.id),
    );
    setRetryIds(wrong);
  }

  function handleRestartDeck() {
    setResults({});
    setGroupIdx(0);
    setCardIdx(0);
    setFlipped(false);
    setRetryIds(null);
    setPhase("play");
  }

  // ── Deck-done summary ─────────────────────────────────────────────────────────
  if (phase === "deck-done") {
    const allCards = groups.flatMap((g) => g.cards);
    const answered = allCards.filter((c) => c.id in results);
    const totalCorrect = answered.filter((c) => results[c.id] === "correct").length;
    const totalWrong = answered.filter((c) => results[c.id] === "incorrect").length;
    const pct = answered.length > 0 ? Math.round((totalCorrect / answered.length) * 100) : 0;

    return (
      <div className="space-y-6 max-w-xl">
        <div className="rounded-xl border border-border bg-surface-1 p-6 text-center space-y-3">
          <div className="text-4xl font-bold tabular-nums text-brand">
            {totalCorrect}
            <span className="text-xl font-normal text-muted-foreground">/{answered.length}</span>
          </div>
          <div className="text-sm text-muted-foreground">acertou ({pct}%)</div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Per-group breakdown */}
        {groups.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Por grupo
            </p>
            {groups.map((g) => {
              const gc = g.cards.filter((c) => results[c.id] === "correct").length;
              const gt = g.cards.filter((c) => c.id in results).length;
              const gpct = gt > 0 ? Math.round((gc / gt) * 100) : 0;
              return (
                <div key={g.position} className="flex items-center gap-3 text-sm">
                  <span className="w-36 truncate text-muted-foreground text-xs">
                    {g.label ?? `Grupo ${g.position}`}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${gpct}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">
                    {gc}/{gt}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-3">
          {/* Primary: continue forward. In a multi-category deck the forward
              action is the next category (falling back to the next deck on the
              last one); the secondary action returns to the category grid. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {nextCategoryHref ? (
              <Link
                href={nextCategoryHref}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
              >
                <span className="truncate">
                  Próximo tema{nextCategoryName ? `: ${nextCategoryName}` : ""}
                </span>
                <span aria-hidden>→</span>
              </Link>
            ) : nextDeckHref ? (
              <Link
                href={nextDeckHref}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
              >
                <span className="truncate">
                  Próximo deck{nextDeckTitle ? `: ${nextDeckTitle}` : ""}
                </span>
                <span aria-hidden>→</span>
              </Link>
            ) : null}
            {gridHref ? (
              <Link
                href={gridHref}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-brand/40 hover:text-brand transition-colors inline-flex items-center justify-center"
              >
                ← Voltar aos temas
              </Link>
            ) : (
              <Link
                href={specialtyHref}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-brand/40 hover:text-brand transition-colors inline-flex items-center justify-center"
              >
                ← Voltar para {specialtyName}
              </Link>
            )}
          </div>

          {/* Secondary: redo this deck */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
            {totalWrong > 0 && (
              <button
                onClick={handleRetryDeck}
                className="hover:text-brand underline-offset-4 hover:underline transition-colors"
              >
                Refazer as erradas ({totalWrong})
              </button>
            )}
            <button
              onClick={handleRestartDeck}
              className="hover:text-brand underline-offset-4 hover:underline transition-colors"
            >
              Recomeçar do zero
            </button>
            <Link
              href={`/app/revisao/sessao?page=${pageId}`}
              className="hover:text-brand underline-offset-4 hover:underline transition-colors"
            >
              Revisar com repetição espaçada
            </Link>
          </div>
        </div>

        {/* Passive AudioCards nudge — optional aid, reached AROUND the flashcard
            loop. Not a review item, not the thing that "finishes" the deck. */}
        {audiocardsHref && (
          <div className="rounded-xl border border-border bg-surface-1 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Headphones size={18} strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  <SiteText k="audiocards.nudge.title" fallback="Fixe ouvindo" />
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  <SiteText
                    k="audiocards.nudge.body"
                    fallback="Os mesmos cartões em áudio, para revisar de novo — no trânsito, na academia, sem olhar a tela."
                  />
                </p>
              </div>
            </div>
            <Link
              href={audiocardsHref}
              className="mt-3 flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-brand/30 bg-brand/5 px-4 text-xs font-semibold text-brand transition-colors hover:bg-brand/10"
            >
              Ouvir AudioCards de {specialtyName}
              <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </div>
    );
  }

  // ── Group-done summary ────────────────────────────────────────────────────────
  if (phase === "group-done") {
    const gc = group.cards.filter((c) => results[c.id] === "correct").length;
    const gw = group.cards.filter((c) => results[c.id] === "incorrect").length;
    const gpct = Math.round((gc / group.cards.length) * 100);

    return (
      <div className="space-y-6 max-w-xl">
        <GroupTabs groups={groups} activeIdx={groupIdx} results={results} onSelect={goToGroup} />

        <div className="rounded-xl border border-border bg-surface-1 p-6 text-center space-y-3">
          <div className="text-4xl font-bold tabular-nums text-brand">
            {gc}
            <span className="text-xl font-normal text-muted-foreground">/{group.cards.length}</span>
          </div>
          <div className="text-sm text-muted-foreground">acertou ({gpct}%)</div>
          <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-brand" style={{ width: `${gpct}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {gw > 0 && (
            <button
              onClick={() => {
                const wrong = new Set(
                  group.cards.filter((c) => results[c.id] === "incorrect").map((c) => c.id),
                );
                setRetryIds(wrong);
              }}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity"
            >
              Refazer as erradas ({gw})
            </button>
          )}
          <button
            onClick={handleNextGroup}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity"
          >
            Próximo grupo →
          </button>
          <button
            onClick={handleRestartGroup}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-brand/40 transition-colors"
          >
            Recomeçar grupo
          </button>
        </div>
      </div>
    );
  }

  // ── Card view ─────────────────────────────────────────────────────────────────
  if (!card) return null;

  const totalAnswered = Object.keys(results).length;
  const totalCorrect = Object.values(results).filter((r) => r === "correct").length;

  return (
    <div className="space-y-5 max-w-xl">
      {/* Back to the category grid (multi-category decks only) */}
      {gridHref && (
        <Link
          href={gridHref}
          className="-my-1 inline-flex items-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-brand transition-colors"
        >
          ← Voltar aos temas
        </Link>
      )}

      {/* SM-2 due-today header */}
      {dueTodayCount != null && totalCards != null && totalCards > 0 && !retryIds && (
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-md bg-surface-1 border border-border">
          <span className="text-muted-foreground">
            <span className="font-semibold text-brand tabular-nums">{dueTodayCount}</span>
            {" "}para revisar hoje
            {dueTodayCount < totalCards && (
              <span className="opacity-60"> · {totalCards - dueTodayCount} já dominadas</span>
            )}
          </span>
          <span className="text-muted-foreground/70 font-mono text-[10px]">
            SM-2
          </span>
        </div>
      )}

      <GroupTabs groups={groups} activeIdx={groupIdx} results={results} onSelect={goToGroup} />

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {retryIds
              ? <span className="text-brand font-medium mr-1">Refazendo erradas —</span>
              : null}
            Card {cardIdx + 1} de {group.cards.length}
            {!retryIds && group.label && (
              <span className="ml-1.5 opacity-60">· {group.label}</span>
            )}
          </span>
          <span>{totalCorrect}/{totalAnswered} acertos</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${(cardIdx / group.cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Flip card — CSS 3D transform */}
      <div style={{ perspective: "1200px" }}>
        <div
          key={card.id}
          className="relative w-full rounded-xl"
          style={{
            minHeight: "13rem",
            transformStyle: "preserve-3d",
            transition: "transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
          onClick={() => { if (!flipped) setFlipped(true); }}
        >
          {/* Front face */}
          <div
            className="absolute inset-0 rounded-xl border border-border bg-surface-1 p-6 flex flex-col items-center justify-center text-center gap-3 cursor-pointer hover:border-brand/40 hover:bg-surface-2 transition-colors"
            style={{ backfaceVisibility: "hidden" }}
          >
            {card.image_url && (
              <div className="w-full rounded overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.image_url}
                  alt=""
                  className="w-full max-h-40 object-contain bg-white dark:bg-neutral-100"
                />
              </div>
            )}
            <EditableText
              variant="rich"
              table="flashcard_items"
              id={card.id}
              field="text"
              className="text-foreground [&_p]:mb-2 [&_strong]:font-semibold"
              html={safe(card.text)}
              editHtml={card.text}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Clique para ver · <kbd className="font-sans">Espaço</kbd>
            </p>
          </div>

          {/* Back face */}
          <div
            className="absolute inset-0 rounded-xl border border-brand/30 bg-surface-1 p-6 flex flex-col items-center justify-center text-center gap-3 overflow-y-auto"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <EditableText
              variant="rich"
              table="flashcard_items"
              id={card.id}
              field="answer"
              className="text-foreground [&_p]:mb-2 [&_strong]:font-semibold"
              html={safe(card.answer)}
              editHtml={card.answer}
            />
            {card.tip && (
              <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-1 italic w-full text-center">
                {card.tip}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Answer buttons */}
      {flipped && (
        <>
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer("incorrect")}
              className="flex-1 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
            >
              ← Errei
            </button>
            <button
              onClick={() => handleAnswer("correct")}
              className="flex-1 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors"
            >
              Acertei →
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            ← / → para responder com o teclado
          </p>
        </>
      )}
    </div>
  );
}

// ── Group tab bar ──────────────────────────────────────────────────────────────

function GroupTabs({
  groups,
  activeIdx,
  results,
  onSelect,
}: {
  groups: CardGroup[];
  activeIdx: number;
  results: Record<number, Result>;
  onSelect: (i: number) => void;
}) {
  if (groups.length <= 1) return null;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      {groups.map((g, i) => {
        const done = g.cards.every((c) => c.id in results);
        const correct = g.cards.filter((c) => results[c.id] === "correct").length;
        const pct = done ? Math.round((correct / g.cards.length) * 100) : null;
        const active = i === activeIdx;

        return (
          <button
            key={g.position}
            onClick={() => onSelect(i)}
            className={[
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
              active
                ? "bg-brand text-brand-fg"
                : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3",
            ].join(" ")}
          >
            {g.label ?? `Grupo ${g.position}`}
            {pct !== null && (
              <span className="ml-1.5 opacity-75">{pct}%</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
