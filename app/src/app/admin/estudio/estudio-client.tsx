"use client";

/* eslint-disable @next/next/no-img-element --
   Image export tool: needs raw <img> for arbitrary site/CDN/blob/data URLs and
   so modern-screenshot can rasterize the card to PNG. next/image breaks both. */

import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

/*
  MedHelpSpace — Instagram Studio (admin)
  Route: /admin/estudio

  A branded post generator that renders with the site's REAL fonts and tokens:
  - Headlines: Bricolage Grotesque (var(--font-bricolage))
  - Body:      Geist            (var(--font-sans))
  - Labels:    Geist Mono       (var(--font-geist-mono))
  - Brand purple #7a1d91 / accent #c084e8, per-specialty accents, violet-glow-on-ink.

  Seven templates. The CARD output is always Portuguese (it's member/public-facing
  content); the control-panel chrome is i18n so it works in PT and EN.

  Export: "Baixar PNG" (modern-screenshot, 2×). For the live-page mockup the
  same-origin iframe is snapshotted and frozen before rasterizing. "Modo captura"
  + DevTools "Capture node screenshot" of #ig-card is the exact fallback.
*/

// ── Accent palette (dark-mode specialty values — bright on the ink background) ──
const ACCENTS: { key: string; value: string }[] = [
  { key: "brand", value: "#c084e8" },
  { key: "cardiologia", value: "#ff8080" },
  { key: "pneumologia", value: "#ffb070" },
  { key: "reumatologia", value: "#ffd96b" },
  { key: "clinica", value: "#6ee79b" },
  { key: "gastro", value: "#5dd8c8" },
  { key: "neurologia", value: "#4dc8e8" },
  { key: "obstetricia", value: "#b59dff" },
  { key: "ginecologia", value: "#f786c0" },
  { key: "pediatria", value: "#ff7b9b" },
  { key: "infectologia", value: "#b8e05a" },
  { key: "nefrologia", value: "#82b4ff" },
  { key: "dermatologia", value: "#fbbf5a" },
];

// hex → rgba with alpha
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const FONT_DISPLAY = "var(--font-bricolage), ui-sans-serif, system-ui, sans-serif";
const FONT_SANS = "var(--font-sans), ui-sans-serif, system-ui, sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

// Imagery already on the site (public/). Paste any other URL in the field —
// including Bunny CDN (https://medhelpspace.b-cdn.net/…) for 60D content.
const SITE_IMAGES: string[] = [
  "/landing/shot-questoes-ecg.webp",
  "/landing/shot-questoes.webp",
  "/landing/shot-resumos.webp",
  "/landing/shot-flashcards.webp",
  "/landing/shot-medvoice.webp",
  "/landing/shot-audiocards.webp",
  "/landing/shot-revalida-up.webp",
  "/landing/hero-quiz.webp",
  "/landing/hero-medvoice.webp",
  "/landing/memorecards/card-1.webp",
  "/landing/memorecards/card-2.webp",
  "/landing/memorecards/card-3.webp",
  "/landing/memorecards/card-4.webp",
  "/landing/memorecards/card-5.webp",
  "/images/medical-equipment.png",
  "/images/students.webp",
];

// Phone-mockup geometry (px, inside the 1080 canvas)
const PHONE_W = 300;
const PHONE_H = 620;
const PHONE_PAD = 11;
const SCREEN_W = PHONE_W - PHONE_PAD * 2; // 278
const SCREEN_H = PHONE_H - PHONE_PAD * 2; // 598
const IFRAME_LOGICAL_W = 390; // iPhone-ish logical width → app renders its mobile layout
const IFRAME_SCALE = SCREEN_W / IFRAME_LOGICAL_W;
const IFRAME_LOGICAL_H = Math.round(SCREEN_H / IFRAME_SCALE);

type Vals = Record<string, string>;

// Canvas height for the current aspect ratio (width is always 1080).
const CardHeightContext = React.createContext<number>(1080);
// During a live-page-mockup export, holds a frozen PNG data-URL of the embedded
// page so the phone renders a static image the exporter can rasterize.
const FrozenPageContext = React.createContext<string | null>(null);

