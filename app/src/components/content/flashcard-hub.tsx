import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getSpecialtyAccent } from "@/components/content/specialty-icon";

export interface CategoryCardData {
  slug: string;
  label: string;
  total: number; // cards in this group
  due: number; // cards due for review today (SM-2)
  answered: number; // distinct cards with at least one attempt
  correctLatest: number; // of those, how many were correct on the latest attempt
}

// Category-selection grid for a flashcard deck. Mirrors the quiz hub's TopicCard
// look (accent bar + chevron + meta line) so flashcards line up with the other
// study-subject pages. Each card deep-links to ?grupo=<slug> on the same page.
export function FlashcardHub({
  basePath,
  specialtySlug,
  categories,
  dueTodayCount,
  totalCards,
}: {
  basePath: string;
  specialtySlug: string;
  categories: CategoryCardData[];
  dueTodayCount: number;
  totalCards: number;
}) {
  const accent = getSpecialtyAccent(specialtySlug);

  return (
    <div className="space-y-5">
      {/* Deck-wide SM-2 banner — same data as the in-player header */}
      {totalCards > 0 && (
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-md bg-surface-1 border border-border">
          <span className="text-muted-foreground">
            <span className="font-semibold text-brand tabular-nums">{dueTodayCount}</span>{" "}
            para revisar hoje
            {dueTodayCount < totalCards && (
              <span className="opacity-60"> · {totalCards - dueTodayCount} já dominadas</span>
            )}
          </span>
          <span className="text-muted-foreground/70 font-mono text-[10px]">SM-2</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 sm:gap-4">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            href={`${basePath}?grupo=${encodeURIComponent(cat.slug)}`}
            className="group relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-all duration-150 hover:-translate-y-px hover:ring-foreground/20 hover:shadow-sm"
          >
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl transition-[width] duration-150 group-hover:w-1"
              style={{ background: accent }}
            />
            <div className="flex h-full flex-col justify-between gap-3 pl-4 pr-3 py-3.5 sm:py-4">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium leading-snug text-foreground group-hover:text-brand transition-colors">
                  {cat.label}
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0 text-muted-foreground/60 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-brand"
                />
              </div>
              <CategoryMeta cat={cat} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function CategoryMeta({ cat }: { cat: CategoryCardData }) {
  const pct =
    cat.answered > 0 ? Math.round((cat.correctLatest / cat.answered) * 100) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums">
      <span className="text-muted-foreground">
        {cat.total} {cat.total === 1 ? "card" : "cards"}
      </span>
      {cat.due > 0 && (
        <>
          <span className="text-muted-foreground/40" aria-hidden="true">·</span>
          <span className="font-medium text-brand">{cat.due} para revisar</span>
        </>
      )}
      {pct !== null && (
        <>
          <span className="text-muted-foreground/40" aria-hidden="true">·</span>
          <span
            className={
              "rounded-full px-1.5 py-0.5 font-medium " +
              (pct >= 70
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : pct >= 50
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-300")
            }
            title={`${cat.correctLatest} de ${cat.answered} respondidas`}
          >
            {pct}%
          </span>
        </>
      )}
    </div>
  );
}
