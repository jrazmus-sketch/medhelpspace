"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause } from "lucide-react";

const BARS = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  const h =
    0.4 * Math.sin(t * Math.PI * 3.7 + 0.5) +
    0.25 * Math.sin(t * Math.PI * 7.3 + 1.2) +
    0.2 * Math.sin(t * Math.PI * 11.1 + 2.8) +
    0.15 * Math.cos(t * Math.PI * 19.4 + 0.7);
  return Math.round(12 + 80 * ((h + 1) / 2));
});

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

function fmt(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ src, title }: { src: string; title?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  // Reset when src changes
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    const audio = audioRef.current;
    if (audio) {
      audio.load();
    }
  }, [src]);

  const seekTo = useCallback((clientX: number) => {
    const track = trackRef.current;
    const audio = audioRef.current;
    if (!track || !audio || !duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    seekTo(e.clientX);

    const onMove = (ev: MouseEvent) => {
      if (draggingRef.current) seekTo(ev.clientX);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [seekTo]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  const setSpeedAndApply = (s: Speed) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const splitBar = Math.floor(progress * BARS.length);

  return (
    <div
      className="audio-player-card"
      style={{
        position: "sticky",
        top: 60,
        zIndex: 10,
        borderRadius: "var(--radius)",
        border: "1px solid color-mix(in srgb, var(--c-medvoice) 30%, var(--border))",
        background: "color-mix(in srgb, var(--c-medvoice) 8%, var(--surface-1))",
        padding: "14px 18px",
        marginBottom: 24,
        boxShadow: "0 4px 24px color-mix(in srgb, var(--c-medvoice) 12%, transparent)",
      }}
    >
      <audio ref={audioRef} src={src} preload="metadata" style={{ display: "none" }} />

      {/* Title row */}
      {title && (
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".18em",
          textTransform: "uppercase",
          color: "var(--c-medvoice)",
          fontFamily: "var(--font-geist-mono)",
          marginBottom: 10,
          opacity: 0.8,
        }}>
          {title}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pausar" : "Reproduzir"}
          style={{
            flexShrink: 0,
            width: 42,
            height: 42,
            borderRadius: "50%",
            border: "none",
            background: "var(--c-medvoice)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 2px 12px color-mix(in srgb, var(--c-medvoice) 40%, transparent)",
            transition: "transform 0.1s, opacity 0.1s",
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.93)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {playing ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" style={{ marginLeft: 2 }} />}
        </button>

        {/* Waveform + seek area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          {/* Waveform bars */}
          <div
            ref={trackRef}
            onMouseDown={handleTrackMouseDown}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              height: 40,
              cursor: "pointer",
              userSelect: "none",
            }}
            aria-label="Barra de progresso"
            role="slider"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {BARS.map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${h}%`,
                  borderRadius: 2,
                  background: i < splitBar
                    ? "var(--c-medvoice)"
                    : "color-mix(in srgb, var(--c-medvoice) 28%, var(--surface-2))",
                  transition: "background 0.05s",
                }}
              />
            ))}
          </div>

          {/* Time */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10,
            fontFamily: "var(--font-geist-mono)",
            color: "var(--muted-foreground)",
            letterSpacing: ".04em",
          }}>
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* Speed selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeedAndApply(s)}
              style={{
                padding: "1px 6px",
                borderRadius: 3,
                border: `1px solid ${s === speed ? "var(--c-medvoice)" : "var(--border)"}`,
                background: s === speed
                  ? "color-mix(in srgb, var(--c-medvoice) 18%, transparent)"
                  : "transparent",
                color: s === speed ? "var(--c-medvoice)" : "var(--muted-foreground)",
                fontSize: 9.5,
                fontFamily: "var(--font-geist-mono)",
                fontWeight: s === speed ? 700 : 400,
                cursor: "pointer",
                lineHeight: 1.6,
                transition: "all 0.12s",
              }}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