// ── Shared pieces ──────────────────────────────────────────────────────────
function CardShell({
  accent,
  children,
  padded = true,
}: {
  accent: string;
  children: React.ReactNode;
  padded?: boolean;
}) {
  const height = React.useContext(CardHeightContext);
  return (
    <div
      id="ig-card"
      style={{
        width: 1080,
        height,
        position: "relative",
        overflow: "hidden",
        background: "#050509",
        color: "#ededed",
        fontFamily: FONT_SANS,
      }}
    >
      {/* subtle grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${hexA(accent, 0.04)} 1px, transparent 1px), linear-gradient(90deg, ${hexA(accent, 0.04)} 1px, transparent 1px)`,
          backgroundSize: "54px 54px",
        }}
      />
      {/* accent glow top-right + brand glow bottom-left */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(720px 540px at 80% -10%, ${hexA(accent, 0.22)}, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(680px 520px at 8% 110%, rgba(122,29,145,0.18), transparent 60%)",
        }}
      />
      {/* top hairline */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, ${accent}, transparent 70%)`,
        }}
      />
      {/* content */}
      {padded ? (
        <div
          style={{
            position: "relative",
            height: "100%",
            padding: 88,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0 }}>{children}</div>
      )}
    </div>
  );
}

function Eyebrow({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: accent,
      }}
    >
      {children}
    </div>
  );
}

function SpecChip({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: 20,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: accent,
        border: `1px solid ${hexA(accent, 0.45)}`,
        background: hexA(accent, 0.1),
        borderRadius: 999,
        padding: "8px 20px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function BrandFooter({ accent }: { accent: string }) {
  return (
    <div
      style={{
        marginTop: "auto",
        paddingTop: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: "-0.02em",
          color: "#ffffff",
        }}
      >
        MedHelpSpace
        <span style={{ color: "rgba(255,255,255,0.22)", padding: "0 10px" }}>|</span>
        <span style={{ color: accent }}>Revalida</span>
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 22,
          color: "rgba(255,255,255,0.42)",
          letterSpacing: "0.02em",
        }}
      >
        medhelpspace.com.br
      </div>
    </div>
  );
}

// ── Template 1 — Questão do dia ──────────────────────────────────────────────
function QuestaoCard({ v, accent }: { v: Vals; accent: string }) {
  const alts: [string, string][] = [
    ["A", v.a],
    ["B", v.b],
    ["C", v.c],
    ["D", v.d],
  ];
  return (
    <CardShell accent={accent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
        <SpecChip accent={accent}>{v.spec}</SpecChip>
      </div>

      <p
        style={{
          marginTop: 40,
          fontFamily: FONT_SANS,
          fontWeight: 700,
          fontSize: 42,
          lineHeight: 1.28,
          color: "#ffffff",
          letterSpacing: "-0.01em",
        }}
      >
        {v.stem}
      </p>

      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
        {alts.map(([letter, text]) => (
          <div
            key={letter}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "20px 26px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
              borderRadius: 16,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 54,
                height: 54,
                borderRadius: "50%",
                border: `1.5px solid ${hexA(accent, 0.6)}`,
                color: accent,
                fontFamily: FONT_MONO,
                fontWeight: 700,
                fontSize: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {letter}
            </span>
            <span style={{ fontSize: 29, color: "#e8e8ea", lineHeight: 1.3 }}>{text}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 30,
          textAlign: "center",
          fontSize: 27,
          color: "#ffffff",
          background: hexA(accent, 0.12),
          border: `1px solid ${hexA(accent, 0.4)}`,
          borderRadius: 999,
          padding: "18px 30px",
        }}
      >
        {v.cta}
      </div>

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 2 — Dica clínica ────────────────────────────────────────────────
function DicaCard({ v, accent }: { v: Vals; accent: string }) {
  return (
    <CardShell accent={accent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
        <SpecChip accent={accent}>{v.spec}</SpecChip>
      </div>

      <h1
        style={{
          marginTop: 56,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 76,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          color: "#ffffff",
        }}
      >
        {v.title}
      </h1>

      <p
        style={{
          marginTop: 36,
          fontSize: 35,
          lineHeight: 1.5,
          color: "rgba(255,255,255,0.72)",
        }}
      >
        {v.body}
      </p>

      <div
        style={{
          marginTop: 44,
          padding: "28px 32px",
          borderLeft: `4px solid ${accent}`,
          background: hexA(accent, 0.08),
          borderRadius: "0 16px 16px 0",
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 20,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: accent,
            marginBottom: 12,
          }}
        >
          Lembre-se
        </div>
        <div style={{ fontSize: 33, fontWeight: 600, color: "#ffffff", lineHeight: 1.35 }}>
          {v.pearl}
        </div>
      </div>

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 3 — Promo / oferta ──────────────────────────────────────────────
function PromoCard({ v, accent }: { v: Vals; accent: string }) {
  return (
    <CardShell accent={accent}>
      <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>

      <h1
        style={{
          marginTop: 40,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 82,
          lineHeight: 1.03,
          letterSpacing: "-0.03em",
          color: "#ffffff",
        }}
      >
        {v.headline}
      </h1>

      <p
        style={{
          marginTop: 30,
          fontSize: 34,
          lineHeight: 1.45,
          color: "rgba(255,255,255,0.7)",
          maxWidth: "20ch",
        }}
      >
        {v.sub}
      </p>

      <div style={{ marginTop: "auto", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 40,
              textDecoration: "line-through",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            {v.basePrice}
          </span>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 96,
              lineHeight: 0.9,
              letterSpacing: "-0.03em",
              color: "#ffffff",
            }}
          >
            {v.salePrice}
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontWeight: 800,
              fontSize: 30,
              color: accent,
              border: `1.5px solid ${hexA(accent, 0.55)}`,
              background: hexA(accent, 0.14),
              borderRadius: 12,
              padding: "8px 16px",
              marginBottom: 14,
            }}
          >
            {v.badge}
          </span>
        </div>
        <div style={{ marginTop: 16, fontSize: 27, color: accent, fontWeight: 600 }}>
          {v.economize}
        </div>

        <div
          style={{
            marginTop: 34,
            textAlign: "center",
            fontFamily: FONT_SANS,
            fontWeight: 700,
            fontSize: 32,
            color: "#0a0510",
            background: accent,
            borderRadius: 16,
            padding: "24px 30px",
            boxShadow: `0 0 60px ${hexA(accent, 0.35)}`,
          }}
        >
          {v.cta}
        </div>
      </div>

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 4 — Frase / motivação ───────────────────────────────────────────
function FraseCard({ v, accent }: { v: Vals; accent: string }) {
  return (
    <CardShell accent={accent}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ width: 72, height: 5, borderRadius: 3, background: accent, marginBottom: 48 }} />
        {/* key={accent} remounts the node on color change — WebKit doesn't
            re-run background-clip:text when `background` updates in place,
            which left the gradient painting over the text until a reflow. */}
        <blockquote
          key={accent}
          style={{
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 78,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            background: `linear-gradient(135deg, #ffffff 45%, ${accent})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
            maxWidth: "16ch",
          }}
        >
          {v.quote}
        </blockquote>
        <div
          style={{
            marginTop: 48,
            fontFamily: FONT_MONO,
            fontSize: 24,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {v.sub}
        </div>
      </div>

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 5 — Cronograma (structured "document" layout) ───────────────────
function CronogramaCard({ v, accent }: { v: Vals; accent: string }) {
  const steps: { n: string; label: string; title: string; body: string }[] = [
    { n: "1", label: v.step1label, title: v.step1title, body: v.step1body },
    { n: "2", label: v.step2label, title: v.step2title, body: v.step2body },
    { n: "3", label: v.step3label, title: v.step3title, body: v.step3body },
  ];
  return (
    <CardShell accent={accent}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 60,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: "#ffffff",
            maxWidth: "13ch",
          }}
        >
          {v.title}
        </h1>
        <span
          style={{
            flexShrink: 0,
            marginTop: 8,
            fontFamily: FONT_MONO,
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: accent,
            border: `1px solid ${hexA(accent, 0.4)}`,
            borderRadius: 8,
            padding: "8px 16px",
          }}
        >
          {v.dateBadge}
        </span>
      </div>

      <div style={{ marginTop: 40, display: "flex", flexDirection: "column", flex: 1 }}>
        {steps.map((s, i) => (
          <div
            key={s.n}
            style={{
              display: "flex",
              gap: 26,
              padding: "26px 0",
              borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 60,
                height: 60,
                borderRadius: 12,
                background: hexA(accent, 0.14),
                border: `1px solid ${hexA(accent, 0.4)}`,
                color: accent,
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {s.n}
            </span>
            <div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 19,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: accent,
                }}
              >
                {s.label}
              </div>
              <div style={{ marginTop: 8, fontSize: 33, fontWeight: 700, color: "#ffffff" }}>
                {s.title}
              </div>
              <div style={{ marginTop: 6, fontSize: 26, color: "rgba(255,255,255,0.62)", lineHeight: 1.4 }}>
                {s.body}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "22px 26px",
          borderLeft: `4px solid ${accent}`,
          background: hexA(accent, 0.08),
          borderRadius: "0 14px 14px 0",
        }}
      >
        <span style={{ flexShrink: 0, width: 16, height: 16, background: accent, borderRadius: 3 }} />
        <span style={{ fontSize: 26, color: "#ffffff", fontWeight: 500, lineHeight: 1.35 }}>
          {v.footnote}
        </span>
      </div>

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Shared image placeholder ─────────────────────────────────────────────────
function ImgPlaceholder() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,255,255,0.35)",
        fontFamily: FONT_MONO,
        fontSize: 22,
        textAlign: "center",
        border: "2px dashed rgba(255,255,255,0.14)",
        borderRadius: 12,
        padding: 24,
      }}
    >
      {t("studio.addImage")}
    </div>
  );
}

