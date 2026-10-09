"use client";

import { useState, type ReactNode } from "react";
import { useSiteContent } from "@/components/landing/site-text";
import { isSalesImageUrl, type SalesImageKey } from "@/lib/clinact/sales-images";

/**
 * A screenshot slot on the sales page. Renders only when the admin has set an
 * image (see /admin/clinact/pagina); otherwise nothing at all — not even the
 * caption, which describes the picture.
 *
 * A portrait image is a phone screenshot and gets THE phone: every demo on the
 * page shares one frame, one aspect ratio and one width (Karina, 2026-10-08:
 * "padronizar as molduras, proporções e tamanhos"), with a soft glow behind it
 * in `glow`, like the Revalida page. The screenshot fills the screen from the
 * top, so a capture a few pixels off the 390×844 ratio still lines up. A
 * landscape image keeps the full width instead — squeezed into a phone it
 * would be unreadable. Orientation is only known once the image loads, so
 * until then it renders as a phone (the common case).
 */
export function SiteImage({
  k,
  alt,
  caption,
  glow = "var(--brand)",
}: {
  k: SalesImageKey;
  alt: string;
  caption?: ReactNode;
  glow?: string;
}) {
  const url = useSiteContent()[k]?.value;
  const [landscape, setLandscape] = useState(false);
  if (!isSalesImageUrl(url)) return null;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded CDN image of unknown size
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={landscape ? "block h-auto w-full" : "block h-full w-full object-cover object-top"}
      onLoad={(e) => setLandscape(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight)}
    />
  );

  return (
    <figure className={landscape ? "w-full" : "relative isolate mx-auto w-full max-w-[272px]"}>
      {landscape ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">{img}</div>
      ) : (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[42%] -z-10 h-[80%] w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: `color-mix(in srgb, ${glow} 34%, transparent)` }}
          />
          <div
            className="rounded-[2.4rem] border border-border bg-surface-0 p-[7px]"
            style={{ boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 56px color-mix(in srgb, ${glow} 24%, transparent)` }}
          >
            <div className="aspect-[390/844] overflow-hidden rounded-[2rem] bg-surface-1">{img}</div>
          </div>
        </>
      )}
      {caption ? (
        <figcaption className="mx-auto mt-5 max-w-[34ch] text-center text-sm leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
