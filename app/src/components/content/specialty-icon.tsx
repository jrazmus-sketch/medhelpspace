import {
  Heart, Brain, Wind, Bone, Zap, Droplets, Droplet,
  FlaskConical, Shield, Sparkles, Baby, Globe,
  Stethoscope, Scissors, Lightbulb, Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface IconConfig {
  Icon: LucideIcon;
  stops: [string, string];
}

const SPECIALTY_ICONS: Record<string, IconConfig> = {
  cardiologia:              { Icon: Heart,        stops: ["#f43f5e", "#fb923c"] },
  pneumologia:              { Icon: Wind,         stops: ["#38bdf8", "#34d399"] },
  neurologia:               { Icon: Brain,        stops: ["#a78bfa", "#818cf8"] },
  reumatologia:             { Icon: Bone,         stops: ["#f59e0b", "#fb923c"] },
  gastroenterologia:        { Icon: Activity,     stops: ["#f97316", "#fbbf24"] },
  nefrologia:               { Icon: Droplets,     stops: ["#3b82f6", "#06b6d4"] },
  endocrinologia:           { Icon: FlaskConical, stops: ["#10b981", "#34d399"] },
  infectologia:             { Icon: Shield,       stops: ["#22c55e", "#86efac"] },
  dermatologia:             { Icon: Sparkles,     stops: ["#f472b6", "#fb7185"] },
  hematologia:              { Icon: Droplet,      stops: ["#dc2626", "#f472b6"] },
  ginecologia:              { Icon: Baby,         stops: ["#f472b6", "#fda4af"] },
  obstetricia:              { Icon: Baby,         stops: ["#fb923c", "#fde68a"] },
  pediatria:                { Icon: Baby,         stops: ["#fbbf24", "#fb923c"] },
  psiquiatria:              { Icon: Lightbulb,    stops: ["#8b5cf6", "#a78bfa"] },
  "clinica-medica":         { Icon: Stethoscope,  stops: ["#64748b", "#3b82f6"] },
  "cirurgia-geral":         { Icon: Scissors,     stops: ["#2563eb", "#38bdf8"] },
  "saude-coletiva":         { Icon: Globe,        stops: ["#059669", "#34d399"] },
  "medicina-de-emergencia": { Icon: Zap,          stops: ["#ef4444", "#f97316"] },
  emergencia:               { Icon: Zap,          stops: ["#ef4444", "#f97316"] },
};

const DEFAULT_CONFIG: IconConfig = {
  Icon: Stethoscope,
  stops: ["#7a1d91", "#c084e8"],
};

export function SpecialtyIcon({
  specialtySlug,
  size = 36,
}: {
  specialtySlug: string;
  size?: number;
}) {
  const { Icon, stops } = SPECIALTY_ICONS[specialtySlug] ?? DEFAULT_CONFIG;
  // SVG gradient IDs are document-global in HTML; slug makes this unique per specialty.
  const gradId = `spec-grad-${specialtySlug}`;

  return (
    <>
      {/*
        Hidden SVG that defines the gradient. In HTML documents, SVG paint server IDs
        (linearGradient etc.) are resolved document-wide, so the Lucide icon below can
        reference url(#gradId) even though it renders in its own <svg> element.
      */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stops[0]} />
            <stop offset="100%" stopColor={stops[1]} />
          </linearGradient>
        </defs>
      </svg>

      <Icon
        size={size}
        stroke={`url(#${gradId})`}
        strokeWidth={1.75}
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      />
    </>
  );
}
