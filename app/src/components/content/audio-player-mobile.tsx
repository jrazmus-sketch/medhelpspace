"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Pause, Rewind, FastForward, Repeat, SkipBack, SkipForward, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, Maximize2 } from "lucide-react";
import { SpecialtyIcon, getSpecialtyAccent } from "./specialty-icon";
import type { useAudioPlayerEngine } from "./audio-player-engine";
import { BARS, SPEEDS, SKIP_SECONDS, fmt } from "./audio-player-engine";

type Engine = ReturnType<typeof useAudioPlayerEngine>;

export type MobileSection = {
  id: number;
  title: string;
  href: string;
  isActive: boolean;
};

export type MobileChromeProps = {
  engine: Engine;
  /** Brand chip line, e.g. "MedVoice · Áudio". */
  title?: string;
  sectionTitle?: string;
  /** Optional rendered node for the section title (e.g. EditableText). */
  sectionTitleNode?: React.ReactNode;
  nextTitle?: string | null;
  /** Page-level identity displayed in the album area, e.g. "Cardiologia Medvoice". */
  pageTitle: string;
  /** Specialty slug for icon + ambient color theme. */
  specialtySlug: string;
  /** All sibling sections; the active one is highlighted. */
  sections: MobileSection[];
  /** Optional already-rendered transcript node (rich HTML or EditableText). */
  transcriptNode?: React.ReactNode;
  /** Hrefs for prev/next section transport buttons. Disabled when null. */
  prevHref?: string | null;
  nextHref?: string | null;
  /** If provided, renders a back chevron at top-left of the hero. */
  backHref?: string;
};

type Tab = "sections" | "transcript";

/** Short physical-feel haptic on transport interactions. Android supports;
 *  iOS Safari silently no-ops. */
function haptic(ms = 8) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(ms); } catch { /* unsupported */ }
  }
}

