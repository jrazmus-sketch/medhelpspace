"use client";

import { Play, Pause, Rewind, FastForward, Repeat, SkipBack, SkipForward, AlertCircle } from "lucide-react";
import type { useAudioPlayerEngine } from "./audio-player-engine";
import { BARS, SPEEDS, SKIP_SECONDS, fmt } from "./audio-player-engine";
import { SpecialtyIcon, getSpecialtyAccent } from "./specialty-icon";

type Engine = ReturnType<typeof useAudioPlayerEngine>;

export type DesktopChromeProps = {
  engine: Engine;
  title?: string;
  sectionTitle?: string;
  sectionTitleNode?: React.ReactNode;
  nextTitle?: string | null;
  /** If provided, the player picks up the specialty's accent color and shows
   *  its icon in the title row. */
  specialtySlug?: string;
  /** Hrefs for prev/next section transport buttons. Disabled when null. */
  prevHref?: string | null;
  nextHref?: string | null;
};

export function DesktopAudioPlayerChrome({
  engine,
  title,
  sectionTitle,
  sectionTitleNode,
  nextTitle,
  specialtySlug,
  prevHref,
  nextHref,
}: DesktopChromeProps) {
  const {
    trackRef,
    playing, currentTime, duration, speed, autoAdvance, countdown, loadError,
    progress, showCountdown,
    togglePlay, skipBy, setSpeedAndApply, persistAutoAdvance, cancelCountdown,
    handleTrackPointerDown, handleTrackPointerMove, handleTrackPointerUp,
    navigateToHref,
  } = engine;

  const splitBar = Math.floor(progress * BARS.length);
  const titleDisplay = sectionTitleNode ?? sectionTitle;
  // When specialty is known, drive the whole player chrome through the
  // --mhs-player-accent cascade. Falls back to the global MedVoice purple
  // for any caller that doesn't pass specialtySlug.
  const accent = specialtySlug ? getSpecialtyAccent(specialtySlug) : null;

  return (
    <div
      className="audio-player-card"
      style={{
        ...(accent ? { ["--mhs-player-accent" as string]: accent } : {}),
        position: "sticky",
        top: "var(--app-sticky-top, 60px)",
        zIndex: 10,
        borderRadius: 12,
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 16%, var(--surface-1)) 0%, color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 6%, var(--surface-1)) 100%)",
        border: "1px solid color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 38%, var(--border))",
        padding: "14px 18px 16px",
        marginBottom: 24,
        boxShadow:
          "0 1px 0 color-mix(in srgb, white 18%, transparent) inset," +
          " 0 10px 32px color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 18%, transparent)," +
          " 0 2px 6px rgba(0,0,0,0.08)",
      }}
    >
      {/* Title row: optional specialty icon + overline + section title (track
          name) on left, CONTÍNUO on right */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
      }}>
        <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
          {/* Small specialty icon disc — visual identity to anchor the player
              to the page. White stroke for contrast against the colored disc. */}
          {specialtySlug && accent && (
            <div
              aria-hidden
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${accent} 70%, white) 0%, color-mix(in srgb, ${accent} 95%, black) 80%)`,
                boxShadow:
                  `0 2px 8px color-mix(in srgb, ${accent} 35%, transparent),` +
                  ` 0 0 0 1px rgba(255,255,255,0.12) inset`,
              }}
            >
              <SpecialtyIcon specialtySlug={specialtySlug} size={18} mono="#fff" strokeWidth={2.1} />
            </div>
          )}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          {title && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".22em",
              textTransform: "uppercase",
              color: "var(--mhs-player-accent, var(--c-medvoice))",
              fontFamily: "var(--font-geist-mono)",
            }}>
              <PlayingDot active={playing} />
              <span>{title}</span>
            </div>
          )}
          {titleDisplay && (
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                lineHeight: 1.25,
                color: "var(--foreground)",
                letterSpacing: "-0.005em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={sectionTitle}
            >
              {titleDisplay}
            </div>
          )}
        </div>
        </div>
        {!loadError && (
          <button
            type="button"
            onClick={() => persistAutoAdvance(!autoAdvance)}
            aria-pressed={autoAdvance}
            aria-label={autoAdvance ? "Desativar reprodução contínua" : "Ativar reprodução contínua"}
            title={autoAdvance ? "Reprodução contínua ativada" : "Reprodução contínua desativada"}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 9px 4px 7px",
              borderRadius: 999,
              border: `1px solid ${autoAdvance ? "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 60%, transparent)" : "var(--border)"}`,
              background: autoAdvance
                ? "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 22%, transparent)"
                : "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 4%, transparent)",
              color: autoAdvance ? "var(--mhs-player-accent, var(--c-medvoice))" : "var(--muted-foreground)",
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "var(--font-geist-mono)",
              letterSpacing: ".08em",
              cursor: "pointer",
              transition: "all 0.12s",
              boxShadow: autoAdvance
                ? "0 0 0 3px color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 10%, transparent)"
                : "none",
            }}
          >
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: autoAdvance
                ? "var(--mhs-player-accent, var(--c-medvoice))"
                : "color-mix(in srgb, var(--muted-foreground) 40%, transparent)",
              boxShadow: autoAdvance
                ? "0 0 6px color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 80%, transparent)"
                : "none",
            }} />
            <Repeat size={11} strokeWidth={2.5} />
            <span>CONTÍNUO</span>
          </button>
        )}
      </div>

      {loadError && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 6,
            background: "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 8%, var(--surface-2))",
            border: "1px dashed color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 35%, var(--border))",
            color: "var(--foreground)",
          }}
        >
          <AlertCircle size={18} style={{ color: "var(--mhs-player-accent, var(--c-medvoice))", flexShrink: 0 }} />
          <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.45 }}>
            <strong style={{ color: "var(--mhs-player-accent, var(--c-medvoice))" }}>Áudio em preparação.</strong>{" "}
            <span style={{ color: "var(--muted-foreground)" }}>
              Esta seção ainda não tem áudio disponível. A transcrição está logo abaixo.
            </span>
          </div>
        </div>
      )}

      {!loadError && (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <SkipSectionButton
            direction="prev"
            href={prevHref}
            onNavigate={navigateToHref}
          />
          <button
            onClick={() => skipBy(-SKIP_SECONDS)}
            aria-label="Voltar 15 segundos"
            title="Voltar 15s"
            style={transportSecondaryStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 12%, transparent)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 4%, transparent)")}
          >
            <Rewind size={15} strokeWidth={2.2} />
            <span style={skipLabelStyle}>15</span>
          </button>

          <button
            onClick={togglePlay}
            aria-label={playing ? "Pausar" : "Reproduzir"}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              border: "none",
              background:
                "linear-gradient(135deg, var(--mhs-player-accent, var(--c-medvoice)) 0%, color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 65%, white) 100%)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow:
                "0 6px 18px color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 50%, transparent)," +
                " 0 0 0 1px color-mix(in srgb, white 30%, transparent) inset",
              transition: "transform 0.1s",
              animation: playing ? "mhs-ap-pulse-ring 1.8s ease-out infinite" : undefined,
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.93)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {playing ? <Pause size={20} fill="#fff" /> : <Play size={20} fill="#fff" style={{ marginLeft: 3 }} />}
          </button>

          <button
            onClick={() => skipBy(SKIP_SECONDS)}
            aria-label="Avançar 15 segundos"
            title="Avançar 15s"
            style={transportSecondaryStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 12%, transparent)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 4%, transparent)")}
          >
            <FastForward size={15} strokeWidth={2.2} />
            <span style={skipLabelStyle}>15</span>
          </button>

          <SkipSectionButton
            direction="next"
            href={nextHref}
            onNavigate={navigateToHref}
          />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0, position: "relative" }}>
          {showCountdown ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                height: 40 + 6 + 14,
                padding: "0 10px",
                borderRadius: 6,
                background: "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 14%, var(--surface-2))",
                border: "1px dashed color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 50%, transparent)",
                fontSize: 12,
                color: "var(--foreground)",
                fontFamily: "var(--font-geist-mono)",
                minWidth: 0,
              }}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Próximo em <strong style={{ color: "var(--mhs-player-accent, var(--c-medvoice))" }}>{countdown}s</strong>
                {nextTitle ? <span style={{ opacity: 0.7 }}>: {nextTitle}</span> : null}
              </span>
              <button
                onClick={cancelCountdown}
                style={{
                  flexShrink: 0,
                  padding: "3px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "var(--surface-1)",
                  color: "var(--muted-foreground)",
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
                  height: 44,
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
                          ? "linear-gradient(180deg, color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 55%, white) 0%, var(--mhs-player-accent, var(--c-medvoice)) 55%, color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 70%, #e0b3ff) 100%)"
                          : "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 18%, var(--surface-2))",
                        boxShadow: isHead
                          ? "0 0 8px color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 75%, transparent)"
                          : "none",
                        opacity: isPlayed || isHead ? 1 : 0.85,
                        transition: "background 0.05s, box-shadow 0.1s",
                        animation: playing ? "mhs-ap-bar-bob 1.4s ease-in-out infinite" : undefined,
                        animationDelay: playing ? `${(i % 12) * 0.06}s` : undefined,
                      }}
                    />
                  );
                })}
              </div>

              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                fontFamily: "var(--font-geist-mono)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: ".04em",
              }}>
                <span style={{ color: "var(--foreground)", fontWeight: 600 }}>{fmt(currentTime)}</span>
                <span style={{ color: "var(--muted-foreground)" }}>{fmt(duration)}</span>
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
          {SPEEDS.map((s) => {
            const active = s === speed;
            return (
              <button
                key={s}
                onClick={() => setSpeedAndApply(s)}
                aria-pressed={active}
                style={{
                  minWidth: 42,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${active ? "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 70%, transparent)" : "var(--border)"}`,
                  background: active
                    ? "linear-gradient(135deg, var(--mhs-player-accent, var(--c-medvoice)) 0%, color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 75%, white) 100%)"
                    : "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 4%, transparent)",
                  color: active ? "#fff" : "var(--muted-foreground)",
                  fontSize: 10,
                  fontFamily: "var(--font-geist-mono)",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  lineHeight: 1.5,
                  transition: "all 0.12s",
                  boxShadow: active
                    ? "0 2px 6px color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 40%, transparent)"
                    : "none",
                }}
              >
                {s}×
              </button>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

