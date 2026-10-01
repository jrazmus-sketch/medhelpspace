"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { Play } from "lucide-react";
import { SiteText } from "./site-text";
import { trackVideoPlay, trackVideoProgress } from "@/lib/analytics/track";

/*
 * The sales video (Karina's narration, 2:42) in the hero, where the in-hand phone
 * screenshot used to be.
 *
 * Nothing from YouTube loads until the visitor presses play: the frame shows our own
 * poster and a 9 s silent highlights loop served from /public (680 KB, fetched only
 * once the frame scrolls into view). That keeps YouTube's ~1 MB of player JS and its
 * cookies off the page for everyone who never clicks — this is the Google Ads landing
 * page, so load time is money. On click the YouTube IFrame API mounts the real player
 * (privacy-enhanced youtube-nocookie host) and reports watch milestones to GA4.
 *
 * Desktop: the frame lies back on the hero's tilted ECG grid and straightens as the
 * visitor scrolls to it. Phones and prefers-reduced-motion: flat, no tilt, no loop.
 */

export const HERO_VIDEO_ID = "FhBSfjYIrqs";
const LOOP_SRC = "/landing/video/hero-loop.mp4";
const POSTER_SRC = "/landing/video/hero-poster.webp";
const DURATION_LABEL = "2:42";

type YTPlayer = {
  playVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApi: Promise<YTNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once per page; rejects after 8 s (blocked/offline). */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApi) return ytApi;
  ytApi = new Promise<YTNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("youtube api timeout")), 8000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("youtube api missing"));
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("youtube api blocked"));
    };
    document.head.appendChild(s);
  }).catch((e) => {
    ytApi = null; // let a later click retry
    throw e;
  });
  return ytApi;
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

