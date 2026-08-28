import { cn } from "@/lib/utils";
import type { Media } from "@/lib/clinact/types";

/** Plain authored text → paragraphs. No HTML is ever interpreted. */
export function Prose({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const paras = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-3 text-[15px] leading-relaxed sm:text-base", className)}>
      {paras.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

/** One media object, member-facing. Framed subtly (dark-mode media rule). */
export function MediaView({ media, className }: { media: Media; className?: string }) {
  if (!media.url) {
    return (
      <div className={cn("rounded-lg border border-dashed border-border bg-surface-1 p-4 text-sm text-muted-foreground", className)}>
        Mídia ainda não disponível{media.file ? ` (${media.file})` : ""}.
      </div>
    );
  }
  if (media.type === "audio") {
    return (
      <figure className={cn("rounded-lg border border-border bg-surface-1 p-3", className)}>
        <audio controls preload="none" src={media.url} className="w-full" />
        {media.caption ? <figcaption className="mt-2 text-sm text-muted-foreground">{media.caption}</figcaption> : null}
        {media.transcript ? (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">Transcrição</summary>
            <p className="mt-1">{media.transcript}</p>
          </details>
        ) : null}
      </figure>
    );
  }
  if (media.type === "video") {
    return (
      <figure className={cn("rounded-lg border border-border bg-surface-1 p-2", className)}>
        <video controls preload="metadata" src={media.url} className="w-full rounded" />
        {media.caption ? <figcaption className="mt-2 px-1 text-sm text-muted-foreground">{media.caption}</figcaption> : null}
      </figure>
    );
  }
  return (
    <figure className={cn("rounded-lg border border-border bg-surface-1 p-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media.url} alt={media.alt ?? media.caption ?? ""} className="mx-auto max-h-[70vh] w-auto max-w-full rounded" loading="lazy" />
      {media.caption ? <figcaption className="mt-2 px-1 text-sm text-muted-foreground">{media.caption}</figcaption> : null}
    </figure>
  );
}