function SkipSectionButton({
  direction, href, onNavigate,
}: {
  direction: "prev" | "next";
  href: string | null | undefined;
  onNavigate: (href: string) => void;
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
        width: 30,
        height: 30,
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        color: disabled
          ? "color-mix(in srgb, var(--muted-foreground) 40%, transparent)"
          : "var(--mhs-player-accent, var(--c-medvoice))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "color 0.12s, opacity 0.12s",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={16} strokeWidth={2} fill={disabled ? "transparent" : "currentColor"} />
    </button>
  );
}

function PlayingDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: active ? "var(--mhs-player-accent, var(--c-medvoice))" : "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 35%, transparent)",
        boxShadow: active ? "0 0 6px color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 80%, transparent)" : "none",
        animation: active ? "mhs-ap-bar-bob 1.4s ease-in-out infinite" : undefined,
      }}
    />
  );
}

const transportSecondaryStyle: React.CSSProperties = {
  position: "relative",
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "1px solid color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 40%, var(--border))",
  background: "color-mix(in srgb, var(--mhs-player-accent, var(--c-medvoice)) 4%, transparent)",
  color: "var(--mhs-player-accent, var(--c-medvoice))",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background 0.12s, transform 0.1s",
  gap: 0,
};

const skipLabelStyle: React.CSSProperties = {
  fontSize: 7.5,
  fontWeight: 700,
  fontFamily: "var(--font-geist-mono)",
  color: "var(--mhs-player-accent, var(--c-medvoice))",
  lineHeight: 1,
  letterSpacing: 0,
  marginTop: 1,
};
