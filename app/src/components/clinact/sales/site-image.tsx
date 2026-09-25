"use client";

import { useState } from "react";
import { useSiteContent } from "@/components/landing/site-text";
import { isSalesImageUrl, type SalesImageKey } from "@/lib/clinact/sales-images";

/**
 * A screenshot slot on the sales page. Renders only when the admin has set an
 * image (see /admin/clinact/pagina); otherwise nothing at all.
 *
 * A portrait image is a phone screenshot: it is shown at phone size, centred,
 * with a device-like rounded frame — stretched to the column it would be a
 * page-and-a-half tall on a laptop. A landscape image keeps the full width.
 * Orientation is only known once the image loads, so until then it renders
 * at phone size (the common case) rather than jumping from wide to narrow.
 */
export function SiteImage({ k, alt }: { k: SalesImageKey; alt: string }) {
  const url = useSiteContent()[k]?.value;
  const [landscape, setLandscape] = useState(false);
  if (!isSalesImageUrl(url)) return null;
  return (
    <figure
      className={
        landscape
          ? "mt-8 overflow-hidden rounded-xl border border-border bg-surface-1"
          : "mx-auto mt-8 w-full max-w-[320px] overflow-hidden rounded-[2rem] border-[6px] border-surface-2 bg-surface-1 shadow-2xl shadow-brand/10"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded CDN image of unknown size */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full"
        onLoad={(e) => setLandscape(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight)}
      />
    </figure>
  );
}
