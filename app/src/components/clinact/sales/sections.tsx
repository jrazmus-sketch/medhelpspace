import Link from "next/link";
import { CalendarClock, Lightbulb, Sparkles, Stethoscope } from "lucide-react";
import { ClinactText } from "@/components/clinact/clinact-text";
import { SiteImage } from "@/components/clinact/sales/site-image";
import { FORMAT_ICONS } from "@/components/clinact/library-cards";
import { FORMATS, FORMAT_COLOR_VARS, FORMAT_LABELS, FORMAT_SKILL, SKILL_LABELS, type CaseFormat } from "@/lib/clinact/types";
import { CLINACT_PLAN_LIST, annualPerMonth, formatBRL, type ClinactPlanKey } from "@/lib/clinact/plans";
import type { ClinactCopyKey } from "@/lib/clinact/site-copy";

/**
 * The ClinAct sales page, section by section.
 *
 * Six sections, one idea each (Karina, 2026-10-08 — supersedes the 14-section
 * brief of CLINACT-SALES-PAGE-SPEC.md §1): início → os quatro formatos → veja
 * na prática → entenda suas decisões → quatro casos gratuitos → planos. The
 * presentation follows the MedHelpSpace Revalida sales page: black background,
 * Bricolage headings, mono eyebrows, colour only in accents, text and phone
 * side by side on desktop (alternating sides), one column on the phone.
 *
 * Every string is a <ClinactText>, editable from the page with "Edição rápida";
 * the copy itself lives in lib/clinact/site-copy.ts.
 *
 * The two things that are NOT editable strings, on purpose:
 *   · prices — they come from lib/clinact/plans.ts (her decision 2), and the
 *     annual plan's monthly equivalent is computed from them;
 *   · the case count — computed, never typed (her decision 5), and not shown.
 *
 * Sections are declared here and merely ORDERED/HIDDEN by `site_sections`, so
 * adding one is a code change and never a database migration. The keys of the
 * sections that carry over keep their old names (competencias, casos,
 * evolucao) so the admin ordering and the two screenshot slots keep working.
 */

type SectionProps = { hasAccess: boolean; isLoggedIn: boolean };
type SectionDef = { key: string; Section: (p: SectionProps) => React.ReactElement };

const DISPLAY = { fontFamily: "var(--font-bricolage)" } as const;
const MONO = { fontFamily: "var(--font-geist-mono)" } as const;
const H2 = "text-[clamp(1.85rem,4.2vw,3rem)] font-black leading-[1.08] tracking-[-0.025em] text-foreground";
const LEAD = "text-lg leading-relaxed text-foreground/85";
const BAND = "border-t px-5 py-16 md:px-8 md:py-24";
const BAND_STYLE_BASE = { background: "var(--lp-base)", borderColor: "var(--lp-border)" } as const;
const BAND_STYLE_ALT = { background: "var(--lp-alt)", borderColor: "var(--lp-border)" } as const;
const BTN_PRIMARY_BASE =
  // py-3 + leading-snug: an edited label that wraps gets two clean lines, not a cramped 48px.
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-6 py-3 text-center text-base font-bold leading-snug text-brand-fg transition hover:-translate-y-px hover:opacity-90 sm:px-8";
const BTN_PRIMARY = `${BTN_PRIMARY_BASE} sm:w-auto`;
const BTN_SECONDARY =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-foreground/25 px-6 py-3 text-center text-base font-semibold leading-snug text-foreground transition hover:-translate-y-px hover:bg-foreground/5 sm:w-auto sm:px-8";

/** The in-page anchors the two hero buttons land on (her brief: #casos-gratuitos). */
export const ANCHOR_GRATUITOS = "casos-gratuitos";
export const ANCHOR_PLANOS = "planos";

/**
 * Where the free cases start. Signup-first (her decision 1): no anonymous play.
 * Someone already signed in goes straight to the library, where the four free
 * cases are open — sending them to /signup would only bounce them.
 */
function tryHref(isLoggedIn: boolean): string {
  return isLoggedIn ? "/clinact/treinar" : "/signup?next=%2Fclinact%2Ftreinar";
}

/**
 * A plan button goes to the checkout with the plan preselected. Someone without
 * an account signs up first (signup-first, as above) and the confirmation
 * e-mail brings them back to the checkout; someone signed out WITH an account
 * uses "Já tem conta? Entrar" on that page, which keeps the same destination.
 */
