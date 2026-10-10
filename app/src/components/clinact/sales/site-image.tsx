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
 * page shares one device (Karina, 2026-10-08: "padronizar as molduras,
 * proporções e tamanhos"), with a soft glow behind it in `glow`. A landscape
 * image keeps the full width instead — squeezed into a phone it would be
 * unreadable. Orientation is only known once the image loads, so until then it
 * renders as a phone (the common case).
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

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) =>
    setLandscape(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight);

  return (
    <figure className={landscape ? "w-full" : "relative isolate mx-auto w-full max-w-[284px]"}>
      {landscape ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded CDN image of unknown size */}
          <img src={url} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full" onLoad={onLoad} />
        </div>
      ) : (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[42%] -z-10 h-[80%] w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: `color-mix(in srgb, ${glow} 34%, transparent)` }}
          />
          <PhoneDevice glow={glow}>
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded CDN image of unknown size */}
            <img src={url} alt={alt} loading="lazy" decoding="async" className="block h-full w-full object-cover object-top" onLoad={onLoad} />
          </PhoneDevice>
        </>
      )}
      {caption ? (
        <figcaption className="mx-auto mt-6 max-w-[34ch] text-center text-sm leading-relaxed text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/**
 * A modern phone around a screenshot (Justin, 2026-10-10: "on a real phone the
 * display does not go 100% to the edges"). Titanium edge → black bezel → a
 * screen with its own rounded corners, the iOS status bar with the Dynamic
 * Island, the home indicator, the side buttons and a faint glass reflection.
 *
 * Island, status bar and clock follow a 393 pt-wide phone and are expressed in
 * `cqw` (the screen is a size container), so they scale with the device at
 * every width. The screen is as tall as the status bar plus the whole capture. The screenshots are captures of the LIGHT app
 * (her decision), whose header is `--mk-card`: the status bar uses the same
 * token, so it reads as part of the app's top edge. The capture starts at the
 * app header, so it sits BELOW the status bar — as an app does on a real phone.
 */
function PhoneDevice({ children, glow }: { children: ReactNode; glow: string }) {
  return (
    <div className="lp-device relative px-[3px]">
      {/* Side buttons: action + volume on the left, power on the right. */}
      <span aria-hidden className="absolute left-0 top-[17%] h-[4.5%] w-[3px] rounded-l-sm" style={{ background: "var(--dv-button)" }} />
      <span aria-hidden className="absolute left-0 top-[25%] h-[8.5%] w-[3px] rounded-l-sm" style={{ background: "var(--dv-button)" }} />
      <span aria-hidden className="absolute left-0 top-[35.5%] h-[8.5%] w-[3px] rounded-l-sm" style={{ background: "var(--dv-button)" }} />
      <span aria-hidden className="absolute right-0 top-[28%] h-[13%] w-[3px] rounded-r-sm" style={{ background: "var(--dv-button)" }} />

      {/* Titanium edge */}
      <div
        className="rounded-[46px] p-[2.5px]"
        style={{
          background: "var(--dv-frame)",
          boxShadow: `0 34px 80px rgba(0,0,0,0.6), 0 0 60px color-mix(in srgb, ${glow} 22%, transparent)`,
        }}
      >
        {/* Bezel — the black border between the edge and the display */}
        <div className="rounded-[43.5px] p-[9px]" style={{ background: "var(--dv-bezel)" }}>
          {/* Display */}
          <div
            className="lp-mockup-light @container relative overflow-hidden rounded-[34px]"
            // The status bar (13.7cqw) plus a full 390×844 capture (216.4cqw) —
            // nothing of the screenshot is cropped, not even its bottom bar.
            style={{ aspectRatio: "390 / 897", background: "var(--mk-card)" }}
          >
            <StatusBar />
            <div className="absolute inset-x-0 bottom-0" style={{ top: "13.7cqw" }}>
              {children}
            </div>
            {/* Home indicator */}
            <span
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 rounded-full"
              style={{ bottom: "2.2cqw", width: "35cqw", height: "1.3cqw", background: "var(--mk-text)", opacity: 0.82 }}
            />
            {/* Glass */}
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "var(--dv-glare)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** iOS-style status bar: clock, Dynamic Island, signal / Wi-Fi / battery. Decorative. */
function StatusBar() {
  return (
    <div
      aria-hidden
      className="relative flex items-center justify-between font-semibold tabular-nums"
      style={{ height: "13.7cqw", padding: "0 7.4cqw 0 8.6cqw", color: "var(--mk-text)", fontSize: "4.1cqw", letterSpacing: "-0.02em" }}
    >
      <span>9:41</span>
      <span
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{ top: "2.9cqw", width: "31.5cqw", height: "9.3cqw", background: "var(--dv-bezel)" }}
      />
      <span className="flex items-center" style={{ gap: "1.5cqw" }}>
        <svg viewBox="0 0 18 12" style={{ width: "4.6cqw" }} fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="10" y="3" width="3" height="9" rx="0.8" />
          <rect x="15" y="0" width="3" height="12" rx="0.8" />
        </svg>
        <svg viewBox="0 0 16 12" style={{ width: "4.2cqw" }} fill="currentColor">
          <path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.4 10.4 0 0 0 8 .3 10.4 10.4 0 0 0 .5 3.4l1.3 1.3A8.6 8.6 0 0 1 8 2.2Zm0 3.7c1.4 0 2.7.5 3.6 1.4l1.3-1.3A7 7 0 0 0 8 4a7 7 0 0 0-4.9 2l1.3 1.3A5.1 5.1 0 0 1 8 5.9Zm0 3.6c-.5 0-1 .2-1.3.6L8 11.7l1.3-1.6A1.8 1.8 0 0 0 8 9.5Z" />
        </svg>
        <svg viewBox="0 0 27 13" style={{ width: "6.6cqw" }}>
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" strokeOpacity="0.4" />
          <rect x="2.2" y="2.2" width="19.6" height="8.6" rx="2.2" fill="currentColor" />
          <path d="M25 4.3v4.4c.9-.3 1.5-1.2 1.5-2.2s-.6-1.9-1.5-2.2Z" fill="currentColor" fillOpacity="0.45" />
        </svg>
      </span>
    </div>
  );
}