// ── Template 6 — Imagem (photo / screenshot hero) ────────────────────────────
function ImagemCard({ v, accent }: { v: Vals; accent: string }) {
  const height = React.useContext(CardHeightContext);
  const imgH = Math.round(height * 0.56);
  const fit = v.fit || "cover-center";
  const objectFit: React.CSSProperties["objectFit"] = fit === "contain" ? "contain" : "cover";
  const objectPosition = fit === "cover-top" ? "top" : fit === "cover-bottom" ? "bottom" : "center";
  return (
    <CardShell accent={accent} padded={false}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", width: "100%", height: imgH, flexShrink: 0, background: "#0b0b12" }}>
          {v.image ? (
            <img
              data-no-frame
              src={v.image}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit,
                objectPosition,
                display: "block",
              }}
            />
          ) : (
            <div style={{ padding: 40, height: "100%" }}>
              <ImgPlaceholder />
            </div>
          )}
          {/* scrim fading the image into the ink background */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, transparent 50%, rgba(5,5,9,0.6) 80%, #050509)",
            }}
          />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 88px 88px" }}>
          <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
          <h1
            style={{
              marginTop: 16,
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 58,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#ffffff",
            }}
          >
            {v.headline}
          </h1>
          {v.caption ? (
            <p style={{ marginTop: 14, fontSize: 30, color: "rgba(255,255,255,0.66)", lineHeight: 1.4 }}>
              {v.caption}
            </p>
          ) : null}
          <BrandFooter accent={accent} />
        </div>
      </div>
    </CardShell>
  );
}