function planHref(planKey: string, isLoggedIn: boolean): string {
  const checkout = `/clinact/assinar?plano=${planKey}`;
  return isLoggedIn ? checkout : `/signup?next=${encodeURIComponent(checkout)}`;
}

// ── 1. Início ──────────────────────────────────────────────────────────────

function Hero({ hasAccess }: SectionProps) {
  return (
    <section className="relative isolate overflow-hidden px-5 pb-20 pt-16 text-center sm:pt-24 md:px-8 md:pb-28">
      {/* Light from above, as on the Revalida hero — decorative, behind the copy. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            "radial-gradient(ellipse 90% 60% at 50% 0%, color-mix(in srgb, var(--brand) 38%, transparent), transparent 70%)",
            "radial-gradient(ellipse 60% 45% at 50% 100%, color-mix(in srgb, var(--brand) 14%, transparent), transparent 70%)",
          ].join(", "),
        }}
      />
      <div className="mx-auto max-w-4xl">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground" style={MONO}>
          <ClinactText k="clinact.hero.label" />
        </p>
        <h1 className="mx-auto mt-6 text-balance text-[clamp(2.6rem,8vw,5.25rem)] font-black leading-[1.02] tracking-[-0.035em] text-foreground" style={DISPLAY}>
          <ClinactText k="clinact.hero.title" />
          <span className="text-brand-text">
            <ClinactText k="clinact.hero.title_accent" autoSpace />
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-foreground/90 sm:text-xl">
          <ClinactText k="clinact.hero.sub" />
        </p>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
          <ClinactText k="clinact.hero.publico" />
        </p>
        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-brand-text/35 bg-brand/20 px-4 py-1.5 text-sm font-semibold text-brand-text">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
          <ClinactText k="clinact.hero.semanal" />
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {hasAccess ? (
            <Link href="/clinact/treinar" className={BTN_PRIMARY} style={{ boxShadow: "0 0 40px color-mix(in srgb, var(--brand) 55%, transparent)" }}>
              <ClinactText k="clinact.hero.cta_assinante" />
            </Link>
          ) : (
            <a href={`#${ANCHOR_GRATUITOS}`} className={BTN_PRIMARY} style={{ boxShadow: "0 0 40px color-mix(in srgb, var(--brand) 55%, transparent)" }}>
              <ClinactText k="clinact.hero.cta" />
            </a>
          )}
          <a href={`#${ANCHOR_PLANOS}`} className={BTN_SECONDARY}>
            <ClinactText k="clinact.hero.cta2" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ── 2. Os quatro formatos ─────────────────────────────────────────────────

const FORMAT_COPY: Record<CaseFormat, ClinactCopyKey> = {
  codigo_clinico: "clinact.competencias.codigo_clinico",
  clinica_em_cena: "clinact.competencias.clinica_em_cena",
  decisao_30s: "clinact.competencias.decisao_30s",
  ponto_de_virada: "clinact.competencias.ponto_de_virada",
};

function Competencias() {
  return (
    <section className={BAND} style={BAND_STYLE_ALT}>
      <div className="mx-auto max-w-4xl">
        <h2 className={`${H2} text-center`} style={DISPLAY}>
          <ClinactText k="clinact.competencias.title" />
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {FORMATS.map((format) => {
            const color = FORMAT_COLOR_VARS[format];
            const Icon = FORMAT_ICONS[format];
            return (
              <div
                key={format}
                className="relative isolate flex h-full overflow-hidden rounded-2xl border p-6 sm:p-7"
                style={{
                  borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                  background: `linear-gradient(155deg, color-mix(in srgb, ${color} 20%, var(--lp-alt-2)) 0%, color-mix(in srgb, ${color} 6%, var(--lp-base)) 100%)`,
                }}
              >
                {/* The format's mark, large and faint in the corner — texture, not content. */}
                <Icon
                  aria-hidden
                  strokeWidth={1}
                  className="pointer-events-none absolute -bottom-7 -right-5 -z-10 h-36 w-36"
                  style={{ color, opacity: 0.08 }}
                />
                <div className="flex items-start gap-4 sm:gap-5">
                  {/* Same icon the student meets on the format card inside the platform. */}
                  <span
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
                    style={{
                      color,
                      background: `color-mix(in srgb, ${color} 16%, transparent)`,
                      borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
                      boxShadow: `0 0 28px color-mix(in srgb, ${color} 28%, transparent)`,
                    }}
                  >
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold uppercase tracking-[0.16em]" style={{ ...MONO, color }}>
                      {SKILL_LABELS[FORMAT_SKILL[format]]}
                    </p>
                    <p className="mt-1.5 text-2xl font-black leading-tight tracking-[-0.02em] text-foreground" style={DISPLAY}>
                      {FORMAT_LABELS[format]}
                    </p>
                    <p className="mt-3 text-base leading-relaxed text-foreground/85">
                      <ClinactText k={FORMAT_COPY[format]} />
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── 3 & 4. Text and phone side by side ─────────────────────────────────────

/**
 * One demo row: copy and phone in two columns on desktop, the phone on the
 * RIGHT unless `phoneLeft`; one column on the phone, copy first, so the
 * caption stays under its picture.
 */
function DemoRow({ copy, phone, phoneLeft, glow }: { copy: React.ReactNode; phone: React.ReactNode; phoneLeft?: boolean; glow: string }) {
  return (
    <div className="relative isolate">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: `radial-gradient(48% 70% at ${phoneLeft ? "24%" : "76%"} 50%, color-mix(in srgb, ${glow} 12%, transparent), transparent 72%)` }}
      />
      <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2 md:gap-16">
        <div>{copy}</div>
        <div className={`flex justify-center ${phoneLeft ? "md:order-first" : ""}`}>{phone}</div>
      </div>
    </div>
  );
}

