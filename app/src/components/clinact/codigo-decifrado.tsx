import { cn } from "@/lib/utils";
import type { ClueDoc } from "@/lib/clinact/types";
import { MediaView } from "./prose";
import { KeyRound, Link2, Unlink } from "lucide-react";

/**
 * Código Decifrado — the generated closing map of a Código Clínico case
 * (never authored; §2 "two blocks are system-generated").
 *
 * Renders from the clues alone: `cluster` (grupo:) draws the links — clues
 * sharing a cluster appear connected; red herrings (distrator:) are dimmed
 * with their reason beside them. The centre is the case's CHAVE FINAL, which
 * is not necessarily a diagnosis. One layout for every case; mobile-first
 * (vertical map, no SVG).
 */
export function CodigoDecifrado({ clues, finalKey }: { clues: ClueDoc[]; finalKey: string | null }) {
  if (!clues.length) return null;
  const real = clues.filter((c) => !c.is_red_herring);
  const herrings = clues.filter((c) => c.is_red_herring);

  // Group by cluster; clues without a group stand alone.
  const clusters = new Map<string, ClueDoc[]>();
  const loose: ClueDoc[] = [];
  for (const c of real) {
    if (c.cluster) clusters.set(c.cluster, [...(clusters.get(c.cluster) ?? []), c]);
    else loose.push(c);
  }

  return (
    <section aria-label="Código Decifrado">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">Código Decifrado</p>

      {/* Centre: the final key */}
      <div className="rounded-2xl border-2 border-brand bg-brand/10 p-4 text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand">
          <KeyRound className="h-3.5 w-3.5" /> Chave final
        </p>
        <p className="mt-1 text-lg font-bold leading-snug">{finalKey ?? "—"}</p>
      </div>

      {/* Connected clusters */}
      <div className="mt-1 space-y-1">
        {[...clusters.entries()].map(([key, group]) => (
          <div key={key} className="relative pl-5 pt-3">
            {/* connector to the centre */}
            <span aria-hidden className="absolute left-2 top-0 h-full w-px bg-brand/40" />
            <div className="rounded-xl border border-brand/30 bg-surface-1 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-brand">
                <Link2 className="h-3.5 w-3.5" /> Pistas que se explicam juntas
              </p>
              <ul className="space-y-2">
                {group.map((c) => (
                  <ClueRow key={c.id ?? c.position} clue={c} />
                ))}
              </ul>
            </div>
          </div>
        ))}
        {loose.length ? (
          <div className="relative pl-5 pt-3">
            <span aria-hidden className="absolute left-2 top-0 h-full w-px bg-border" />
            <div className="rounded-xl border border-border bg-surface-1 p-3">
              <ul className="space-y-2">
                {loose.map((c) => (
                  <ClueRow key={c.id ?? c.position} clue={c} />
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      {/* Red herrings — dimmed, with the reason they do not close the case */}
      {herrings.length ? (
        <div className="mt-3 rounded-xl border border-dashed border-border p-3 opacity-75">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Unlink className="h-3.5 w-3.5" /> Não fecham o caso
          </p>
          <ul className="space-y-2">
            {herrings.map((c) => (
              <li key={c.id ?? c.position} className="text-sm">
                <span className="text-muted-foreground line-through decoration-border">{c.label}</span>
                {c.red_herring_reason ? <span className="ml-1.5 text-xs italic text-muted-foreground">— {c.red_herring_reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ClueRow({ clue }: { clue: ClueDoc }) {
  return (
    <li className={cn("text-[15px] leading-snug")}>
      <span className="font-medium">{clue.label}</span>
      {clue.category ? <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{clue.category}</span> : null}
      {clue.detail ? <span className="block text-sm text-muted-foreground">{clue.detail}</span> : null}
      {clue.media ? <MediaView media={clue.media} className="mt-2" /> : null}
    </li>
  );
}
