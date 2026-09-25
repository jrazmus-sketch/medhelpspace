"use client";

import { useSiteContent } from "@/components/landing/site-text";
import { isSalesImageUrl, type SalesImageKey } from "@/lib/clinact/sales-images";

/**
 * A screenshot slot on the sales page. Renders only when the admin has set an
 * image (see /admin/clinact/pagina); otherwise nothing at all.
 */
export function SiteImage({ k, alt }: { k: SalesImageKey; alt: string }) {
  const url = useSiteContent()[k]?.value;
  if (!isSalesImageUrl(url)) return null;
  return (
    <figure className="mt-6 overflow-hidden rounded-xl border border-border bg-surface-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded CDN image of unknown size */}
      <img src={url} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full" />
    </figure>
  );
}
