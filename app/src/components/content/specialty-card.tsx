"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Heart, Fingerprint, Zap, FlaskConical, Activity,
  Droplets, Bug, Droplet, Brain, Wind, MessageCircle,
  Bone, Baby, Scissors, Stethoscope, Users,
} from "lucide-react";

// ── Icon map (lives client-side so we can pass slug as a serialisable prop) ──

const SPECIALTY_ICONS: Record<string, LucideIcon> = {
  cardiologia:              Heart,
  dermatologia:             Fingerprint,
  "medicina-de-emergencia": Zap,
  emergencia:               Zap,
  endocrinologia:           FlaskConical,
  gastroenterologia:        Activity,
  hematologia:              Droplets,
  infectologia:             Bug,
  nefrologia:               Droplet,
  neurologia:               Brain,
  pneumologia:              Wind,
  psiquiatria:              MessageCircle,
  reumatologia:             Bone,
  pediatria:                Baby,
  "cirurgia-geral":         Scissors,
  "clinica-medica":         Stethoscope,
  "saude-coletiva":         Users,
};

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ value, hovered, size = 36 }: { value: number; hovered: boolean; size?: number }) {
  const swTrack = 2;
  const swFill  = 4.5;
  const r = (size - swFill) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, value / 100));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        style={{ stroke: "var(--muted-3, #4a4a4a)", strokeWidth: swTrack }} />
      {value > 0 && (
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          style={{
            stroke: hovered ? "var(--brand)" : "var(--foreground)",
            strokeWidth: swFill,
            strokeDasharray: `${dash} ${c}`,
            strokeLinecap: "butt",
            strokeOpacity: hovered ? 1 : 0.35,
            transition: "stroke 0.3s ease-out, stroke-opacity 0.3s ease-out",
          } as React.CSSProperties} />
      )}
    </svg>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function SpecialtyCard({
  label,
  href,
  slug,
  progress,
}: {
  label: string;
  href: string;
  slug: string;
  progress: number;
}) {
  const [count, setCount] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const rafRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const duration = 350;
    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setCount(Math.round(t * progress));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setCount(0);
  };

  const Icon = SPECIALTY_ICONS[slug] ?? Stethoscope;

  return (
    <Link
      href={href}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "18px 18px 18px 20px",
        background: "var(--surface-1)",
        borderRadius: "var(--radius)",
        textDecoration: "none",
        minHeight: 72,
      }}
      className="group transition-[background,transform] duration-300 ease-out hover:bg-surface-2 hover:scale-[1.02]"
    >
      {/* 8px brand accent stripe */}
      <div style={{
        position: "absolute",
        left: 0, top: 0, bottom: 0,
        width: 8,
        background: "var(--brand)",
        borderRadius: "var(--radius) 0 0 var(--radius)",
      }} />

      {/* Subject icon */}
      <Icon size={18} strokeWidth={1.5}
        style={{ color: "var(--foreground)", opacity: 0.22, flexShrink: 0 }} />

      {/* Label */}
      <span
        style={{
          flex: 1,
          fontSize: 15.5,
          fontWeight: 500,
          letterSpacing: "-.015em",
          color: "var(--foreground)",
          lineHeight: 1.2,
        }}
        className="group-hover:text-brand transition-colors duration-100"
      >
        {label}
      </span>

      {/* Ring + animated count — scale together */}
      <div
        style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}
        className="transition-transform duration-300 ease-out group-hover:scale-[1.6]"
      >
        <ProgressRing value={progress} hovered={isHovered} />
        <div
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75"
        >
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            fontFamily: "var(--font-geist-mono)",
            color: "var(--foreground)",
            lineHeight: 1,
          }}>
            {count}%
          </span>
        </div>
      </div>
    </Link>
  );
}
