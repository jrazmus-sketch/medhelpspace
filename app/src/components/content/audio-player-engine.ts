"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { saveLessonPosition } from "@/actions/lesson-progress";

// ── Shared constants ──────────────────────────────────────────────────────────

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export const SKIP_SECONDS = 15;
const AUTO_ADVANCE_COUNTDOWN = 3;
const AUTO_ADVANCE_KEY = "mhs:audio:auto-advance";
const AUTOPLAY_FLAG_KEY = "mhs:audio:autoplay-next";

/** Procedurally generated bar heights for the waveform scrubber.
 *  Visual only; presentation components decide whether to use these. */
export const BARS = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  const h =
    0.4 * Math.sin(t * Math.PI * 3.7 + 0.5) +
    0.25 * Math.sin(t * Math.PI * 7.3 + 1.2) +
    0.2 * Math.sin(t * Math.PI * 11.1 + 2.8) +
    0.15 * Math.cos(t * Math.PI * 19.4 + 0.7);
  return Math.round(12 + 80 * ((h + 1) / 2));
});

export function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export type AudioPlayerEngineOptions = {
  src: string;
  lessonId?: number;
  initialPosition?: number;
  sectionTitle?: string;
  albumName?: string;
  /** Used as Media Session artist fallback. */
  mediaArtist?: string;
  nextHref?: string | null;
  prevHref?: string | null;
};

