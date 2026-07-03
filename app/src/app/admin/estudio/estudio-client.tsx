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

// ── Accent palette ────────────────────────────────────────────────────────────
// `value` = dark-mode specialty value (bright, for the ink background). `light` =
// the site's light-mode counterpart (deeper/saturated, for a white surface). Both
// come straight from globals.css (--c-spec-* in .dark vs :root) so nothing is
// invented — a light-background card just switches to the palette the brand
// already designed. See CardTheme / buildTheme below.
const ACCENTS: { key: string; value: string; light: string }[] = [
  { key: "brand", value: "#c084e8", light: "#7a1d91" },
  { key: "cardiologia", value: "#ff8080", light: "#e84343" },
  { key: "pneumologia", value: "#ffb070", light: "#f97316" },
  { key: "reumatologia", value: "#ffd96b", light: "#d4a017" },
  { key: "clinica", value: "#6ee79b", light: "#16a34a" },
  { key: "gastro", value: "#5dd8c8", light: "#0d9488" },
  { key: "neurologia", value: "#4dc8e8", light: "#0891b2" },
  { key: "obstetricia", value: "#b59dff", light: "#7c3aed" },
  { key: "ginecologia", value: "#f786c0", light: "#db2777" },
  { key: "pediatria", value: "#ff7b9b", light: "#e11d48" },
  { key: "infectologia", value: "#b8e05a", light: "#65a30d" },
  { key: "nefrologia", value: "#82b4ff", light: "#2563eb" },
  { key: "dermatologia", value: "#fbbf5a", light: "#b45309" },
];

// dark hex → light-mode hex (for switching accents when the surface is light)
const LIGHT_ACCENT: Record<string, string> = Object.fromEntries(
  ACCENTS.map((a) => [a.value, a.light]),
);

// hex → rgba with alpha
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// hex → "r, g, b" triplet for building rgba(...) with a variable alpha
function rgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.substring(0, 2), 16)}, ${parseInt(h.substring(2, 4), 16)}, ${parseInt(h.substring(4, 6), 16)}`;
}

// WCAG relative luminance (0..1)
function relLum(hex: string): number {
  const h = hex.replace("#", "");
  const lin = [0, 2, 4].map((i) => {
    const c = parseInt(h.substring(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// Best-contrast text color to sit ON a solid fill of `hex` (near-black or white),
// chosen by WCAG contrast. Works for both palettes: bright pastels → dark text
// (preserves the current look); deep light accents → white text.
function bestOn(hex: string): string {
  const L = relLum(hex);
  const cBlack = (L + 0.05) / 0.05;
  const cWhite = 1.05 / (L + 0.05);
  return cBlack >= cWhite ? "#0a0510" : "#ffffff";
}

// Linear blend of two hex colors (t=0 → a, t=1 → b)
function mix(a: string, b: string, t: number): string {
  const ha = a.replace("#", "");
  const hb = b.replace("#", "");
  const ch = (i: number) =>
    Math.round(parseInt(ha.substring(i, i + 2), 16) * (1 - t) + parseInt(hb.substring(i, i + 2), 16) * t);
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${to2(ch(0))}${to2(ch(2))}${to2(ch(4))}`;
}

// ── Card surface themes ───────────────────────────────────────────────────────
// The whole point of the token layer: templates read colors from `theme` instead
// of hardcoding #ffffff / rgba(255,255,255,…) / #050509, so the card background
// can be swapped without white-on-white. `fgRgb` derives from `fgStrong` so muted
// text and panel fills (rgba(fgRgb, α)) flip automatically; `scrimRgb` derives
// from `bg` so image→card scrims fade to the right color.
type CardTheme = {
  id: string;
  bg: string; // solid card background
  fgStrong: string; // primary text (was "#ffffff")
  fgRgb: string; // "r, g, b" of fgStrong for muted text / panels / hairlines
  scrimRgb: string; // "r, g, b" of bg for image→card scrims
  imgBg: string; // image well / placeholder background (was "#0b0b12")
  danger: string; // "Mito" red, contrast-safe on this surface
  gridAlpha: number; // accent grid-line opacity
  glowAccent: number; // top-right accent glow opacity
  brandGlow: string; // bottom-left brand glow (full rgba)
  isLight: boolean;
};

function makeTheme(
  id: string,
  bg: string,
  fgStrong: string,
  imgBg: string,
  danger: string,
  o: { gridAlpha: number; glowAccent: number; brandGlow: string; isLight: boolean },
): CardTheme {
  return {
    id,
    bg,
    fgStrong,
    fgRgb: rgbTriplet(fgStrong),
    scrimRgb: rgbTriplet(bg),
    imgBg,
    danger,
    gridAlpha: o.gridAlpha,
    glowAccent: o.glowAccent,
    brandGlow: o.brandGlow,
    isLight: o.isLight,
  };
}

const LIGHT_OPTS = { gridAlpha: 0.06, glowAccent: 0.1, brandGlow: "rgba(122,29,145,0.06)", isLight: true };

// `accent` is only needed for the accent-tinted "Tinted" surface.
function buildTheme(id: string, accent: string): CardTheme {
  switch (id) {
    case "paper":
      return makeTheme("paper", "#ffffff", "#141019", "#eceaf1", "#dc2626", LIGHT_OPTS);
    case "cream":
      return makeTheme("cream", "#faf6ef", "#1b1710", "#efe8dc", "#dc2626", LIGHT_OPTS);
    case "purple":
      return makeTheme("purple", "#ece3f7", "#1b1226", "#ded0ef", "#dc2626", LIGHT_OPTS);
    case "tinted":
      // Soft wash: mostly white with a HINT of the accent (start from white,
      // add ~12% accent) — not the accent lightened by 12%.
      return makeTheme("tinted", mix("#ffffff", accent, 0.12), "#171320", mix("#ffffff", accent, 0.22), "#dc2626", LIGHT_OPTS);
    default:
      return makeTheme("ink", "#050509", "#ffffff", "#0b0b12", "#ff6b6b", {
        gridAlpha: 0.04,
        glowAccent: 0.22,
        brandGlow: "rgba(122,29,145,0.18)",
        isLight: false,
      });
  }
}

