import Link from "next/link";
import { ChevronRight, Network, RefreshCw, Route, Timer } from "lucide-react";
import {
  FORMAT_BLURBS,
  FORMAT_COLOR_VARS,
  FORMAT_LABELS,
  FORMAT_SKILL,
  SKILL_LABELS,
  type CaseFormat,
} from "@/lib/clinact/types";

/** "3 casos" / "1 caso" — never "1 casos". */
export function caseCount(n: number): string {
  return `${n} ${n === 1 ? "caso" : "casos"}`;
}

const FORMAT_ICONS: Record<CaseFormat, typeof Network> = {
  codigo_clinico: Network,
  clinica_em_cena: Route,
  decisao_30s: Timer,
  ponto_de_virada: RefreshCw,
};

/**
 * The small uppercase section label Revalida uses above every grid. Karina
 * asked for the ClinAct library to read as the same platform (2026-09-02), so
 * the label, the grids and the cards follow those shapes.
 */
export const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted-2, #727272)",
  fontWeight: 600,
};

/**
 * A format card — the "como quero treinar?" door, built like Revalida's
 * content-type cards: coloured tile, icon, name, one line, "Acessar ›". The
 * verb leads, because the format IS the skill.
 */
export function FormatCard({
  format,
  href,
  count,
  index = 0,
}: {
  format: CaseFormat;
  href: string;
  count: number;
  /** Staggers the entrance the way the Revalida grids do. */
  index?: number;
}) {
  const empty = count === 0;
  const color = FORMAT_COLOR_VARS[format];
  const Icon = FORMAT_ICONS[format];

  // A format with no cases here stays visible but inactive. It keeps its OWN
  // colour — Karina, 2026-09-02: an "Em breve" card must remain recognisable as
  // that format and must never take a different colour — so instead of fading
  // the filled tile (which drags the white text down with it and left the card
  // hard to read), the inactive state is a GHOST of the same colour: a light
  // tint of it, its own hue on the icon and the verb, and text in the normal
  // reading colours.
  const ink = empty
    ? { verb: color, title: "var(--foreground)", body: "var(--muted-foreground)", cta: "var(--muted-foreground)", icon: color }
    : {
        verb: "rgba(255,255,255,0.88)",
        title: "#fff",
        body: "rgba(255,255,255,0.82)",
        cta: "rgba(255,255,255,0.92)",
        icon: "rgba(255,255,255,0.92)",
      };

  const body = (
    <>
      <Icon size={22} strokeWidth={1.6} style={{ color: ink.icon, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: ink.verb }}>
          {SKILL_LABELS[FORMAT_SKILL[format]]}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.02em", color: ink.title, lineHeight: 1.2, marginTop: 2 }}>
          {FORMAT_LABELS[format]}
        </div>
        <div style={{ fontSize: 12, marginTop: 5, lineHeight: 1.4, color: ink.body }}>{FORMAT_BLURBS[format]}</div>
        <div
          style={{
            marginTop: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 12,
            fontWeight: 600,
            color: ink.cta,
          }}
        >
          {empty ? "Em breve" : caseCount(count)}
          {empty ? null : <ChevronRight size={11} strokeWidth={2.5} />}
        </div>
      </div>
    </>
  );

  const style: React.CSSProperties = {
    borderRadius: "var(--radius)",
    padding: "22px 20px",
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    textDecoration: "none",
    minHeight: 100,
    background: empty
      ? `color-mix(in srgb, ${color} 10%, var(--surface-1))`
      : `linear-gradient(140deg, color-mix(in srgb, ${color} 92%, #1a0030) 0%, ${color} 100%)`,
    outline: empty ? `1px solid color-mix(in srgb, ${color} 30%, var(--surface-2))` : undefined,
    outlineOffset: empty ? "-1px" : undefined,
    animation: "dash-fade-up 0.45s cubic-bezier(.16,1,.3,1) both",
    animationDelay: `${index * 55}ms`,
    position: "relative",
    overflow: "hidden",
  };

  // The four formats are the structure, so an empty one is shown rather than
  // hidden — but it is not a link.
  if (empty) {
    return (
      <div style={style} aria-disabled>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} style={style} className="transition-opacity hover:opacity-90">
      {body}
    </Link>
  );
}

/**
 * A specialty card — the "o que quero treinar?" door, matching Revalida's
 * "Estude por especialidade" grid: surface tile, name, and a brand-coloured
 * call to action.
 */
export function SpecialtyCard({
  name,
  href,
  count,
  index = 0,
}: {
  name: string;
  href: string;
  count: number;
  index?: number;
}) {
  return (
    <Link
      href={href}
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius)",
        padding: "18px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 10,
        minHeight: 88,
        textDecoration: "none",
        outline: "1px solid var(--surface-2)",
        outlineOffset: "-1px",
        animation: "dash-fade-up 0.45s cubic-bezier(.16,1,.3,1) both",
        animationDelay: `${index * 35}ms`,
      }}
      className="hover:bg-surface-2"
    >
      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.01em", color: "var(--foreground)", lineHeight: 1.25 }}>
        {name}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 500, color: "var(--brand)" }}>
        {caseCount(count)} <ChevronRight size={10} strokeWidth={2.5} />
      </div>
    </Link>
  );
}

/** Where the reader is, and the way back — both doors produce a path. */
export function Trail({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Você está em" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden /> : null}
          {item.href ? (
            <Link href={item.href} className="inline-flex min-h-11 items-center hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