export function useAudioPlayerEngine(opts: AudioPlayerEngineOptions) {
  const {
    src,
    lessonId,
    initialPosition = 0,
    sectionTitle,
    albumName,
    mediaArtist,
    nextHref,
    prevHref,
  } = opts;

  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const completedFiredRef = useRef(false);
  const seekRestoredRef = useRef(false);
  const lessonIdRef = useRef(lessonId);
  const initialPositionRef = useRef(initialPosition);
  const lastSavedRef = useRef(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevSrcRef = useRef<string | null>(null);
  useLayoutEffect(() => { lessonIdRef.current = lessonId; }, [lessonId]);
  useLayoutEffect(() => { initialPositionRef.current = initialPosition; }, [initialPosition]);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Load auto-advance preference from localStorage after mount (avoid hydration mismatch)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(AUTO_ADVANCE_KEY);
    if (stored === "0") setAutoAdvance(false);
  }, []);

  // Refs to give event handlers access to the latest state without re-binding
  const autoAdvanceRef = useRef(autoAdvance);
  const nextHrefRef = useRef(nextHref);
  useLayoutEffect(() => { autoAdvanceRef.current = autoAdvance; }, [autoAdvance]);
  useLayoutEffect(() => { nextHrefRef.current = nextHref; }, [nextHref]);

  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  }, []);

  const persistAutoAdvance = useCallback((next: boolean) => {
    setAutoAdvance(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTO_ADVANCE_KEY, next ? "1" : "0");
    }
    // If user disabled mid-countdown, cancel it
    if (!next && countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdown(null);
    }
  }, []);

  const goToHref = useCallback((href: string) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(AUTOPLAY_FLAG_KEY, "1");
    }
    cancelCountdown();
    router.push(href, { scroll: false });
  }, [router, cancelCountdown]);

  const startAutoAdvanceCountdown = useCallback(() => {
    const href = nextHrefRef.current;
    if (!href) return;
    setCountdown(AUTO_ADVANCE_COUNTDOWN);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          // Defer navigation out of state-update tick
          setTimeout(() => goToHref(href), 0);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [goToHref]);

  const safePlay = useCallback(async (audio: HTMLAudioElement) => {
    try {
      await audio.play();
      setPlaying(true);
    } catch (err) {
      // NotSupportedError → resource selection lost (race after load()).
      // Re-run load() and retry once when the element is ready.
      if (err instanceof DOMException && err.name === "NotSupportedError") {
        await new Promise<void>((resolve) => {
          const onReady = () => {
            audio.removeEventListener("loadedmetadata", onReady);
            audio.removeEventListener("error", onReady);
            resolve();
          };
          audio.addEventListener("loadedmetadata", onReady, { once: true });
          audio.addEventListener("error", onReady, { once: true });
          audio.load();
        });
        try {
          await audio.play();
          setPlaying(true);
          return;
        } catch {
          /* fall through to failure */
        }
      }
      setPlaying(false);
      console.warn("AudioPlayer: play() rejected", err);
    }
  }, []);

  // ── Audio element event listeners ─────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const now = audio.currentTime;
      setCurrentTime(now);
      // Persist position every ~10 seconds while playing
      if (
        lessonIdRef.current != null &&
        !audio.paused &&
        Math.abs(now - lastSavedRef.current) >= 10
      ) {
        lastSavedRef.current = now;
        saveLessonPosition(lessonIdRef.current, now).catch(() => { /* silent */ });
      }
      if (
        lessonIdRef.current != null &&
        !completedFiredRef.current &&
        audio.duration > 0 &&
        audio.currentTime / audio.duration >= 0.95
      ) {
        completedFiredRef.current = true;
        window.dispatchEvent(
          new CustomEvent("mhs:lesson-complete", { detail: { lessonId: lessonIdRef.current } }),
        );
      }
      // Keep Media Session scrubber in sync (cheap; called ~4x/sec)
      if ("mediaSession" in navigator && audio.duration > 0 && isFinite(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: audio.playbackRate || 1,
          });
        } catch { /* ignore */ }
      }
    };
    const onMeta = () => {
      setDuration(audio.duration);
      // Restore saved position once, after metadata loads — never seek past 95%
      if (
        !seekRestoredRef.current &&
        initialPositionRef.current > 0 &&
        audio.duration > 0 &&
        initialPositionRef.current / audio.duration < 0.95
      ) {
        seekRestoredRef.current = true;
        audio.currentTime = initialPositionRef.current;
        setCurrentTime(initialPositionRef.current);
        lastSavedRef.current = initialPositionRef.current;
      }
    };
    const onPause = () => {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
      // Save final position on pause so resume is accurate
      if (lessonIdRef.current != null && audio.currentTime > 1) {
        lastSavedRef.current = audio.currentTime;
        saveLessonPosition(lessonIdRef.current, audio.currentTime).catch(() => { /* silent */ });
      }
    };
    const onPlay = () => {
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    };
    const onEnd = () => {
      setPlaying(false);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
      if (autoAdvanceRef.current && nextHrefRef.current) {
        startAutoAdvanceCountdown();
      }
    };
    const onError = () => {
      setLoadError(true);
      setPlaying(false);
      cancelCountdown();
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onError);
    };
  }, [startAutoAdvanceCountdown, cancelCountdown]);

  // Reset when src changes; also handle auto-advance autoplay handoff.
  // Skip the reset on first mount — React will already have set the src
  // attribute declaratively, and calling load() here can race the browser's
  // own resource-selection algorithm (especially under strict-mode double-mount),
  // producing "no supported sources" if play() fires before re-selection completes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const isInitialMount = prevSrcRef.current === null;
    const srcChanged = prevSrcRef.current !== null && prevSrcRef.current !== src;
    prevSrcRef.current = src;

    if (isInitialMount) {
      audio.playbackRate = speed;
      return;
    }

    if (srcChanged) {
      cancelCountdown();
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setLoadError(false);
      completedFiredRef.current = false;
      seekRestoredRef.current = false;
      lastSavedRef.current = 0;
      audio.load();
      audio.playbackRate = speed;

      // If we just navigated from a previous section via auto-advance / Media Session,
      // begin playback as soon as the new file is ready.
      if (
        typeof window !== "undefined" &&
        sessionStorage.getItem(AUTOPLAY_FLAG_KEY) === "1"
      ) {
        sessionStorage.removeItem(AUTOPLAY_FLAG_KEY);
        const onReady = () => {
          void safePlay(audio);
          audio.removeEventListener("loadedmetadata", onReady);
        };
        audio.addEventListener("loadedmetadata", onReady, { once: true });
        return () => audio.removeEventListener("loadedmetadata", onReady);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Media Session metadata + action handlers
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const audio = audioRef.current;
    if (!audio) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: sectionTitle || mediaArtist || "MedHelp Space",
        artist: mediaArtist || "MedHelp Space",
        album: albumName || "",
      });
    } catch { /* ignore */ }

    const handlers: Array<[MediaSessionAction, (() => void) | ((d: MediaSessionActionDetails) => void)]> = [
      ["play", () => { void safePlay(audio); }],
      ["pause", () => { audio.pause(); setPlaying(false); }],
      ["seekbackward", (details) => {
        const offset = (details as MediaSessionActionDetails).seekOffset ?? SKIP_SECONDS;
        audio.currentTime = Math.max(0, audio.currentTime - offset);
      }],
      ["seekforward", (details) => {
        const offset = (details as MediaSessionActionDetails).seekOffset ?? SKIP_SECONDS;
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + offset);
      }],
      ["seekto", (details) => {
        const d = details as MediaSessionActionDetails;
        if (d.seekTime != null) audio.currentTime = d.seekTime;
      }],
      ["previoustrack", () => {
        // Convention: <3s in → previous track; otherwise restart current
        if (audio.currentTime > 3 || !prevHref) {
          audio.currentTime = 0;
        } else {
          goToHref(prevHref);
        }
      }],
      ["nexttrack", () => {
        if (nextHref) goToHref(nextHref);
      }],
    ];

    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler as MediaSessionActionHandler); }
      catch { /* unsupported action */ }
    }

    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null); }
        catch { /* ignore */ }
      }
    };
  }, [sectionTitle, mediaArtist, albumName, nextHref, prevHref, goToHref, safePlay]);

  // Cleanup countdown on unmount
  useEffect(() => () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }, []);

  // ── Track scrubbing ────────────────────────────────────────────────────────
  const seekTo = useCallback((clientX: number) => {
    const track = trackRef.current;
    const audio = audioRef.current;
    if (!track || !audio || !duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  // Pointer events unify mouse, touch, and pen. setPointerCapture keeps the
  // drag alive even when the cursor/finger leaves the track element.
  const handleTrackPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    try { track.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    draggingRef.current = true;
    seekTo(e.clientX);
  }, [seekTo]);

  const handleTrackPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    seekTo(e.clientX);
  }, [seekTo]);

  const handleTrackPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (track) {
      try {
        if (track.hasPointerCapture(e.pointerId)) {
          track.releasePointerCapture(e.pointerId);
        }
      } catch { /* unsupported */ }
    }
    draggingRef.current = false;
  }, []);

  // ── Transport actions ─────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void safePlay(audio);
    }
  }, [playing, safePlay]);

  const skipBy = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const d = audio.duration || duration || 0;
    audio.currentTime = Math.max(0, Math.min(d, audio.currentTime + delta));
  }, [duration]);

  const setSpeedAndApply = useCallback((s: Speed) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;
  const showCountdown = countdown !== null && nextHref != null;

  return {
    // Refs the consumer must bind
    audioRef,
    trackRef,
    // State
    playing,
    currentTime,
    duration,
    speed,
    autoAdvance,
    countdown,
    loadError,
    // Derived
    progress,
    showCountdown,
    // Actions
    togglePlay,
    skipBy,
    setSpeedAndApply,
    persistAutoAdvance,
    cancelCountdown,
    handleTrackPointerDown,
    handleTrackPointerMove,
    handleTrackPointerUp,
    /** Navigate to another lesson section; sets the autoplay handoff flag so
     *  the next section starts playing as soon as its audio is ready. */
    navigateToHref: goToHref,
  };
}