function Casos() {
  const glow = FORMAT_COLOR_VARS.clinica_em_cena;
  return (
    <section className={BAND} style={BAND_STYLE_BASE}>
      <DemoRow
        glow={glow}
        copy={
          <>
            <h2 className={H2} style={DISPLAY}>
              <ClinactText k="clinact.casos.title" />
            </h2>
            <p className={`${LEAD} mt-5`}>
              <ClinactText k="clinact.casos.lead" />
            </p>
            <ul className="mt-8 space-y-4">
              <li className="flex gap-3 text-base leading-relaxed text-foreground/85">
                <Stethoscope className="mt-1 h-5 w-5 shrink-0 text-brand-text" aria-hidden />
                <ClinactText k="clinact.casos.midia" />
              </li>
              <li className="flex gap-3 text-base leading-relaxed text-foreground/85">
                <Lightbulb className="mt-1 h-5 w-5 shrink-0 text-brand-text" aria-hidden />
                <ClinactText k="clinact.casos.fecho" />
              </li>
            </ul>
          </>
        }
        phone={
          <SiteImage
            k="clinact.casos.image"
            alt="Um caso de Clínica em Cena em andamento, com o Prontuário Vivo"
            glow={glow}
            caption={<ClinactText k="clinact.casos.legenda" />}
          />
        }
      />
    </section>
  );
}

function Evolucao() {
  return (
    <section className={BAND} style={BAND_STYLE_ALT}>
      <DemoRow
        phoneLeft
        glow="var(--brand)"
        copy={
          <>
            <h2 className={H2} style={DISPLAY}>
              <ClinactText k="clinact.evolucao.title" />
            </h2>
            <p className={`${LEAD} mt-5`}>
              <ClinactText k="clinact.evolucao.lead" />
            </p>
          </>
        }
        phone={<SiteImage k="clinact.evolucao.image" alt="A tela Minha Evolução do ClinAct" />}
      />
    </section>
  );
}

// ── 5. Quatro casos gratuitos ──────────────────────────────────────────────

function Gratuitos({ hasAccess, isLoggedIn }: SectionProps) {
  return (
    // scroll-mt keeps the title in view when the hero button jumps here.
    <section id={ANCHOR_GRATUITOS} className={`${BAND} scroll-mt-2`} style={BAND_STYLE_BASE}>
      <div
        className="relative isolate mx-auto max-w-3xl overflow-hidden rounded-3xl border px-5 py-10 text-center sm:px-12 sm:py-14"
        style={{
          borderColor: "color-mix(in srgb, var(--brand-text) 32%, transparent)",
          background: "linear-gradient(160deg, color-mix(in srgb, var(--brand) 42%, var(--lp-base)) 0%, color-mix(in srgb, var(--brand) 20%, var(--lp-base)) 100%)",
          boxShadow: "0 40px 120px -40px color-mix(in srgb, var(--brand) 70%, transparent)",
        }}
      >
        <p className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-brand-text" style={MONO}>
          <Sparkles className="h-4 w-4" aria-hidden />
          <ClinactText k="clinact.gratuitos.label" />
        </p>
        <h2 className={`${H2} mt-4`} style={DISPLAY}>
          <ClinactText k="clinact.gratuitos.title" />
        </h2>
        <p className={`${LEAD} mx-auto mt-5 max-w-xl`}>
          <ClinactText k="clinact.gratuitos.lead" />
        </p>
        <Link
          href={hasAccess ? "/clinact/treinar" : tryHref(isLoggedIn)}
          className="mt-9 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-text px-4 py-3 text-center text-base font-bold leading-snug text-background transition hover:-translate-y-px hover:opacity-90 sm:w-auto sm:px-8"
        >
          {hasAccess ? <ClinactText k="clinact.gratuitos.cta_assinante" /> : <ClinactText k="clinact.gratuitos.cta" />}
        </Link>
      </div>
    </section>
  );
}

