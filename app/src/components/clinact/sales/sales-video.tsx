"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Play } from "lucide-react";
import { useSiteContent } from "@/components/landing/site-text";
import { VIDEO_MILESTONES, trackVideoPlay, trackVideoProgress, trackVideoStart } from "@/lib/analytics/track";
import { loadYouTubeApi, type YTPlayer } from "@/lib/youtube-api";
import { SALES_VIDEO_KEY, isYouTubeId, youTubeThumbnail } from "@/lib/clinact/sales-video";
import { isSalesImageUrl } from "@/lib/clinact/sales-images";

/**
 * "Conheça o ClinAct por dentro" (Karina 2026-10-30): the presentation video,
 * centred, landscape, as wide as the four format cards below it, with a cover
 * from the platform and a clearly visible play button.
 *
 * Same click-to-load facade as the Revalida hero video: nothing from YouTube
 * loads until the visitor presses play — the frame is our cover image — then
 * the IFrame API mounts the real player (youtube-nocookie) and reports watch
 * milestones to GA4 under location "clinact".
 *
 * Renders NOTHING — not even the band or the title passed as `children` —
 * until a YouTube id is set in /admin/clinact/pagina (lib/clinact/sales-video.ts).
 */

const LOCATION = "clinact";

export function SalesVideo({ className, style, children }: { className: string; style: CSSProperties; children: ReactNode }) {
  const content = useSiteContent();
  const id = content[SALES_VIDEO_KEY]?.value;
  const uploaded = content["clinact.video.image"]?.value;
  const playerHostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"poster" | "playing" | "fallback">("poster");
  // maxresdefault does not exist for every video; fall back to hqdefault once.
  const [thumb, setThumb] = useState<"maxresdefault" | "hqdefault">("maxresdefault");

  useEffect(() => {
    if (mode !== "playing" || !isYouTubeId(id)) return;
    const host = playerHostRef.current;
    if (!host) return;
    let player: YTPlayer | null = null;
    let timer: number | undefined;
    let cancelled = false;
    const sent = new Set<number>();

    const tick = () => {
      if (!player) return;
      const d = player.getDuration();
      if (!d) return;
      const pct = (player.getCurrentTime() / d) * 100;
      for (const m of VIDEO_MILESTONES) {
        if (pct >= m && !sent.has(m)) {
          sent.add(m);
          trackVideoProgress(m, LOCATION);
        }
      }
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        const mount = document.createElement("div");
        host.appendChild(mount);
        player = new YT.Player(mount, {
          host: "https://www.youtube-nocookie.com",
          videoId: id,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, rel: 0, playsinline: 1, cc_lang_pref: "pt", hl: "pt-BR", origin: window.location.origin },
          events: {
            onReady: (e) => e.target.playVideo(),
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING) {
                if (!sent.has(0)) {
                  sent.add(0);
                  trackVideoStart(LOCATION);
                }
                window.clearInterval(timer);
                timer = window.setInterval(tick, 1000);
              } else {
                window.clearInterval(timer);
                tick();
              }
              if (e.data === YT.PlayerState.ENDED && !sent.has(100)) {
                sent.add(100);
                trackVideoProgress(100, LOCATION);
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setMode("fallback");
      });

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      player?.destroy();
    };
  }, [mode, id]);

  if (!isYouTubeId(id)) return null;
  const cover = isSalesImageUrl(uploaded) ? uploaded : youTubeThumbnail(id, thumb);

  return (
    <section className={className} style={style}>
      <div className="mx-auto max-w-4xl">
        {children}
        <div
          className="relative mt-10 aspect-video overflow-hidden rounded-2xl border"
          style={{
            borderColor: "color-mix(in srgb, var(--brand-text) 32%, transparent)",
            background: "var(--lp-alt)",
            boxShadow: "0 40px 120px -40px color-mix(in srgb, var(--brand) 70%, transparent)",
          }}
        >
          {mode === "poster" ? (
            <button
              type="button"
              onClick={() => {
                trackVideoPlay(LOCATION);
                setMode("playing");
              }}
              className="group absolute inset-0 block h-full w-full cursor-pointer"
              aria-label="Assistir ao vídeo: conheça o ClinAct por dentro"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- CDN cover or YouTube thumbnail */}
              <img
                src={cover}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setThumb("hqdefault")}
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* Dims the bright UI so the button reads; darkest at the foot. */}
              <span
                aria-hidden
                className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-80"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 60% at 50% 50%, color-mix(in srgb, var(--lp-base) 40%, transparent), color-mix(in srgb, var(--lp-base) 18%, transparent) 70%), linear-gradient(to top, color-mix(in srgb, var(--lp-base) 55%, transparent), transparent 40%)",
                }}
              />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2 motion-safe:animate-ping"
                  style={{ borderColor: "color-mix(in srgb, var(--brand-text) 70%, transparent)", animationDuration: "2.2s" }}
                />
                <span
                  className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand text-brand-fg transition-transform duration-300 group-hover:scale-110 group-active:scale-95 sm:h-[88px] sm:w-[88px]"
                  style={{
                    boxShadow:
                      "0 0 0 8px color-mix(in srgb, var(--brand) 22%, transparent), 0 14px 40px color-mix(in srgb, var(--brand) 60%, transparent)",
                  }}
                >
                  <Play className="ml-1 h-7 w-7 fill-current sm:h-9 sm:w-9" strokeWidth={1.5} />
                </span>
              </span>
            </button>
          ) : mode === "playing" ? (
            <div ref={playerHostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
          ) : (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&hl=pt-BR&cc_lang_pref=pt`}
              title="ClinAct por dentro"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          )}
        </div>
      </div>
    </section>
  );
}