// ── Phone frame ──────────────────────────────────────────────────────────────
function PhoneFrame({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        width: PHONE_W,
        height: PHONE_H,
        borderRadius: 48,
        background: "#0a0a0f",
        border: "2px solid rgba(255,255,255,0.16)",
        padding: PHONE_PAD,
        boxShadow: `0 34px 80px rgba(0,0,0,0.6), 0 0 70px ${hexA(accent, 0.18)}`,
      }}
    >
      {/* side buttons */}
      <div style={{ position: "absolute", left: -3, top: 120, width: 3, height: 52, borderRadius: 3, background: "rgba(255,255,255,0.14)" }} />
      <div style={{ position: "absolute", left: -3, top: 186, width: 3, height: 52, borderRadius: 3, background: "rgba(255,255,255,0.14)" }} />
      <div style={{ position: "absolute", right: -3, top: 150, width: 3, height: 74, borderRadius: 3, background: "rgba(255,255,255,0.14)" }} />
      {/* screen */}
      <div style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, borderRadius: 38, overflow: "hidden", background: "#000" }}>
        {children}
        {/* dynamic island */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 92,
            height: 26,
            borderRadius: 999,
            background: "#000",
            zIndex: 5,
          }}
        />
      </div>
    </div>
  );
}

// ── Template 7 — Mockup (celular): image or live site page ───────────────────
function MockupCard({ v, accent }: { v: Vals; accent: string }) {
  const isPage = v.mode === "page";
  const frozen = React.useContext(FrozenPageContext);
  return (
    <CardShell accent={accent}>
      <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
      <h1
        style={{
          marginTop: 14,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 52,
          lineHeight: 1.08,
          letterSpacing: "-0.02em",
          color: "#ffffff",
          maxWidth: "20ch",
        }}
      >
        {v.headline}
      </h1>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 6 }}>
        <PhoneFrame accent={accent}>
          {isPage ? (
            frozen ? (
              <img data-no-frame src={frozen} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
            ) : (
              <iframe
                src={v.pagePath || "/"}
                title="preview"
                style={{
                  width: IFRAME_LOGICAL_W,
                  height: IFRAME_LOGICAL_H,
                  border: 0,
                  transform: `scale(${IFRAME_SCALE})`,
                  transformOrigin: "top left",
                  background: "#07070f",
                }}
              />
            )
          ) : v.image ? (
            <img data-no-frame src={v.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ padding: 24, height: "100%" }}>
              <ImgPlaceholder />
            </div>
          )}
        </PhoneFrame>
      </div>
      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template registry ────────────────────────────────────────────────────────
// `labelKey`/`labelKey` on options resolve to studio.fields.* / studio.opt.* i18n
// keys. Template names resolve to studio.templates.<id>. `defaults` are the card
// CONTENT and stay Portuguese (the generated post is always PT).
type Field = {
  key: string;
  labelKey: string;
  type?: "text" | "textarea" | "image" | "select";
  options?: { value: string; labelKey: string }[];
  showIf?: (v: Vals) => boolean;
};
type TemplateId = "questao" | "dica" | "promo" | "frase" | "cronograma" | "imagem" | "mockup";

type Template = {
  id: TemplateId;
  fields: Field[];
  defaults: Vals;
  Render: (props: { v: Vals; accent: string }) => React.ReactElement;
};