export function MobileAudioPlayerChrome({
  engine,
  title,
  sectionTitle,
  sectionTitleNode,
  nextTitle,
  pageTitle,
  specialtySlug,
  sections,
  transcriptNode,
  prevHref,
  nextHref,
  backHref,
}: MobileChromeProps) {
  const {
    trackRef,
    playing, currentTime, duration, speed, autoAdvance, countdown, loadError,
    progress, showCountdown,
    togglePlay, skipBy, setSpeedAndApply, persistAutoAdvance, cancelCountdown,
    handleTrackPointerDown, handleTrackPointerMove, handleTrackPointerUp,
    navigateToHref,
  } = engine;

  const [activeTab, setActiveTab] = useState<Tab>("sections");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const splitBar = Math.floor(progress * BARS.length);
  const titleDisplay = sectionTitleNode ?? sectionTitle;
  const accent = getSpecialtyAccent(specialtySlug);
  const activeIdx = sections.findIndex((s) => s.isActive);
  const positionLabel = sections.length > 0
    ? `Seção ${activeIdx >= 0 ? activeIdx + 1 : 1} de ${sections.length}`
    : null;

  const onTogglePlay = () => { haptic(); togglePlay(); };
  const onSkipBy = (delta: number) => { haptic(); skipBy(delta); };
  const onNavigate = (href: string) => { haptic(12); navigateToHref(href); };
  const onSetSpeed = (s: typeof speed) => { haptic(6); setSpeedAndApply(s); };
  const onToggleAutoAdvance = () => { haptic(6); persistAutoAdvance(!autoAdvance); };
  const onEnterFullscreen = () => { haptic(15); setIsFullScreen(true); };
  const onExitFullscreen = () => { haptic(15); setIsFullScreen(false); };

  // While fullscreen, prevent the underlying page from scrolling behind the
  // overlay. Restore the prior overflow value on minimize / unmount.
  useEffect(() => {
    if (!isFullScreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isFullScreen]);

  return (
    <div
      className="mhs-mobile-audio-player"
      data-fullscreen={isFullScreen ? "true" : "false"}
      style={isFullScreen ? {
        // Immersive overlay: covers global header + bottom nav.
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #0e0e14 0%, #14141c 100%)",
        color: "#e8e8ef",
        animation: "mhs-ap-fullscreen-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
        overflow: "hidden",
      } : {
        // In-page card mode (Phase 1 default): fills the area between sticky
        // header and bottom mobile nav. 100dvh adapts to mobile browser chrome
        // (URL bar) collapsing.
        minHeight: "calc(100dvh - var(--app-sticky-top, 60px) - 64px - 16px)",
        display: "flex",
        flexDirection: "column",
        borderRadius: 18,
        overflow: "hidden",
        // Dark-mode-first surface: stays atmospheric regardless of theme.
        background: "linear-gradient(180deg, #0e0e14 0%, #14141c 100%)",
        color: "#e8e8ef",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.05) inset," +
          " 0 18px 48px rgba(0,0,0,0.35)," +
          " 0 2px 8px rgba(0,0,0,0.2)",
        border: `1px solid color-mix(in srgb, ${accent} 28%, rgba(255,255,255,0.06))`,
        position: "relative",
        isolation: "isolate",
      }}
    >
      {/* ── HERO: specialty atmosphere ─────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          padding: "28px 20px 22px",
          overflow: "hidden",
          background:
            `radial-gradient(120% 80% at 30% 0%, color-mix(in srgb, ${accent} 55%, transparent) 0%, transparent 60%),` +
            ` radial-gradient(100% 80% at 80% 100%, color-mix(in srgb, ${accent} 38%, transparent) 0%, transparent 65%),` +
            ` linear-gradient(180deg, color-mix(in srgb, ${accent} 18%, #14141c) 0%, color-mix(in srgb, ${accent} 8%, #14141c) 100%)`,
        }}
      >
        {/* Slow ambient drift overlay */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: -40,
            pointerEvents: "none",
            background:
              `radial-gradient(40% 40% at 20% 30%, color-mix(in srgb, ${accent} 30%, transparent) 0%, transparent 60%),` +
              ` radial-gradient(35% 35% at 75% 70%, color-mix(in srgb, ${accent} 22%, transparent) 0%, transparent 60%)`,
            opacity: 0.7,
            animation: "mhs-ap-ambient-drift 18s ease-in-out infinite",
            filter: "blur(20px)",
          }}
        />

        {/* Top-left: in normal mode = back chevron (Voltar); in fullscreen = minimize. */}
        {isFullScreen ? (
          <button
            type="button"
            onClick={onExitFullscreen}
            aria-label="Reduzir player"
            style={glassPillStyle}
          >
            <ChevronDown size={20} strokeWidth={2.2} />
          </button>
        ) : (
          backHref && (
            <Link
              href={backHref}
              aria-label="Voltar"
              style={{ ...glassPillStyle, textDecoration: "none" }}
              onClick={() => haptic(6)}
            >
              <ChevronLeft size={20} strokeWidth={2.2} />
            </Link>
          )
        )}

        {/* Top-right: expand-to-fullscreen affordance (hidden when already fullscreen). */}
        {!isFullScreen && (
          <button
            type="button"
            onClick={onEnterFullscreen}
            aria-label="Tela cheia"
            title="Tela cheia"
            style={{
              ...glassPillStyle,
              left: "auto",
              right: 14,
            }}
          >
            <Maximize2 size={16} strokeWidth={2.2} />
          </button>
        )}

        {/* Big specialty icon as the album-art centerpiece. Tap to expand to
            fullscreen (when not already there). */}
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            margin: isFullScreen ? "24px 0 28px" : "8px 0 18px",
          }}
        >
          <button
            type="button"
            onClick={isFullScreen ? undefined : onEnterFullscreen}
            aria-label={isFullScreen ? undefined : "Tela cheia"}
            disabled={isFullScreen}
            style={{
              width: isFullScreen ? 168 : 132,
              height: isFullScreen ? 168 : 132,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              padding: 0,
              background:
                `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${accent} 70%, white) 0%, color-mix(in srgb, ${accent} 95%, black) 80%)`,
              boxShadow:
                `0 16px 36px color-mix(in srgb, ${accent} 60%, transparent),` +
                ` 0 0 0 1px rgba(255,255,255,0.1) inset,` +
                ` 0 0 0 6px color-mix(in srgb, ${accent} 12%, transparent)`,
              transform: playing ? "scale(1.02)" : "scale(1)",
              transition: "transform 0.4s ease-out, width 0.3s ease-out, height 0.3s ease-out",
              cursor: isFullScreen ? "default" : "pointer",
            }}
          >
            <SpecialtyIcon
              specialtySlug={specialtySlug}
              size={isFullScreen ? 84 : 64}
              mono="#fff"
              strokeWidth={2}
            />
          </button>
        </div>

        {/* Page identity (album line) */}
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".24em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.78)",
            fontFamily: "var(--font-geist-mono)",
            marginBottom: 4,
          }}
        >
          {pageTitle}
        </div>

        {/* ECG signature — discreet medical-themed motion at the bottom of the hero */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 8,
            height: 24,
            overflow: "hidden",
            pointerEvents: "none",
            opacity: playing ? 0.55 : 0.22,
            transition: "opacity 0.5s",
          }}
        >
          <svg
            viewBox="0 0 400 24"
            preserveAspectRatio="none"
            style={{
              width: "200%",
              height: "100%",
              animation: playing ? "mhs-ap-ecg-scroll 6s linear infinite" : undefined,
            }}
          >
            <path
              d="M0,12 L40,12 L48,12 L54,8 L58,12 L72,12 L80,12 L86,2 L92,22 L98,12 L160,12 L168,12 L172,9 L176,15 L180,12 L240,12 L248,12 L254,8 L258,12 L272,12 L280,12 L286,2 L292,22 L298,12 L360,12 L368,12 L372,9 L376,15 L380,12 L400,12"
              fill="none"
              stroke={`color-mix(in srgb, ${accent} 80%, white)`}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M400,12 L440,12 L448,12 L454,8 L458,12 L472,12 L480,12 L486,2 L492,22 L498,12 L560,12 L568,12 L572,9 L576,15 L580,12 L640,12 L648,12 L654,8 L658,12 L672,12 L680,12 L686,2 L692,22 L698,12 L760,12 L768,12 L772,9 L776,15 L780,12 L800,12"
              fill="none"
              stroke={`color-mix(in srgb, ${accent} 80%, white)`}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* ── LOWER HALF: frosted glass surface over a dark base ─────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          // Frosted-glass effect — blur whatever bleeds through, add a slight
          // tint, and stack a top gradient that fades from the hero's accent
          // into the glass surface so the boundary breathes rather than cuts.
          background: "rgba(20, 20, 28, 0.72)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Soft atmosphere fade from hero into the glass top edge */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 60,
            pointerEvents: "none",
            background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 14%, transparent) 0%, transparent 100%)`,
          }}
        />

        {/* ── TRACK INFO ───────────────────────────────────────────────── */}
        <div style={{ padding: "16px 20px 0", textAlign: "center", position: "relative" }}>
          {title && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".24em",
              textTransform: "uppercase",
              color: accent,
              fontFamily: "var(--font-geist-mono)",
              marginBottom: 8,
            }}>
              <PlayingDot active={playing} accent={accent} />
              <span>{title}</span>
            </div>
          )}
          {titleDisplay && (
            <div
              key={sectionTitle ?? ""}
              style={{
                fontSize: 24,
                fontWeight: 700,
                lineHeight: 1.2,
                color: "#f5f5f8",
                letterSpacing: "-0.01em",
                marginBottom: 6,
                animation: "mhs-ap-title-in 0.32s ease-out",
              }}
              title={sectionTitle}
            >
              {titleDisplay}
            </div>
          )}
          {positionLabel && (
            <div style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              fontFamily: "var(--font-geist-mono)",
              letterSpacing: ".05em",
            }}>
              {positionLabel}
            </div>
          )}
        </div>

        {/* ── ERROR STATE ──────────────────────────────────────────────── */}
        {loadError && (
          <div
            role="status"
            style={{
              margin: "20px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 10,
              background: `color-mix(in srgb, ${accent} 10%, rgba(255,255,255,0.04))`,
              border: `1px dashed color-mix(in srgb, ${accent} 40%, rgba(255,255,255,0.1))`,
            }}
          >
            <AlertCircle size={20} style={{ color: accent, flexShrink: 0 }} />
            <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.45 }}>
              <strong style={{ color: accent }}>Áudio em preparação.</strong>{" "}
              <span style={{ color: "rgba(255,255,255,0.65)" }}>
                Esta seção ainda não tem áudio. A transcrição está abaixo.
              </span>
            </div>
          </div>
        )}

        {/* ── WAVEFORM + TIMES ─────────────────────────────────────────── */}
        {!loadError && (
          <div style={{ padding: "18px 20px 8px" }}>
            {showCountdown ? (
              <div
                role="status"
                aria-live="polite"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: `color-mix(in srgb, ${accent} 14%, rgba(255,255,255,0.04))`,
                  border: `1px dashed color-mix(in srgb, ${accent} 50%, transparent)`,
                  fontSize: 13,
                  fontFamily: "var(--font-geist-mono)",
                  color: "#e8e8ef",
                }}
              >
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Próximo em <strong style={{ color: accent }}>{countdown}s</strong>
                  {nextTitle ? <span style={{ opacity: 0.7 }}>: {nextTitle}</span> : null}
                </span>
                <button
                  onClick={cancelCountdown}
                  style={{
                    flexShrink: 0,
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 11,
                    fontFamily: "var(--font-geist-mono)",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <>
                <div
                  ref={trackRef}
                  onPointerDown={handleTrackPointerDown}
                  onPointerMove={handleTrackPointerMove}
                  onPointerUp={handleTrackPointerUp}
                  onPointerCancel={handleTrackPointerUp}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    height: 56,
                    cursor: "pointer",
                    userSelect: "none",
                    touchAction: "none",
                  }}
                  aria-label="Barra de progresso"
                  role="slider"
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  {BARS.map((h, i) => {
                    const isPlayed = i < splitBar;
                    const isHead = i === splitBar;
                    return (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: `${h}%`,
                          borderRadius: 2,
                          transformOrigin: "center",
                          background: isPlayed || isHead
                            ? `linear-gradient(180deg, color-mix(in srgb, ${accent} 40%, white) 0%, ${accent} 60%, color-mix(in srgb, ${accent} 70%, #ff9bd6) 100%)`
                            : "rgba(255,255,255,0.12)",
                          boxShadow: isHead
                            ? `0 0 10px color-mix(in srgb, ${accent} 85%, transparent)`
                            : "none",
                          opacity: isPlayed || isHead ? 1 : 0.9,
                          transition: "background 0.05s, box-shadow 0.1s",
                          animation: playing ? "mhs-ap-bar-bob 1.4s ease-in-out infinite" : undefined,
                          animationDelay: playing ? `${(i % 14) * 0.05}s` : undefined,
                        }}
                      />
                    );
                  })}
                </div>

                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  fontFamily: "var(--font-geist-mono)",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: ".04em",
                  marginTop: 6,
                }}>
                  <span style={{ color: "#f5f5f8", fontWeight: 600 }}>{fmt(currentTime)}</span>
                  <span style={{ color: "rgba(255,255,255,0.55)" }}>{fmt(duration)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TRANSPORT: prev | -15 | play | +15 | next ────────────────── */}
        {!loadError && (
          <div style={{
            padding: "8px 20px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}>
            <SkipSectionButton
              direction="prev"
              href={prevHref}
              onNavigate={onNavigate}
              accent={accent}
            />
            <SkipTimeButton
              label="15"
              direction="back"
              onClick={() => onSkipBy(-SKIP_SECONDS)}
              accent={accent}
            />
            <button
              onClick={onTogglePlay}
              aria-label={playing ? "Pausar" : "Reproduzir"}
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                border: "none",
                background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 60%, white) 100%)`,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow:
                  `0 10px 28px color-mix(in srgb, ${accent} 55%, transparent),` +
                  ` 0 0 0 1px rgba(255,255,255,0.25) inset`,
                transition: "transform 0.1s",
                animation: playing ? "mhs-ap-pulse-ring 1.8s ease-out infinite" : undefined,
              }}
              onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.93)")}
              onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              onPointerCancel={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              {playing ? <Pause size={26} fill="#fff" /> : <Play size={26} fill="#fff" style={{ marginLeft: 4 }} />}
            </button>
            <SkipTimeButton
              label="15"
              direction="forward"
              onClick={() => onSkipBy(SKIP_SECONDS)}
              accent={accent}
            />
            <SkipSectionButton
              direction="next"
              href={nextHref}
              onNavigate={onNavigate}
              accent={accent}
            />
          </div>
        )}

        {/* ── SPEED PILLS + CONTÍNUO ───────────────────────────────────── */}
        {!loadError && (
          <div style={{
            padding: "0 20px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              {SPEEDS.map((s) => {
                const active = s === speed;
                return (
                  <button
                    key={s}
                    onClick={() => onSetSpeed(s)}
                    aria-pressed={active}
                    style={{
                      minWidth: 40,
                      padding: "4px 9px",
                      borderRadius: 999,
                      border: `1px solid ${active ? `color-mix(in srgb, ${accent} 70%, transparent)` : "rgba(255,255,255,0.12)"}`,
                      background: active
                        ? `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, white) 100%)`
                        : "rgba(255,255,255,0.04)",
                      color: active ? "#fff" : "rgba(255,255,255,0.72)",
                      fontSize: 11,
                      fontFamily: "var(--font-geist-mono)",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                      lineHeight: 1.4,
                      transition: "all 0.12s",
                      boxShadow: active
                        ? `0 2px 8px color-mix(in srgb, ${accent} 45%, transparent)`
                        : "none",
                    }}
                  >
                    {s}×
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onToggleAutoAdvance}
              aria-pressed={autoAdvance}
              aria-label={autoAdvance ? "Desativar reprodução contínua" : "Ativar reprodução contínua"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px 4px 7px",
                borderRadius: 999,
                border: `1px solid ${autoAdvance ? `color-mix(in srgb, ${accent} 60%, transparent)` : "rgba(255,255,255,0.12)"}`,
                background: autoAdvance
                  ? `color-mix(in srgb, ${accent} 22%, transparent)`
                  : "rgba(255,255,255,0.04)",
                color: autoAdvance ? accent : "rgba(255,255,255,0.65)",
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "var(--font-geist-mono)",
                letterSpacing: ".08em",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              <span style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: autoAdvance ? accent : "rgba(255,255,255,0.3)",
                boxShadow: autoAdvance ? `0 0 6px color-mix(in srgb, ${accent} 80%, transparent)` : "none",
              }} />
              <Repeat size={11} strokeWidth={2.5} />
              <span>CONTÍNUO</span>
            </button>
          </div>
        )}

        {/* ── UP-NEXT PREVIEW CHIP ─────────────────────────────────────── */}
        {!loadError && nextHref && nextTitle && !showCountdown && (
          <button
            type="button"
            onClick={() => onNavigate(nextHref)}
            style={{
              margin: "0 20px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid color-mix(in srgb, ${accent} 25%, rgba(255,255,255,0.08))`,
              background: `color-mix(in srgb, ${accent} 10%, rgba(255,255,255,0.02))`,
              color: "rgba(255,255,255,0.9)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.12s",
              minWidth: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, white) 100%)`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: `0 2px 6px color-mix(in srgb, ${accent} 45%, transparent)`,
              }}
            >
              <Play size={11} fill="#fff" style={{ marginLeft: 1 }} />
            </span>
            <span style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
              <span style={{
                display: "block",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: ".22em",
                textTransform: "uppercase",
                color: accent,
                fontFamily: "var(--font-geist-mono)",
                marginBottom: 1,
              }}>
                A seguir
              </span>
              <span style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {nextTitle}
              </span>
            </span>
            <ChevronRight size={16} style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }} />
          </button>
        )}

        {/* ── TABS: Seções / Transcrição ───────────────────────────────── */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(0,0,0,0.18)",
        }}>
          <div
            role="tablist"
            style={{
              display: "flex",
              padding: "10px 14px 0",
              position: "relative",
            }}
          >
            <TabButton
              label={`Seções ${sections.length ? `· ${sections.length}` : ""}`}
              active={activeTab === "sections"}
              onClick={() => { haptic(6); setActiveTab("sections"); }}
              accent={accent}
            />
            <TabButton
              label="Transcrição"
              active={activeTab === "transcript"}
              onClick={() => { haptic(6); setActiveTab("transcript"); }}
              accent={accent}
              disabled={!transcriptNode}
            />
            {/* Sliding indicator */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 0,
                left: 14, // matches container padding-left
                width: "calc((100% - 28px) / 2)", // half of (container width - paddings)
                height: 2,
                borderRadius: 2,
                background: accent,
                boxShadow: `0 0 8px color-mix(in srgb, ${accent} 60%, transparent)`,
                transform: `translateX(${activeTab === "sections" ? "0%" : "100%"})`,
                transition: "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Tab content — scrollable */}
          <div
            role="tabpanel"
            style={{
              padding: "8px 14px 18px",
              maxHeight: 400,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {activeTab === "sections" && (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => !s.isActive && onNavigate(s.href)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "11px 12px",
                        borderRadius: 10,
                        border: "none",
                        background: s.isActive
                          ? `color-mix(in srgb, ${accent} 18%, rgba(255,255,255,0.02))`
                          : "transparent",
                        color: s.isActive ? "#fff" : "rgba(255,255,255,0.82)",
                        cursor: s.isActive ? "default" : "pointer",
                        textAlign: "left",
                        fontSize: 14,
                        lineHeight: 1.35,
                        fontWeight: s.isActive ? 600 : 500,
                        transition: "background 0.12s",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 22,
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "var(--font-geist-mono)",
                          fontVariantNumeric: "tabular-nums",
                          color: s.isActive ? accent : "rgba(255,255,255,0.4)",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>{s.title}</span>
                      {s.isActive && playing && (
                        <span
                          aria-hidden
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: accent,
                            boxShadow: `0 0 8px ${accent}`,
                            animation: "mhs-ap-bar-bob 1.2s ease-in-out infinite",
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {activeTab === "transcript" && (
              transcriptNode ? (
                <div
                  className="mhs-mobile-transcript"
                  style={{ ["--mhs-accent" as string]: accent }}
                >
                  {transcriptNode}
                </div>
              ) : (
                <div style={{
                  padding: "30px 12px",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.45)",
                  fontSize: 13,
                  fontStyle: "italic",
                }}>
                  Transcrição não disponível.
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function PlayingDot({ active, accent }: { active: boolean; accent: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: active ? accent : `color-mix(in srgb, ${accent} 35%, transparent)`,
        boxShadow: active ? `0 0 6px color-mix(in srgb, ${accent} 80%, transparent)` : "none",
        animation: active ? "mhs-ap-bar-bob 1.4s ease-in-out infinite" : undefined,
      }}
    />
  );
}

function SkipTimeButton({
  label, direction, onClick, accent,
}: {
  label: string;
  direction: "back" | "forward";
  onClick: () => void;
  accent: string;
}) {
  const Icon = direction === "back" ? Rewind : FastForward;
  const aria = direction === "back" ? "Voltar 15 segundos" : "Avançar 15 segundos";
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      title={aria}
      style={{
        position: "relative",
        width: 44,
        height: 44,
        borderRadius: "50%",
        border: `1px solid color-mix(in srgb, ${accent} 40%, rgba(255,255,255,0.1))`,
        background: `color-mix(in srgb, ${accent} 8%, rgba(255,255,255,0.02))`,
        color: `color-mix(in srgb, ${accent} 80%, white)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.12s",
        gap: 0,
      }}
    >
      <Icon size={16} strokeWidth={2.2} />
      <span style={{
        fontSize: 8,
        fontWeight: 700,
        fontFamily: "var(--font-geist-mono)",
        marginTop: 1,
        lineHeight: 1,
      }}>{label}</span>
    </button>
  );
}