// ── 6. Planos ──────────────────────────────────────────────────────────────

const PLAN_COPY: Record<ClinactPlanKey, { nome: ClinactCopyKey; periodo: ClinactCopyKey; cta: ClinactCopyKey }> = {
  mensal: { nome: "clinact.planos.mensal.nome", periodo: "clinact.planos.mensal.periodo", cta: "clinact.planos.mensal.cta" },
  anual: { nome: "clinact.planos.anual.nome", periodo: "clinact.planos.anual.periodo", cta: "clinact.planos.anual.cta" },
};

function Planos({ hasAccess, isLoggedIn }: SectionProps) {
  return (
    <section id={ANCHOR_PLANOS} className={`${BAND} scroll-mt-2`} style={BAND_STYLE_ALT}>
      <div className="mx-auto max-w-4xl">
        <h2 className={`${H2} text-center`} style={DISPLAY}>
          <ClinactText k="clinact.planos.title" />
        </h2>
        <p className={`${LEAD} mx-auto mt-5 max-w-2xl text-center`}>
          <ClinactText k="clinact.planos.lead" />
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {CLINACT_PLAN_LIST.map((plan) => {
            const copy = PLAN_COPY[plan.key];
            return (
              <div key={plan.key} className="flex flex-col rounded-2xl border border-border bg-surface-1 p-7">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-brand-text" style={MONO}>
                  <ClinactText k={copy.nome} />
                </p>
                {/* Price comes from the plan config, never from an editable string
                    (her decision 2): a price edited out of step with what PagBank
                    charges is a CDC problem, not a bug. */}
                <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-4xl font-black tabular-nums tracking-[-0.02em] text-foreground" style={DISPLAY}>
                    {formatBRL(plan.amount_cents)}
                  </span>
                  <span className="text-base text-muted-foreground">
                    <ClinactText k={copy.periodo} />
                  </span>
                </p>
                {plan.key === "anual" ? (
                  // The equivalent is computed from the two plan prices; only the
                  // words around it are editable ({mensal} stays in the text).
                  <p className="mt-2 text-sm text-foreground/85">
                    <ClinactText k="clinact.planos.anual.equivalente" vars={{ mensal: annualPerMonth() }} />
                  </p>
                ) : null}
                {/* mt-auto pins the button to the card's foot, so the two buttons
                    line up even though only the annual card has the extra line. */}
                <div className="mt-auto pt-7">
                  <Link href={hasAccess ? "/clinact/treinar" : planHref(plan.key, isLoggedIn)} className={BTN_PRIMARY_BASE}>
                    {hasAccess ? <ClinactText k="clinact.planos.cta_assinante" /> : <ClinactText k={copy.cta} />}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        {/* Her decision 3: renewal and billing terms are excluded from the
            section-visibility toggle — they can never be hidden with the plans. */}
        <p className="mx-auto mt-8 max-w-2xl text-center text-[15px] leading-relaxed text-muted-foreground">
          <ClinactText k="clinact.planos.renovacao" />
        </p>
      </div>
    </section>
  );
}

/**
 * Sections that can be moved but never hidden. Planos carries the prices AND
 * the renewal terms (her decision 3): a public sales page without them is a CDC
 * problem, and it would leave no way to subscribe.
 */
export const CLINACT_ALWAYS_VISIBLE = ["planos"];

/**
 * The sections, in their default order. `site_sections` only reorders and hides
 * them — a section with no row keeps the position it has here, so adding one is
 * never a database migration.
 */
export const CLINACT_SECTIONS: SectionDef[] = [
  { key: "hero", Section: Hero },
  { key: "competencias", Section: Competencias },
  { key: "casos", Section: Casos },
  { key: "evolucao", Section: Evolucao },
  { key: "gratuitos", Section: Gratuitos },
  { key: "planos", Section: Planos },
];