const TEMPLATES: Template[] = [
  {
    id: "questao",
    Render: QuestaoCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "spec", labelKey: "spec" },
      { key: "stem", labelKey: "stem", type: "textarea" },
      { key: "a", labelKey: "altA" },
      { key: "b", labelKey: "altB" },
      { key: "c", labelKey: "altC" },
      { key: "d", labelKey: "altD" },
      { key: "cta", labelKey: "cta", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Questão do dia",
      spec: "Cardiologia",
      stem: "Homem, 58 anos, dor torácica há 40 min, com supra de ST em D2, D3 e aVF. Qual a conduta imediata?",
      a: "Aguardar nova troponina em 6 horas",
      b: "Reperfusão coronária o mais rápido possível",
      c: "Solicitar cintilografia miocárdica",
      d: "Iniciar apenas anticoagulação plena",
      cta: "Qual a alternativa correta? Responde aí nos comentários 👇",
    },
  },
  {
    id: "dica",
    Render: DicaCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "spec", labelKey: "spec" },
      { key: "title", labelKey: "title", type: "textarea" },
      { key: "body", labelKey: "body", type: "textarea" },
      { key: "pearl", labelKey: "pearl", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Dica clínica",
      spec: "Pneumologia",
      title: "Derrame pleural? Light no automático.",
      body: "Todo derrame que você puncionar, aplique os critérios de Light antes de qualquer coisa. Exsudato x transudato muda toda a investigação.",
      pearl: "Basta 1 critério de Light positivo para classificar como exsudato.",
    },
  },
  {
    id: "promo",
    Render: PromoCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "headline", labelKey: "title", type: "textarea" },
      { key: "sub", labelKey: "sub", type: "textarea" },
      { key: "basePrice", labelKey: "basePrice" },
      { key: "salePrice", labelKey: "salePrice" },
      { key: "badge", labelKey: "badge" },
      { key: "economize", labelKey: "economize" },
      { key: "cta", labelKey: "ctaButton" },
    ],
    defaults: {
      eyebrow: "Turma Revalida 2026.2 · vagas abertas",
      headline: "Estude pelo padrão da prova do INEP.",
      sub: "Questões comentadas, revisão ativa e um plano que se ajusta a você.",
      basePrice: "R$ 1.200",
      salePrice: "R$ 897",
      badge: "-25%",
      economize: "Economize R$ 303 na matrícula",
      cta: "Garanta sua vaga → medhelpspace.com.br",
    },
  },
  {
    id: "frase",
    Render: FraseCard,
    fields: [
      { key: "quote", labelKey: "quote", type: "textarea" },
      { key: "sub", labelKey: "signature" },
    ],
    defaults: {
      quote: "A aprovação não é sorte. É o padrão da prova, estudado todos os dias.",
      sub: "MedHelpSpace · Revalida",
    },
  },
  {
    id: "cronograma",
    Render: CronogramaCard,
    fields: [
      { key: "title", labelKey: "title" },
      { key: "dateBadge", labelKey: "dateBadge" },
      { key: "step1label", labelKey: "step1label" },
      { key: "step1title", labelKey: "step1title" },
      { key: "step1body", labelKey: "step1body", type: "textarea" },
      { key: "step2label", labelKey: "step2label" },
      { key: "step2title", labelKey: "step2title" },
      { key: "step2body", labelKey: "step2body", type: "textarea" },
      { key: "step3label", labelKey: "step3label" },
      { key: "step3title", labelKey: "step3title" },
      { key: "step3body", labelKey: "step3body", type: "textarea" },
      { key: "footnote", labelKey: "footnote", type: "textarea" },
    ],
    defaults: {
      title: "Como funciona a sua turma",
      dateBadge: "Atualizado · Jul 2026",
      step1label: "Etapa 1 · Base",
      step1title: "Fundamentos por especialidade",
      step1body: "Resumos, MedVoice e questões comentadas para construir a base.",
      step2label: "Etapa 2 · Revisão ativa",
      step2title: "Flashcards e revisão espaçada",
      step2body: "O sistema traz de volta o que você está prestes a esquecer.",
      step3label: "Etapa 3 · Reta final",
      step3title: "MedHelp 60D destrava",
      step3body: "Fórmula MedHelp, MemoreCards e simulados 100Q nos 60 dias finais.",
      footnote: "O módulo 60D abre automaticamente 60 dias antes da sua prova.",
    },
  },
  {
    id: "imagem",
    Render: ImagemCard,
    fields: [
      { key: "image", labelKey: "image", type: "image" },
      {
        key: "fit",
        labelKey: "fit",
        type: "select",
        options: [
          { value: "cover-center", labelKey: "fitCoverCenter" },
          { value: "cover-top", labelKey: "fitCoverTop" },
          { value: "cover-bottom", labelKey: "fitCoverBottom" },
          { value: "contain", labelKey: "fitContain" },
        ],
      },
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "headline", labelKey: "title", type: "textarea" },
      { key: "caption", labelKey: "caption", type: "textarea" },
    ],
    defaults: {
      image: "/landing/memorecards/card-1.webp",
      fit: "cover-center",
      eyebrow: "Novidade no MedHelp 60D",
      headline: "MemoreCards de Cardiologia já disponíveis",
      caption: "Revisão visual rápida para a reta final da sua prova.",
    },
  },
  {
    id: "mockup",
    Render: MockupCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "headline", labelKey: "title", type: "textarea" },
      {
        key: "mode",
        labelKey: "mode",
        type: "select",
        options: [
          { value: "page", labelKey: "modePage" },
          { value: "image", labelKey: "modeImage" },
        ],
      },
      { key: "pagePath", labelKey: "pagePath", showIf: (v) => v.mode === "page" },
      { key: "image", labelKey: "image", type: "image", showIf: (v) => v.mode === "image" },
    ],
    defaults: {
      eyebrow: "Dentro da plataforma",
      headline: "Estude direto do celular, onde você estiver",
      mode: "page",
      pagePath: "/questoes-revalida",
      image: "/landing/shot-medvoice.webp",
    },
  },
];