export function HeroVideo() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const isDesktop = useIsDesktop();
  const tilt = isDesktop && !reduceMotion;

  // "playing" = the YouTube player replaced the poster; "fallback" = the API was
  // blocked, so a plain autoplay iframe stands in (no milestone tracking).
  const [mode, setMode] = useState<"poster" | "playing" | "fallback">("poster");
  const [loopReady, setLoopReady] = useState(false);

  // Lies back on the ECG grid, straightens as its top climbs to 35% of the viewport.
  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ["start end", "start 0.35"] });
  const eased = useSpring(scrollYProgress, { stiffness: 140, damping: 32, mass: 0.6 });
  const rotateX = useTransform(eased, [0, 1], [tilt ? 24 : 0, 0]);
  const scale = useTransform(eased, [0, 1], [tilt ? 0.9 : 1, 1]);

  // Silent loop: fetch + play only while the frame is on screen, never for
  // reduced-motion or data-saver visitors (they keep the still poster).
  useEffect(() => {
    const v = loopRef.current;
    const wrap = wrapRef.current;
    if (!v || !wrap || mode !== "poster") return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduceMotion || saveData) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (v.preload !== "auto") {
            v.preload = "auto";
            v.src = LOOP_SRC;
          }
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, [mode, reduceMotion]);

  // Mount the real player after the click.
  useEffect(() => {
    if (mode !== "playing") return;
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
      for (const m of [25, 50, 75] as const) {
        if (pct >= m && !sent.has(m)) {
          sent.add(m);
          trackVideoProgress(m, "hero");
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
          videoId: HERO_VIDEO_ID,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            rel: 0, // end-screen suggestions only from our own channel
            playsinline: 1,
            cc_lang_pref: "pt",
            hl: "pt-BR",
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => e.target.playVideo(),
            onStateChange: (e) => {
              if (e.data === YT.PlayerState.PLAYING) {
                window.clearInterval(timer);
                timer = window.setInterval(tick, 1000);
              } else {
                window.clearInterval(timer);
                tick();
              }
              if (e.data === YT.PlayerState.ENDED && !sent.has(100)) {
                sent.add(100);
                trackVideoProgress(100, "hero");
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
  }, [mode]);

  function start() {
    trackVideoPlay("hero");
    loopRef.current?.pause();
    setMode("playing");
  }

  return (
    <div
      ref={wrapRef}
      id="video-vendas"
      className="relative mt-12 w-full max-w-[1000px] pb-16 sm:mt-16 md:pb-24"
      style={{ zIndex: 6 }}
    >
      {/* Brand glow pooling under the frame */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-6%] bottom-[6%] top-[22%] -z-10"
        style={{
          background: "radial-gradient(ellipse 55% 60% at 50% 55%, rgba(122,29,145,0.55), rgba(122,29,145,0) 70%)",
          filter: "blur(30px)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.85, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ perspective: 1600 }}
      >
        <motion.div style={{ rotateX, scale, transformOrigin: "50% 100%" }}>
          {/* Dark glass bezel: keeps the light-mode video from glaring on the dark hero */}
          <div
            className="rounded-[18px] p-[5px] sm:rounded-[24px] sm:p-[9px]"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.04))",
              border: "1px solid rgba(192,132,232,0.32)",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.03), 0 40px 90px rgba(0,0,0,0.65), 0 0 90px rgba(122,29,145,0.35)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <div className="relative aspect-video overflow-hidden rounded-[13px] bg-[#0b0618] sm:rounded-[16px]">
              {mode === "poster" ? (
                <button
                  type="button"
                  onClick={start}
                  className="group absolute inset-0 block h-full w-full cursor-pointer text-left"
                  aria-label={`Assistir ao vídeo: a MedHelpSpace por dentro (${DURATION_LABEL})`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={POSTER_SRC}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <video
                    ref={loopRef}
                    muted
                    loop
                    playsInline
                    preload="none"
                    aria-hidden="true"
                    tabIndex={-1}
                    onPlaying={() => setLoopReady(true)}
                    className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
                    style={{ opacity: loopReady ? 1 : 0 }}
                  />
                  {/* Scrim: dims the bright UI so the button reads, darkest at the edges */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-80"
                    style={{
                      background:
                        "radial-gradient(ellipse 60% 60% at 50% 50%, rgba(8,3,26,0.42), rgba(8,3,26,0.2) 70%), linear-gradient(to top, rgba(8,3,26,0.55), transparent 40%)",
                    }}
                  />
                  {/* Play button with a soft pulse ring */}
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    {!reduceMotion ? (
                      <motion.span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full"
                        style={{ border: "2px solid rgba(192,132,232,0.75)" }}
                        animate={{ scale: [1, 1.55], opacity: [0.7, 0] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                      />
                    ) : null}
                    <span
                      className="relative flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110 group-active:scale-95 sm:h-[88px] sm:w-[88px]"
                      style={{
                        background: "var(--brand)",
                        border: "1px solid rgba(255,255,255,0.28)",
                        boxShadow: "0 0 0 8px rgba(122,29,145,0.22), 0 14px 40px rgba(122,29,145,0.6)",
                      }}
                    >
                      <Play className="ml-1 h-7 w-7 fill-white text-white sm:h-9 sm:w-9" strokeWidth={1.5} />
                    </span>
                  </span>
                  <span
                    className="absolute bottom-2.5 right-2.5 rounded-md px-2 py-1 text-xs font-medium text-white/90 sm:bottom-4 sm:right-4 sm:text-sm"
                    style={{ fontFamily: "var(--font-geist-mono)", background: "rgba(8,3,26,0.68)" }}
                  >
                    {DURATION_LABEL}
                  </span>
                </button>
              ) : mode === "playing" ? (
                <div ref={playerHostRef} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
              ) : (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${HERO_VIDEO_ID}?autoplay=1&rel=0&playsinline=1&hl=pt-BR&cc_lang_pref=pt`}
                  title="MedHelpSpace — o sistema por dentro"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full"
                />
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      <p
        className="mt-5 text-center text-sm sm:mt-6 sm:text-base"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        <SiteText as="span" k="hero.video_caption" fallback="Veja o sistema por dentro em menos de 3 minutos." />
      </p>
    </div>
  );
}