function SkipSectionButton({
  direction, href, onNavigate, accent,
}: {
  direction: "prev" | "next";
  href: string | null | undefined;
  onNavigate: (href: string) => void;
  accent: string;
}) {
  const Icon = direction === "prev" ? SkipBack : SkipForward;
  const aria = direction === "prev" ? "Seção anterior" : "Próxima seção";
  const disabled = !href;
  return (
    <button
      onClick={() => href && onNavigate(href)}
      disabled={disabled}
      aria-label={aria}
      title={aria}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        color: disabled ? "rgba(255,255,255,0.18)" : `color-mix(in srgb, ${accent} 60%, white)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "color 0.12s",
      }}
    >
      <Icon size={20} strokeWidth={2} fill={disabled ? "transparent" : "currentColor"} />
    </button>
  );
}

const glassPillStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  left: 14,
  zIndex: 3,
  width: 38,
  height: 38,
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.32)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  color: "#fff",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
  cursor: "pointer",
  transition: "transform 0.12s, background 0.12s",
};

function TabButton({
  label, active, onClick, accent: _accent, disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      disabled={disabled}
      style={{
        flex: 1,
        padding: "10px 12px 12px",
        background: "transparent",
        border: "none",
        // Underline is now the sliding indicator (rendered separately). Keep
        // these slots consistent — no per-button border.
        color: active ? "#fff" : disabled ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        letterSpacing: ".02em",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "color 0.18s",
      }}
    >
      {label}
    </button>
  );
}