const INK_THEME = buildTheme("ink", "#c084e8");

const BACKGROUNDS = ["ink", "paper", "cream", "purple", "tinted"] as const;
type BgId = (typeof BACKGROUNDS)[number];
// Swatch preview color for each background button (tinted follows the accent).
function bgSwatch(id: BgId, accent: string): string {
  return buildTheme(id, accent).bg;
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

// Specialty hubs for the page picker (slugs from MOCK_SPECIALTIES; /app/<slug>).
const STUDIO_SPECIALTIES: { slug: string; name: string }[] = [
  { slug: "cardiologia", name: "Cardiologia" },
  { slug: "pneumologia", name: "Pneumologia" },
  { slug: "neurologia", name: "Neurologia" },
  { slug: "clinica-medica", name: "Clínica Médica" },
  { slug: "cirurgia", name: "Cirurgia Geral" },
  { slug: "ginecologia", name: "Ginecologia e Obstetrícia" },
  { slug: "pediatria", name: "Pediatria" },
  { slug: "medicina-intensiva", name: "Medicina Intensiva" },
  { slug: "infectologia", name: "Infectologia" },
  { slug: "endocrinologia", name: "Endocrinologia" },
  { slug: "gastroenterologia", name: "Gastroenterologia" },
  { slug: "reumatologia", name: "Reumatologia" },
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
// Active surface theme (ink / paper / cream / purple / tinted). Templates read
// colors from here instead of hardcoding dark-mode literals.
const CardThemeContext = React.createContext<CardTheme>(INK_THEME);
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
  const theme = React.useContext(CardThemeContext);
  return (
    <div
      id="ig-card"
      style={{
        width: 1080,
        height,
        position: "relative",
        overflow: "hidden",
        background: theme.bg,
        color: theme.fgStrong,
        fontFamily: FONT_SANS,
      }}
    >
      {/* subtle grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(${hexA(accent, theme.gridAlpha)} 1px, transparent 1px), linear-gradient(90deg, ${hexA(accent, theme.gridAlpha)} 1px, transparent 1px)`,
          backgroundSize: "54px 54px",
        }}
      />
      {/* accent glow top-right + brand glow bottom-left */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(720px 540px at 80% -10%, ${hexA(accent, theme.glowAccent)}, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(680px 520px at 8% 110%, ${theme.brandGlow}, transparent 60%)`,
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
  const theme = React.useContext(CardThemeContext);
  return (
    <div
      style={{
        marginTop: "auto",
        paddingTop: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: `1px solid rgba(${theme.fgRgb}, 0.08)`,
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 30,
          letterSpacing: "-0.02em",
          color: theme.fgStrong,
        }}
      >
        MedHelpSpace
        <span style={{ color: `rgba(${theme.fgRgb}, 0.22)`, padding: "0 10px" }}>|</span>
        <span style={{ color: accent }}>Revalida</span>
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 22,
          color: `rgba(${theme.fgRgb}, 0.42)`,
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
  const theme = React.useContext(CardThemeContext);
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
          color: theme.fgStrong,
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
              border: `1px solid rgba(${theme.fgRgb}, 0.08)`,
              background: `rgba(${theme.fgRgb}, 0.02)`,
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
            <span style={{ fontSize: 29, color: `rgba(${theme.fgRgb}, 0.9)`, lineHeight: 1.3 }}>{text}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 30,
          textAlign: "center",
          fontSize: 27,
          color: theme.fgStrong,
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
  const theme = React.useContext(CardThemeContext);
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
          color: theme.fgStrong,
        }}
      >
        {v.title}
      </h1>

      <p
        style={{
          marginTop: 36,
          fontSize: 35,
          lineHeight: 1.5,
          color: `rgba(${theme.fgRgb}, 0.72)`,
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
        <div style={{ fontSize: 33, fontWeight: 600, color: theme.fgStrong, lineHeight: 1.35 }}>
          {v.pearl}
        </div>
      </div>

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 3 — Promo / oferta ──────────────────────────────────────────────
function PromoCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
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
          color: theme.fgStrong,
        }}
      >
        {v.headline}
      </h1>

      <p
        style={{
          marginTop: 30,
          fontSize: 34,
          lineHeight: 1.45,
          color: `rgba(${theme.fgRgb}, 0.7)`,
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
              color: `rgba(${theme.fgRgb}, 0.4)`,
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
              color: theme.fgStrong,
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
            color: bestOn(accent),
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
  const theme = React.useContext(CardThemeContext);
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
        {/* key remounts the node on color/theme change — WebKit doesn't
            re-run background-clip:text when `background` updates in place,
            which left the gradient painting over the text until a reflow. */}
        <blockquote
          key={accent + theme.id}
          style={{
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 78,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            background: `linear-gradient(135deg, ${theme.fgStrong} 45%, ${accent})`,
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
            color: `rgba(${theme.fgRgb}, 0.5)`,
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
  const theme = React.useContext(CardThemeContext);
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
            color: theme.fgStrong,
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
              borderTop: i === 0 ? "none" : `1px solid rgba(${theme.fgRgb}, 0.08)`,
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
              <div style={{ marginTop: 8, fontSize: 33, fontWeight: 700, color: theme.fgStrong }}>
                {s.title}
              </div>
              <div style={{ marginTop: 6, fontSize: 26, color: `rgba(${theme.fgRgb}, 0.62)`, lineHeight: 1.4 }}>
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
        <span style={{ fontSize: 26, color: theme.fgStrong, fontWeight: 500, lineHeight: 1.35 }}>
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
  const theme = React.useContext(CardThemeContext);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: `rgba(${theme.fgRgb}, 0.35)`,
        fontFamily: FONT_MONO,
        fontSize: 22,
        textAlign: "center",
        border: `2px dashed rgba(${theme.fgRgb}, 0.14)`,
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
  const theme = React.useContext(CardThemeContext);
  const imgH = Math.round(height * 0.56);
  const fit = v.fit || "cover-center";
  const objectFit: React.CSSProperties["objectFit"] = fit === "contain" ? "contain" : "cover";
  const objectPosition = fit === "cover-top" ? "top" : fit === "cover-bottom" ? "bottom" : "center";
  return (
    <CardShell accent={accent} padded={false}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "relative", width: "100%", height: imgH, flexShrink: 0, background: theme.imgBg }}>
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
          {/* scrim fading the image into the card background */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(to bottom, transparent 50%, rgba(${theme.scrimRgb}, 0.6) 80%, ${theme.bg})`,
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
              color: theme.fgStrong,
            }}
          >
            {v.headline}
          </h1>
          {v.caption ? (
            <p style={{ marginTop: 14, fontSize: 30, color: `rgba(${theme.fgRgb}, 0.66)`, lineHeight: 1.4 }}>
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
  const theme = React.useContext(CardThemeContext);
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
          color: theme.fgStrong,
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

// ── List helper: one entry per non-empty line ────────────────────────────────
function toLines(s: string): string[] {
  return (s || "").split("\n").map((x) => x.trim()).filter(Boolean);
}

// ── Template 8 — Nuvem de temas (pill cloud; lines starting with * = destaque) ─
function NuvemCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  const items = toLines(v.topics);
  return (
    <CardShell accent={accent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
        {v.spec ? <SpecChip accent={accent}>{v.spec}</SpecChip> : null}
      </div>

      <h1
        style={{
          marginTop: 40,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.06,
          letterSpacing: "-0.03em",
          color: theme.fgStrong,
          maxWidth: "18ch",
        }}
      >
        {v.title}
      </h1>

      <div
        style={{
          marginTop: 44,
          flex: 1,
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          alignContent: "flex-start",
        }}
      >
        {items.map((raw, i) => {
          const hot = raw.startsWith("*");
          const text = hot ? raw.slice(1).trim() : raw;
          return (
            <span
              key={i}
              style={{
                fontFamily: FONT_SANS,
                fontSize: 32,
                fontWeight: 600,
                padding: "16px 30px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                color: hot ? bestOn(accent) : `rgba(${theme.fgRgb}, 0.9)`,
                background: hot ? accent : hexA(accent, 0.08),
                border: hot ? `1px solid ${accent}` : `1px solid rgba(${theme.fgRgb}, 0.12)`,
                boxShadow: hot ? `0 0 40px ${hexA(accent, 0.35)}` : "none",
              }}
            >
              {text}
            </span>
          );
        })}
      </div>

      {v.footnote ? (
        <div style={{ marginTop: 20, fontFamily: FONT_MONO, fontSize: 22, color: hexA(accent, 0.9) }}>
          {v.footnote}
        </div>
      ) : null}

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 9 — Comparação (two-column contrast) ────────────────────────────
function ComparacaoCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  const column = (title: string, items: string[], filled: boolean) => (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 34,
          textAlign: "center",
          color: filled ? bestOn(accent) : accent,
          background: filled ? accent : hexA(accent, 0.1),
          border: `1px solid ${filled ? accent : hexA(accent, 0.4)}`,
          borderRadius: 14,
          padding: "16px 12px",
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              fontSize: 27,
              color: `rgba(${theme.fgRgb}, 0.88)`,
              lineHeight: 1.35,
              padding: "14px 18px",
              background: `rgba(${theme.fgRgb}, 0.03)`,
              border: `1px solid rgba(${theme.fgRgb}, 0.07)`,
              borderRadius: 12,
            }}
          >
            {it}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <CardShell accent={accent}>
      <div style={{ textAlign: "center" }}>
        <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
        <h1
          style={{
            marginTop: 14,
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 58,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: theme.fgStrong,
          }}
        >
          {v.title}
        </h1>
      </div>

      <div style={{ marginTop: 40, flex: 1, display: "flex", gap: 22, alignItems: "flex-start" }}>
        {column(v.leftTitle, toLines(v.leftItems), true)}
        <div
          style={{
            alignSelf: "center",
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 44,
            color: hexA(accent, 0.85),
          }}
        >
          ×
        </div>
        {column(v.rightTitle, toLines(v.rightItems), false)}
      </div>

      {v.footnote ? (
        <div
          style={{
            marginTop: 12,
            padding: "20px 24px",
            borderLeft: `4px solid ${accent}`,
            background: hexA(accent, 0.08),
            borderRadius: "0 12px 12px 0",
            fontSize: 25,
            color: theme.fgStrong,
            lineHeight: 1.35,
          }}
        >
          {v.footnote}
        </div>
      ) : null}

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 10 — Mito × Verdade ─────────────────────────────────────────────
function MitoVerdadeCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  const block = (label: string, text: string, color: string, mark: string) => (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 16,
        padding: "36px 40px",
        borderRadius: 20,
        background: hexA(color, 0.1),
        border: `1px solid ${hexA(color, 0.4)}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            flexShrink: 0,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: color,
            color: bestOn(color),
            fontWeight: 800,
            fontSize: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {mark}
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ fontSize: 34, lineHeight: 1.4, color: theme.fgStrong, fontWeight: 500 }}>{text}</div>
    </div>
  );
  return (
    <CardShell accent={accent}>
      <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
      <h1
        style={{
          marginTop: 16,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 52,
          lineHeight: 1.08,
          letterSpacing: "-0.02em",
          color: theme.fgStrong,
          maxWidth: "20ch",
        }}
      >
        {v.title}
      </h1>
      <div style={{ marginTop: 34, flex: 1, display: "flex", flexDirection: "column", gap: 22 }}>
        {block("Mito", v.myth, theme.danger, "✕")}
        {block("Verdade", v.truth, accent, "✓")}
      </div>
      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 11 — Checklist ──────────────────────────────────────────────────
function ChecklistCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  const items = toLines(v.items);
  return (
    <CardShell accent={accent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
        {v.spec ? <SpecChip accent={accent}>{v.spec}</SpecChip> : null}
      </div>

      <h1
        style={{
          marginTop: 36,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 62,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          color: theme.fgStrong,
          maxWidth: "18ch",
        }}
      >
        {v.title}
      </h1>

      <div style={{ marginTop: 40, flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span
              style={{
                flexShrink: 0,
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: hexA(accent, 0.14),
                border: `1.5px solid ${accent}`,
                color: accent,
                fontWeight: 800,
                fontSize: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✓
            </span>
            <span style={{ fontSize: 33, color: `rgba(${theme.fgRgb}, 0.92)`, lineHeight: 1.3 }}>{it}</span>
          </div>
        ))}
      </div>

      {v.footnote ? (
        <div
          style={{
            marginTop: 20,
            textAlign: "center",
            fontSize: 27,
            color: theme.fgStrong,
            background: hexA(accent, 0.12),
            border: `1px solid ${hexA(accent, 0.4)}`,
            borderRadius: 999,
            padding: "16px 26px",
          }}
        >
          {v.footnote}
        </div>
      ) : null}

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 12 — Mnemônico / Macete (lines: "L=Palavra=detalhe") ────────────
function MnemonicoCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  const rows = toLines(v.items).map((l) => {
    const parts = l.split("=").map((x) => x.trim());
    return { letter: parts[0] || "", word: parts[1] || "", detail: parts[2] || "" };
  });
  return (
    <CardShell accent={accent}>
      <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
      <h1
        style={{
          marginTop: 14,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 88,
          lineHeight: 1,
          letterSpacing: "0.02em",
          color: accent,
        }}
      >
        {v.title}
      </h1>
      {v.sub ? (
        <p style={{ marginTop: 10, fontSize: 30, color: `rgba(${theme.fgRgb}, 0.7)` }}>{v.sub}</p>
      ) : null}

      <div style={{ marginTop: 34, flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <span
              style={{
                flexShrink: 0,
                width: 58,
                height: 58,
                borderRadius: 12,
                background: hexA(accent, 0.14),
                border: `1px solid ${hexA(accent, 0.4)}`,
                color: accent,
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {r.letter}
            </span>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 32, fontWeight: 700, color: theme.fgStrong }}>{r.word}</span>
              {r.detail ? (
                <span style={{ fontSize: 26, color: `rgba(${theme.fgRgb}, 0.6)` }}>{"  ·  " + r.detail}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Shared: object-fit / position from a `fit` field ─────────────────────────
function fitProps(fit: string): { objectFit: React.CSSProperties["objectFit"]; objectPosition: string } {
  return {
    objectFit: fit === "contain" ? "contain" : "cover",
    objectPosition: fit === "cover-top" ? "top" : fit === "cover-bottom" ? "bottom" : "center",
  };
}

// ── Template 13 — Imagem em tela cheia (full-bleed + overlay) ─────────────────
function DestaqueCard({ v, accent }: { v: Vals; accent: string }) {
  const { objectFit, objectPosition } = fitProps(v.fit || "cover-center");
  return (
    <CardShell accent={accent} padded={false}>
      {v.image ? (
        <img
          data-no-frame
          src={v.image}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit, objectPosition, display: "block" }}
        />
      ) : (
        <div style={{ padding: 88, height: "100%" }}>
          <ImgPlaceholder />
        </div>
      )}
      {/* legibility scrims: darken top for the brand mark, bottom for the text */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(5,5,9,0.72) 0%, transparent 24%, transparent 44%, rgba(5,5,9,0.86) 80%, #050509 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(900px 520px at 50% 118%, ${hexA(accent, 0.28)}, transparent 60%)`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, padding: 88, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", color: "#ffffff" }}>
          MedHelpSpace
          <span style={{ color: "rgba(255,255,255,0.3)", padding: "0 8px" }}>|</span>
          <span style={{ color: accent }}>Revalida</span>
        </div>
        <div>
          <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
          <h1
            style={{
              marginTop: 14,
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 78,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              color: "#ffffff",
              textShadow: "0 4px 30px rgba(0,0,0,0.5)",
            }}
          >
            {v.headline}
          </h1>
          {v.caption ? (
            <p style={{ marginTop: 18, fontSize: 30, color: "rgba(255,255,255,0.82)" }}>{v.caption}</p>
          ) : null}
        </div>
      </div>
    </CardShell>
  );
}

// ── Template 14 — Meio a meio (image left, text right) ───────────────────────
function SplitCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  const { objectFit, objectPosition } = fitProps(v.fit || "cover-center");
  const pills = toLines(v.pills);
  return (
    <CardShell accent={accent} padded={false}>
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>
        <div style={{ width: "50%", height: "100%", position: "relative", background: theme.imgBg, flexShrink: 0 }}>
          {v.image ? (
            <img data-no-frame src={v.image} alt="" style={{ width: "100%", height: "100%", objectFit, objectPosition, display: "block" }} />
          ) : (
            <div style={{ padding: 40, height: "100%" }}>
              <ImgPlaceholder />
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to right, transparent 68%, rgba(${theme.scrimRgb}, 0.9))` }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "72px 64px" }}>
          <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
          <h1
            style={{
              marginTop: 18,
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 56,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              color: theme.fgStrong,
            }}
          >
            {v.headline}
          </h1>
          {v.body ? (
            <p style={{ marginTop: 22, fontSize: 30, lineHeight: 1.45, color: `rgba(${theme.fgRgb}, 0.72)` }}>{v.body}</p>
          ) : null}
          {pills.length ? (
            <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 12 }}>
              {pills.map((p, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: 24,
                    fontWeight: 600,
                    color: accent,
                    border: `1px solid ${hexA(accent, 0.4)}`,
                    background: hexA(accent, 0.1),
                    borderRadius: 999,
                    padding: "10px 22px",
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          ) : null}
          <div style={{ marginTop: "auto", paddingTop: 30, fontFamily: FONT_MONO, fontSize: 22, color: `rgba(${theme.fgRgb}, 0.5)` }}>
            medhelpspace.com.br
          </div>
        </div>
      </div>
    </CardShell>
  );
}

// ── Template 15 — Imagem clínica + selo (callout) ────────────────────────────
function ClinicaCard({ v, accent }: { v: Vals; accent: string }) {
  const height = React.useContext(CardHeightContext);
  const theme = React.useContext(CardThemeContext);
  const boxH = Math.round(height * 0.42);
  const { objectFit, objectPosition } = fitProps(v.fit || "cover-center");
  return (
    <CardShell accent={accent}>
      <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
      <h1
        style={{
          marginTop: 14,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 60,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          color: theme.fgStrong,
          maxWidth: "18ch",
        }}
      >
        {v.headline}
      </h1>

      <div
        style={{
          marginTop: 34,
          position: "relative",
          width: "100%",
          height: boxH,
          borderRadius: 20,
          overflow: "hidden",
          border: `1px solid ${hexA(accent, 0.35)}`,
          background: theme.imgBg,
          boxShadow: `0 0 60px ${hexA(accent, 0.16)}`,
        }}
      >
        {v.image ? (
          <img data-no-frame src={v.image} alt="" style={{ width: "100%", height: "100%", objectFit, objectPosition, display: "block" }} />
        ) : (
          <div style={{ padding: 30, height: "100%" }}>
            <ImgPlaceholder />
          </div>
        )}
        {v.callout ? (
          <span
            style={{
              position: "absolute",
              top: 22,
              right: 22,
              fontFamily: FONT_MONO,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: bestOn(accent),
              background: accent,
              borderRadius: 999,
              padding: "10px 20px",
              boxShadow: `0 6px 30px ${hexA(accent, 0.5)}`,
            }}
          >
            {v.callout}
          </span>
        ) : null}
      </div>

      {v.caption ? (
        <div
          style={{
            marginTop: "auto",
            marginBottom: 4,
            textAlign: "center",
            fontSize: 30,
            color: theme.fgStrong,
            background: hexA(accent, 0.12),
            border: `1px solid ${hexA(accent, 0.4)}`,
            borderRadius: 999,
            padding: "18px 28px",
          }}
        >
          {v.caption}
        </div>
      ) : null}

      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 16 — Depoimento (testimonial with avatar) ───────────────────────
function DepoimentoCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  return (
    <CardShell accent={accent}>
      <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 36 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 150, lineHeight: 0.55, color: hexA(accent, 0.5) }}>“</div>
        <blockquote
          style={{
            margin: 0,
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 56,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            color: theme.fgStrong,
            maxWidth: "20ch",
          }}
        >
          {v.quote}
        </blockquote>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              background: theme.imgBg,
              border: `2px solid ${hexA(accent, 0.5)}`,
            }}
          >
            {v.image ? (
              <img data-no-frame src={v.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : null}
          </div>
          <div>
            <div style={{ fontSize: 34, fontWeight: 700, color: theme.fgStrong }}>{v.name}</div>
            {v.role ? (
              <div
                style={{
                  marginTop: 6,
                  fontFamily: FONT_MONO,
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: accent,
                }}
              >
                {v.role}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 17 — Número gigante (big stat) ──────────────────────────────────
function NumeroCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  const pills = toLines(v.pills);
  return (
    <CardShell accent={accent}>
      <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        {/* key — see FraseCard: WebKit won't re-run background-clip:text in place */}
        <div
          key={accent + theme.id}
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 240,
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
            background: `linear-gradient(135deg, ${theme.fgStrong} 40%, ${accent})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          {v.bignum}
        </div>
        <p style={{ marginTop: 20, fontSize: 36, lineHeight: 1.4, color: `rgba(${theme.fgRgb}, 0.78)`, maxWidth: "22ch" }}>
          {v.label}
        </p>
        {pills.length ? (
          <div style={{ marginTop: 30, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            {pills.map((p, i) => (
              <span
                key={i}
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: 24,
                  fontWeight: 600,
                  color: accent,
                  border: `1px solid ${hexA(accent, 0.4)}`,
                  background: hexA(accent, 0.1),
                  borderRadius: 999,
                  padding: "12px 24px",
                }}
              >
                {p}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 18 — Grade de recursos (lines: "Título|descrição") ──────────────
function RecursosCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  const items = toLines(v.items).map((l) => {
    const [title, ...rest] = l.split("|");
    return { title: (title || "").trim(), desc: rest.join("|").trim() };
  });
  return (
    <CardShell accent={accent}>
      <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
      <h1
        style={{
          marginTop: 14,
          fontFamily: FONT_DISPLAY,
          fontWeight: 800,
          fontSize: 60,
          lineHeight: 1.05,
          letterSpacing: "-0.03em",
          color: theme.fgStrong,
          maxWidth: "16ch",
        }}
      >
        {v.title}
      </h1>
      <div style={{ marginTop: 40, flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 30,
              borderRadius: 18,
              background: `rgba(${theme.fgRgb}, 0.03)`,
              border: `1px solid rgba(${theme.fgRgb}, 0.08)`,
            }}
          >
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: hexA(accent, 0.16),
                border: `1px solid ${hexA(accent, 0.4)}`,
                color: accent,
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {String(i + 1)}
            </span>
            <div style={{ fontSize: 32, fontWeight: 700, color: theme.fgStrong, lineHeight: 1.15 }}>{it.title}</div>
            {it.desc ? <div style={{ fontSize: 25, color: `rgba(${theme.fgRgb}, 0.62)`, lineHeight: 1.35 }}>{it.desc}</div> : null}
          </div>
        ))}
      </div>
      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 19 — Capa de carrossel (slide-1 cover) ──────────────────────────
function CarrosselCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  return (
    <CardShell accent={accent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
        {v.index ? (
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 26,
              fontWeight: 700,
              color: accent,
              border: `1px solid ${hexA(accent, 0.4)}`,
              borderRadius: 10,
              padding: "8px 16px",
            }}
          >
            {v.index}
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 96,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: theme.fgStrong,
            maxWidth: "14ch",
          }}
        >
          {v.title}
        </h1>
        {v.sub ? (
          <p style={{ marginTop: 28, fontSize: 36, lineHeight: 1.4, color: `rgba(${theme.fgRgb}, 0.72)`, maxWidth: "24ch" }}>
            {v.sub}
          </p>
        ) : null}
      </div>
      {v.swipe ? (
        <div style={{ marginBottom: 4 }}>
          <span
            style={{
              display: "inline-block",
              fontFamily: FONT_SANS,
              fontSize: 30,
              fontWeight: 700,
              color: bestOn(accent),
              background: accent,
              borderRadius: 999,
              padding: "16px 30px",
              boxShadow: `0 0 50px ${hexA(accent, 0.35)}`,
            }}
          >
            {v.swipe}
          </span>
        </div>
      ) : null}
      <BrandFooter accent={accent} />
    </CardShell>
  );
}

// ── Template 20 — Contagem regressiva (countdown) ────────────────────────────
function ContagemCard({ v, accent }: { v: Vals; accent: string }) {
  const theme = React.useContext(CardThemeContext);
  return (
    <CardShell accent={accent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow accent={accent}>{v.eyebrow}</Eyebrow>
        {v.dateBadge ? <SpecChip accent={accent}>{v.dateBadge}</SpecChip> : null}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        {v.pre ? (
          <div style={{ fontFamily: FONT_MONO, fontSize: 30, letterSpacing: "0.18em", textTransform: "uppercase", color: `rgba(${theme.fgRgb}, 0.6)` }}>
            {v.pre}
          </div>
        ) : null}
        {/* key — see FraseCard */}
        <div
          key={accent + theme.id}
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 320,
            lineHeight: 0.85,
            letterSpacing: "-0.05em",
            background: `linear-gradient(135deg, ${theme.fgStrong} 35%, ${accent})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          {v.days}
        </div>
        <div style={{ marginTop: 12, fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 48, color: theme.fgStrong }}>
          {v.unit}
        </div>
        {v.sub ? (
          <p style={{ marginTop: 26, fontSize: 34, lineHeight: 1.4, color: `rgba(${theme.fgRgb}, 0.72)`, maxWidth: "22ch" }}>
            {v.sub}
          </p>
        ) : null}
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
  type?: "text" | "textarea" | "image" | "select" | "page";
  options?: { value: string; labelKey: string }[];
  showIf?: (v: Vals) => boolean;
};
type TemplateId =
  | "questao"
  | "dica"
  | "promo"
  | "frase"
  | "cronograma"
  | "imagem"
  | "mockup"
  | "nuvem"
  | "comparacao"
  | "mitoverdade"
  | "checklist"
  | "mnemonico"
  | "destaque"
  | "split"
  | "clinica"
  | "depoimento"
  | "numero"
  | "recursos"
  | "carrossel"
  | "contagem";

// Reused image-fit select options (destaque / split / clinica share these).
const FIT_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "cover-center", labelKey: "fitCoverCenter" },
  { value: "cover-top", labelKey: "fitCoverTop" },
  { value: "cover-bottom", labelKey: "fitCoverBottom" },
  { value: "contain", labelKey: "fitContain" },
];

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
      { key: "pagePath", labelKey: "pagePath", type: "page", showIf: (v) => v.mode === "page" },
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
  {
    id: "nuvem",
    Render: NuvemCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "spec", labelKey: "spec" },
      { key: "title", labelKey: "title", type: "textarea" },
      { key: "topics", labelKey: "topics", type: "textarea" },
      { key: "footnote", labelKey: "footnote", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Cai muito na prova",
      spec: "Clínica Médica",
      title: "Os temas mais cobrados na 2ª fase",
      topics:
        "*IAM com supra\n*Sepse\nInsuficiência cardíaca\n*Pré-eclâmpsia\nAVC isquêmico\nCetoacidose diabética\nPneumonia\n*Choque\nTEP\nAsma\nDPOC\nAbdome agudo",
      footnote: "Em destaque: os temas que mais aparecem.",
    },
  },
  {
    id: "comparacao",
    Render: ComparacaoCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "title", labelKey: "title", type: "textarea" },
      { key: "leftTitle", labelKey: "leftTitle" },
      { key: "leftItems", labelKey: "leftItems", type: "textarea" },
      { key: "rightTitle", labelKey: "rightTitle" },
      { key: "rightItems", labelKey: "rightItems", type: "textarea" },
      { key: "footnote", labelKey: "footnote", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Compare e nunca mais erre",
      title: "Exsudato × Transudato",
      leftTitle: "Exsudato",
      leftItems:
        "Proteína LP/soro > 0,5\nLDH LP/soro > 0,6\nLDH > 2/3 do limite\nCausas: infecção, neoplasia",
      rightTitle: "Transudato",
      rightItems:
        "Proteína LP/soro < 0,5\nLDH LP/soro < 0,6\nLDH normal\nCausas: ICC, cirrose, s. nefrótica",
      footnote: "Critérios de Light: 1 positivo já classifica como exsudato.",
    },
  },
  {
    id: "mitoverdade",
    Render: MitoVerdadeCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "title", labelKey: "title", type: "textarea" },
      { key: "myth", labelKey: "myth", type: "textarea" },
      { key: "truth", labelKey: "truth", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Mito ou verdade?",
      title: "Antibiótico corta o efeito do anticoncepcional?",
      myth: "Todo antibiótico reduz a eficácia do anticoncepcional oral.",
      truth:
        "Só a rifampicina (e a rifabutina) têm efeito comprovado. Os demais antibióticos não reduzem a eficácia de forma clinicamente relevante.",
    },
  },
  {
    id: "checklist",
    Render: ChecklistCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "spec", labelKey: "spec" },
      { key: "title", labelKey: "title", type: "textarea" },
      { key: "items", labelKey: "items", type: "textarea" },
      { key: "footnote", labelKey: "footnote", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Reta final",
      spec: "Revalida",
      title: "5 coisas pra revisar na véspera",
      items:
        "Protocolos de PCR e via aérea\nDoses das drogas da emergência\nCritérios diagnósticos mais cobrados\nConduta na sepse e no choque\nIdade gestacional e cálculo da DPP",
      footnote: "Salva esse post pra revisar depois 👆",
    },
  },
  {
    id: "mnemonico",
    Render: MnemonicoCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "title", labelKey: "title" },
      { key: "sub", labelKey: "sub" },
      { key: "items", labelKey: "mnemonicItems", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Macete que salva",
      title: "MONABICH",
      sub: "Conduta na síndrome coronariana aguda",
      items:
        "M=Morfina=analgesia se dor refratária\nO=Oxigênio=se SatO₂ < 90%\nN=Nitrato=alívio da dor anginosa\nA=AAS=antiagregação imediata\nB=Betabloqueador=reduz consumo de O₂\nI=IECA=nas primeiras 24h\nC=Clopidogrel=dupla antiagregação\nH=Heparina=anticoagulação",
    },
  },
  {
    id: "destaque",
    Render: DestaqueCard,
    fields: [
      { key: "image", labelKey: "image", type: "image" },
      { key: "fit", labelKey: "fit", type: "select", options: FIT_OPTIONS },
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "headline", labelKey: "title", type: "textarea" },
      { key: "caption", labelKey: "caption", type: "textarea" },
    ],
    defaults: {
      image: "/images/students.webp",
      fit: "cover-center",
      eyebrow: "Turma Revalida 2026.2",
      headline: "Sua aprovação começa com o próximo estudo.",
      caption: "medhelpspace.com.br",
    },
  },
  {
    id: "split",
    Render: SplitCard,
    fields: [
      { key: "image", labelKey: "image", type: "image" },
      { key: "fit", labelKey: "fit", type: "select", options: FIT_OPTIONS },
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "headline", labelKey: "title", type: "textarea" },
      { key: "body", labelKey: "body", type: "textarea" },
      { key: "pills", labelKey: "pills", type: "textarea" },
    ],
    defaults: {
      image: "/landing/shot-medvoice.webp",
      fit: "cover-center",
      eyebrow: "Conheça o MedVoice",
      headline: "Estude ouvindo, onde você estiver.",
      body: "Aulas em áudio por especialidade, no ritmo da sua rotina.",
      pills: "Por especialidade\nOffline no fone\nRevisão rápida",
    },
  },
  {
    id: "clinica",
    Render: ClinicaCard,
    fields: [
      { key: "image", labelKey: "image", type: "image" },
      { key: "fit", labelKey: "fit", type: "select", options: FIT_OPTIONS },
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "headline", labelKey: "title", type: "textarea" },
      { key: "callout", labelKey: "callout" },
      { key: "caption", labelKey: "caption", type: "textarea" },
    ],
    defaults: {
      image: "/landing/shot-questoes-ecg.webp",
      fit: "cover-center",
      eyebrow: "Desafio diagnóstico",
      headline: "Você reconhece esse ritmo?",
      callout: "ECG · 12 derivações",
      caption: "Comente sua hipótese 👇",
    },
  },
  {
    id: "depoimento",
    Render: DepoimentoCard,
    fields: [
      { key: "image", labelKey: "image", type: "image" },
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "quote", labelKey: "quote", type: "textarea" },
      { key: "name", labelKey: "name" },
      { key: "role", labelKey: "role" },
    ],
    defaults: {
      image: "/images/students.webp",
      eyebrow: "Quem estuda com a gente",
      quote: "O plano me deu direção. Parei de estudar no escuro e passei na primeira.",
      name: "Ana Beatriz",
      role: "Aprovada · Revalida 2025.1",
    },
  },
  {
    id: "numero",
    Render: NumeroCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "bignum", labelKey: "bignum" },
      { key: "label", labelKey: "label", type: "textarea" },
      { key: "pills", labelKey: "pills", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Dentro da plataforma",
      bignum: "+3.000",
      label: "questões comentadas, atualizadas pelo padrão do INEP",
      pills: "877 gratuitas\n130 simulados\nGabarito comentado",
    },
  },
  {
    id: "recursos",
    Render: RecursosCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "title", labelKey: "title", type: "textarea" },
      { key: "items", labelKey: "gridItems", type: "textarea" },
      { key: "footnote", labelKey: "footnote", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Tudo num lugar só",
      title: "O que você tem no MedHelpSpace",
      items:
        "Questões comentadas|Banco atualizado pelo padrão INEP\nMedVoice|Aulas em áudio por especialidade\nFlashcards|Revisão ativa com repetição espaçada\nMemoreCards|Revisão visual pra reta final",
      footnote: "medhelpspace.com.br",
    },
  },
  {
    id: "carrossel",
    Render: CarrosselCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "index", labelKey: "indexNum" },
      { key: "title", labelKey: "title", type: "textarea" },
      { key: "sub", labelKey: "sub", type: "textarea" },
      { key: "swipe", labelKey: "swipe" },
    ],
    defaults: {
      eyebrow: "Carrossel · salva pra depois",
      index: "01",
      title: "7 erros que reprovam no Revalida",
      sub: "E como evitar cada um deles.",
      swipe: "Arrasta pra ver →",
    },
  },
  {
    id: "contagem",
    Render: ContagemCard,
    fields: [
      { key: "eyebrow", labelKey: "eyebrow" },
      { key: "dateBadge", labelKey: "dateBadge" },
      { key: "pre", labelKey: "pre" },
      { key: "days", labelKey: "days" },
      { key: "unit", labelKey: "unit" },
      { key: "sub", labelKey: "sub", type: "textarea" },
    ],
    defaults: {
      eyebrow: "Revalida 2026.2",
      dateBadge: "Prova · 20/10/2026",
      pre: "Faltam",
      days: "47",
      unit: "dias para a prova",
      sub: "Cada dia de revisão ativa conta. Bora?",
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
  const [bg, setBg] = useState<BgId>("ink");
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
  // On a light surface, switch to the site's light-mode accent (deeper, readable
  // on white). `accent` state always stays the dark hex the swatches use.
  const isLightBg = bg !== "ink";
  const renderAccent = isLightBg ? LIGHT_ACCENT[accent] ?? accent : accent;
  const cardTheme = buildTheme(bg, renderAccent);

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
            <CardThemeContext.Provider value={cardTheme}>
              <FrozenPageContext.Provider value={frozen}>
                <Card v={values} accent={renderAccent} />
              </FrozenPageContext.Provider>
            </CardThemeContext.Provider>
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

            {/* Background picker */}
            <div>
              <Label>{t("studio.background")}</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {BACKGROUNDS.map((id) => (
                  <button
                    key={id}
                    onClick={() => setBg(id)}
                    title={t(`studio.bg.${id}`)}
                    style={{
                      width: 44,
                      height: 30,
                      borderRadius: 8,
                      cursor: "pointer",
                      background: bgSwatch(id, renderAccent),
                      border: bg === id ? "2px solid #c084e8" : "2px solid rgba(255,255,255,0.14)",
                      boxShadow: bg === id ? "0 0 0 3px rgba(192,132,232,0.35)" : "none",
                    }}
                  />
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: "#8a8a95", margin: "8px 0 0" }}>
                {t(`studio.bg.${bg}`)}
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
                    {f.type === "page" ? (
                      <PageField value={values[f.key] ?? ""} onChange={(val) => update(f.key, val)} />
                    ) : f.type === "image" ? (
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
                  <CardThemeContext.Provider value={cardTheme}>
                    <FrozenPageContext.Provider value={frozen}>
                      <Card v={values} accent={renderAccent} />
                    </FrozenPageContext.Provider>
                  </CardThemeContext.Provider>
                </CardHeightContext.Provider>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const groups: { label: string; items: { value: string; label: string }[] }[] = [
    {
      label: t("studio.pages.group_marketing"),
      items: [
        { value: "/", label: t("studio.pages.home") },
        { value: "/loja", label: t("studio.pages.store") },
        { value: "/questoes-revalida", label: t("studio.pages.freeQuiz") },
        { value: "/flashcards-gratis", label: t("studio.pages.freeFlashcards") },
      ],
    },
    {
      label: t("studio.pages.group_app"),
      items: [
        { value: "/app", label: t("studio.pages.dashboard") },
        { value: "/app/plano", label: t("studio.pages.studyPlan") },
        { value: "/app/plano/roteiro", label: t("studio.pages.roadmap") },
        { value: "/app/revisao", label: t("studio.pages.review") },
        { value: "/app/relatorio", label: t("studio.pages.report") },
        { value: "/app/revalida-up", label: t("studio.pages.revalidaUp") },
        { value: "/app/medhelp-60d", label: t("studio.pages.medhelp60d") },
      ],
    },
    {
      label: t("studio.pages.group_specialty"),
      items: STUDIO_SPECIALTIES.map((s) => ({ value: `/app/${s.slug}`, label: s.name })),
    },
  ];
  const known = groups.some((g) => g.items.some((it) => it.value === value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <select
        value={known ? value : ""}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        style={{ ...inputStyle, cursor: "pointer" }}
      >
        <option value="" style={{ background: "#0a0a12", color: "#fff" }}>
          {t("studio.pages.pick")}…
        </option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((it) => (
              <option key={it.value} value={it.value} style={{ background: "#0a0a12", color: "#fff" }}>
                {it.label} · {it.value}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("studio.pages.custom")}
        style={inputStyle}
      />
      <p style={{ fontSize: 11, color: "#7f7f8c", margin: 0, lineHeight: 1.4 }}>
        {t("studio.pages.loginHint")}
      </p>
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