// ── Studio shell ─────────────────────────────────────────────────────────────
const SCALES = [0.4, 0.5, 0.62, 1] as const;

const RATIOS = [
  { id: "1-1", label: "1:1", sub: "feed", w: 1080, h: 1080 },
  { id: "4-5", label: "4:5", sub: "feed", w: 1080, h: 1350 },
  { id: "9-16", label: "9:16", sub: "story", w: 1080, h: 1920 },
] as const;
type RatioId = (typeof RATIOS)[number]["id"];

// Drop dev-only overlays (Next/Tanstack devtools, edit toggle) from exports so
// they never leak into a captured live-page mockup. In production these nodes
// don't exist at all.
function exportFilter(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  const id = node.id || "";
  const cls = typeof node.className === "string" ? node.className : "";
  const label = node.getAttribute("aria-label") || "";
  const bad = /next.*dev|nextjs-|tanstack|__next|dev-?tools|editar página|edit-toggle/i;
  return !(bad.test(id) || bad.test(cls) || bad.test(label));
}

export function EstudioClient() {
  const { t } = useTranslation();
  const [templateId, setTemplateId] = useState<TemplateId>("questao");
  const [accent, setAccent] = useState<string>("#c084e8");
  const [scale, setScale] = useState<number>(0.5);
  const [hideUI, setHideUI] = useState<boolean>(false);
  const [ratioId, setRatioId] = useState<RatioId>("1-1");
  const [frozen, setFrozen] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [allValues, setAllValues] = useState<Record<TemplateId, Vals>>(() => {
    const init = {} as Record<TemplateId, Vals>;
    for (const tpl of TEMPLATES) init[tpl.id] = { ...tpl.defaults };
    return init;
  });

  const template = TEMPLATES.find((tpl) => tpl.id === templateId)!;
  const values = allValues[templateId];
  const effectiveScale = hideUI ? 1 : scale;
  const dims = RATIOS.find((r) => r.id === ratioId)!;
  const currentAccent = ACCENTS.find((a) => a.value === accent);

  const update = useCallback(
    (key: string, val: string) => {
      setAllValues((prev) => ({
        ...prev,
        [templateId]: { ...prev[templateId], [key]: val },
      }));
    },
    [templateId],
  );

  const resetCurrent = useCallback(() => {
    setAllValues((prev) => ({ ...prev, [templateId]: { ...template.defaults } }));
  }, [templateId, template.defaults]);

  const download = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { domToPng } = await import("modern-screenshot");
      const card = document.getElementById("ig-card");
      if (!card) return;

      // Live-page mockup: canvas rasterizers can't reach into an <iframe>, but
      // ours is same-origin — so snapshot the embedded page's DOM directly and
      // freeze it into a static <img> before capturing the whole card.
      const iframe = card.querySelector("iframe");
      if (iframe && iframe.contentDocument?.documentElement) {
        let pagePng: string;
        try {
          pagePng = await domToPng(iframe.contentDocument.documentElement, {
            width: IFRAME_LOGICAL_W,
            height: IFRAME_LOGICAL_H,
            scale: 2,
            filter: exportFilter,
          });
        } catch {
          alert(t("studio.liveCaptureFailed"));
          return;
        }
        setFrozen(pagePng);
        // let React swap the iframe for the frozen <img> and decode it
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise((r) => setTimeout(r, 150));
      }

      // Pin the output box to the true canvas size (× 2) so resolution never
      // depends on the preview zoom (the on-screen node is transform-scaled).
      const d = RATIOS.find((r) => r.id === ratioId)!;
      const png = await domToPng(card, {
        width: d.w,
        height: d.h,
        scale: 2,
        filter: exportFilter,
      });
      const a = document.createElement("a");
      a.href = png;
      a.download = `medhelpspace-${templateId}-${ratioId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("[estudio] export failed", err);
      alert(t("studio.exportFailed"));
    } finally {
      setFrozen(null);
      setBusy(false);
    }
  }, [busy, templateId, ratioId, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHideUI(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setHideUI((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Card = template.Render;

  return (
    <div
      style={{
        background: "#050509",
        color: "#ededed",
        fontFamily: FONT_SANS,
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {hideUI ? (
        // ── Capture mode: card only, at true size, top-left ──
        <div style={{ padding: 24 }}>
          <CardHeightContext.Provider value={dims.h}>
            <FrozenPageContext.Provider value={frozen}>
              <Card v={values} accent={accent} />
            </FrozenPageContext.Provider>
          </CardHeightContext.Provider>
          <button
            onClick={() => setHideUI(false)}
            style={{
              position: "fixed",
              bottom: 20,
              right: 20,
              zIndex: 50,
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: "#a8a8a8",
              background: "rgba(10,10,16,0.85)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 999,
              padding: "8px 14px",
              backdropFilter: "blur(8px)",
              cursor: "pointer",
            }}
          >
            {"← " + t("studio.showControls")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 p-6 lg:h-[calc(100dvh-7rem)] lg:flex-row">
          {/* ── Controls (scrolls independently) ── */}
          <section
            className="scrollbar-brand w-full min-h-0 lg:w-[420px] lg:shrink-0 lg:overflow-y-auto"
            style={{
              background: "#0a0a12",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 20,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div>
              <p
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#c084e8",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                {t("studio.eyebrow")}
              </p>
              <h1
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 800,
                  fontSize: 26,
                  letterSpacing: "-0.02em",
                  margin: "6px 0 0",
                  color: "#fff",
                }}
              >
                {t("studio.title")}
              </h1>
              <p style={{ fontSize: 12.5, color: "#8a8a95", margin: "6px 0 0", lineHeight: 1.5 }}>
                {t("studio.subtitle")}
              </p>
            </div>

            {/* Template switcher */}
            <div>
              <Label>{t("studio.model")}</Label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setTemplateId(tpl.id)}
                    style={{
                      padding: "10px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 10,
                      cursor: "pointer",
                      transition: "all .15s",
                      color: templateId === tpl.id ? "#fff" : "#cfcfd6",
                      background: templateId === tpl.id ? "#7a1d91" : "rgba(255,255,255,0.04)",
                      border:
                        templateId === tpl.id
                          ? "1px solid #c084e8"
                          : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {t(`studio.templates.${tpl.id}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Accent picker */}
            <div>
              <Label>{t("studio.color")}</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ACCENTS.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => setAccent(a.value)}
                    title={t(`studio.accents.${a.key}`)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      cursor: "pointer",
                      background: a.value,
                      border:
                        accent === a.value
                          ? "2px solid #fff"
                          : "2px solid rgba(255,255,255,0.12)",
                      boxShadow: accent === a.value ? `0 0 0 3px ${hexA(a.value, 0.4)}` : "none",
                    }}
                  />
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "#8a8a95", margin: "8px 0 0" }}>
                {currentAccent ? t(`studio.accents.${currentAccent.key}`) : ""}
              </p>
            </div>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Label>{t("studio.content")}</Label>
                <button
                  onClick={resetCurrent}
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10.5,
                    color: "#c084e8",
                    background: "rgba(122,29,145,0.14)",
                    border: "1px solid rgba(192,132,232,0.25)",
                    borderRadius: 6,
                    padding: "4px 9px",
                    cursor: "pointer",
                  }}
                >
                  {t("studio.restore")}
                </button>
              </div>
              {template.fields
                .filter((f) => !f.showIf || f.showIf(values))
                .map((f) => (
                  <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <label
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "#7f7f8c",
                      }}
                    >
                      {t(`studio.fields.${f.labelKey}`)}
                    </label>
                    {f.type === "image" ? (
                      <ImageField value={values[f.key] ?? ""} onChange={(val) => update(f.key, val)} />
                    ) : f.type === "select" ? (
                      <select
                        value={values[f.key] ?? ""}
                        onChange={(e) => update(f.key, e.target.value)}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value} style={{ background: "#0a0a12", color: "#fff" }}>
                            {t(`studio.opt.${o.labelKey}`)}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea
                        value={values[f.key] ?? ""}
                        onChange={(e) => update(f.key, e.target.value)}
                        rows={2}
                        style={inputStyle}
                      />
                    ) : (
                      <input
                        type="text"
                        value={values[f.key] ?? ""}
                        onChange={(e) => update(f.key, e.target.value)}
                        style={inputStyle}
                      />
                    )}
                  </div>
                ))}
            </div>

            {/* Format + zoom + export */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
              <Label>{t("studio.format")}</Label>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {RATIOS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRatioId(r.id)}
                    style={{
                      flex: 1,
                      padding: "9px 0",
                      borderRadius: 8,
                      cursor: "pointer",
                      color: ratioId === r.id ? "#fff" : "#cfcfd6",
                      background: ratioId === r.id ? "#7a1d91" : "rgba(255,255,255,0.04)",
                      border: ratioId === r.id ? "1px solid #c084e8" : "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, opacity: 0.6 }}>
                      {t(`studio.ratio_${r.sub}`)} · {r.w}×{r.h}
                    </span>
                  </button>
                ))}
              </div>

              <Label>{t("studio.zoom")}</Label>
              <div style={{ display: "flex", gap: 6 }}>
                {SCALES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 8,
                      cursor: "pointer",
                      color: scale === s ? "#fff" : "#cfcfd6",
                      background: scale === s ? "#7a1d91" : "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {Math.round(s * 100)}%
                  </button>
                ))}
              </div>

              <button
                onClick={download}
                disabled={busy}
                style={{
                  marginTop: 14,
                  width: "100%",
                  padding: "13px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 10,
                  cursor: busy ? "wait" : "pointer",
                  color: "#0a0510",
                  background: "linear-gradient(135deg, #c084e8, #e879f9)",
                  border: "none",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? t("studio.downloading") : `⬇  ${t("studio.download")}`}
              </button>

              <button
                onClick={() => setHideUI(true)}
                style={{
                  marginTop: 8,
                  width: "100%",
                  padding: "11px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 10,
                  cursor: "pointer",
                  color: "#cfcfd6",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {t("studio.captureMode")}
              </button>

              <p style={{ fontSize: 11, color: "#8a8a95", margin: "10px 0 0", lineHeight: 1.5 }}>
                {t("studio.captureHelp", { w: dims.w * 2, h: dims.h * 2 })}
              </p>
            </div>
          </section>

          {/* ── Preview (stays on screen while the builder scrolls) ── */}
          <section
            className="min-h-0 flex-1 lg:overflow-auto"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}
          >
            <div
              style={{
                width: dims.w * effectiveScale,
                height: dims.h * effectiveScale,
                flexShrink: 0,
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: "0 30px 90px rgba(0,0,0,0.7)",
              }}
            >
              <div style={{ width: dims.w, height: dims.h, transform: `scale(${effectiveScale})`, transformOrigin: "top left" }}>
                <CardHeightContext.Provider value={dims.h}>
                  <FrozenPageContext.Provider value={frozen}>
                    <Card v={values} accent={accent} />
                  </FrozenPageContext.Provider>
                </CardHeightContext.Provider>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const setFromFile = (f?: File | null) => {
    if (f && f.type.startsWith("image/")) onChange(URL.createObjectURL(f));
  };

  // Paste an image from the clipboard (Ctrl+V) anywhere while the field is open.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          setFromFile(items[i].getAsFile());
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadLabel = value.startsWith("blob:") ? "upload" : value;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Drop / paste / click zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          setFromFile(e.dataTransfer.files?.[0]);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: value ? 8 : "18px 14px",
          borderRadius: 12,
          cursor: "pointer",
          border: `1.5px dashed ${drag ? "#c084e8" : "rgba(255,255,255,0.16)"}`,
          background: drag ? "rgba(192,132,232,0.1)" : "rgba(255,255,255,0.02)",
          transition: "border-color .15s, background .15s",
        }}
      >
        {value ? (
          <>
            <img
              data-no-frame
              src={value}
              alt=""
              style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flexShrink: 0, background: "#111" }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: "#e8e8ea", fontWeight: 600 }}>{t("studio.changeFile")}</div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: "#8a8a95",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {uploadLabel}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              style={{
                fontFamily: FONT_MONO,
                fontSize: 10.5,
                color: "#a8a8a8",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: "5px 9px",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {t("studio.clear")}
            </button>
          </>
        ) : (
          <div style={{ width: "100%", textAlign: "center", color: "#8a8a95", fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>🖼️</div>
            {t("studio.dropzone")}
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" onChange={(e) => setFromFile(e.target.files?.[0])} style={{ display: "none" }} />
      </div>

      {/* Gallery of existing site imagery */}
      <div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7f7f8c", marginBottom: 6 }}>
          {t("studio.gallery")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {SITE_IMAGES.map((src) => (
            <button
              key={src}
              onClick={() => onChange(src)}
              title={src}
              style={{
                padding: 0,
                aspectRatio: "1 / 1",
                border: value === src ? "2px solid #c084e8" : "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                overflow: "hidden",
                cursor: "pointer",
                background: "#111",
              }}
            >
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      </div>

      {/* URL fallback (for Bunny CDN / any external link) */}
      <div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7f7f8c", marginBottom: 6 }}>
          {t("studio.urlLabel")}
        </div>
        <input
          type="text"
          placeholder={t("studio.imageUrlPlaceholder")}
          value={value.startsWith("blob:") ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT_MONO,
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.14em",
        color: "#9a9aa6",
        marginBottom: 9,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 9,
  padding: "9px 11px",
  fontSize: 13,
  color: "#fff",
  fontFamily: FONT_SANS,
  outline: "none",
  resize: "vertical",
  lineHeight: 1.4,
};
