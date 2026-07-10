import type { Metadata } from "next";
import Link from "next/link";
import { FunnelBeacon } from "@/components/magnet/funnel-beacon";
import { SimuladoGate } from "@/components/magnet/simulado-gate";
import { SiteText } from "@/components/landing/site-text";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";
import { SIMULADO_BLOCOS, SIMULADO_TOTAL } from "@/lib/magnet/simulado-questions";

// PUBLIC, indexable, dark-only landing for the free 100-question simulado — the
// third lead funnel. Email-first (like /flashcards-revalida): the simulado is
// delivered by a magic link (see /simulado-revalida/acesso) that doubles as the
// resume link. Every question is a REAL past-Revalida (INEP) item, editions
// 2020–2025.2. Lives OUTSIDE the /app gate. All copy is SiteText-wired (sim.*).

export const metadata: Metadata = {
  title: "Simulado Revalida Grátis — 100 Questões Reais do INEP",
  description:
    "Faça grátis um simulado completo do Revalida: 100 questões reais das provas de 2020 a 2025, divididas em 5 blocos por grande área, com correção na hora e relatório de desempenho. Sem cartão.",
  alternates: { canonical: "/simulado-revalida" },
};

export const dynamic = "force-dynamic"; // reads UTM from the query string

// Static composition facts derived from the curated set (scripts/build-simulado-100.js).
const EDITION_CHIPS = ["2020", "2021", "2022.1", "2022.2", "2023.1", "2023.2", "2024.1", "2024.2", "2025.1", "2025.2"];

export default async function SimuladoRevalidaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const utm: MagnetUtm = {
    source: pick("utm_source"),
    medium: pick("utm_medium"),
    campaign: pick("utm_campaign"),
    term: pick("utm_term"),
    content: pick("utm_content"),
    gclid: pick("gclid"),
  };

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden text-foreground"
      style={{ background: "radial-gradient(ellipse 140% 85% at 50% -8%, #160a34 0%, #0a0620 44%, #030109 100%)" }}
    >
      <FunnelBeacon utm={utm} />

      {/* ── "ECG-world" backdrop (matches the front page + flashcards funnel) ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[120vh] overflow-hidden"
        style={{
          maskImage: "linear-gradient(to bottom, #000 0%, #000 46%, transparent 92%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 46%, transparent 92%)",
        }}
      >
        <div
          className="absolute"
          style={{
            inset: "-25% -12%",
            backgroundImage:
              "linear-gradient(rgba(140,100,240,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(140,100,240,0.16) 1px, transparent 1px), linear-gradient(rgba(110,80,210,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(110,80,210,0.07) 1px, transparent 1px)",
            backgroundSize: "84px 84px, 84px 84px, 21px 21px, 21px 21px",
            transform: "perspective(1100px) rotateX(24deg)",
            transformOrigin: "50% 40%",
          }}
        />
      </div>

      {/* Layered ambient glows + edge vignette. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(44% 32% at 82% 0%, rgba(192,132,232,0.20), transparent 60%), radial-gradient(42% 34% at 6% 14%, rgba(122,29,145,0.20), transparent 58%), radial-gradient(ellipse 90% 42% at 50% 110%, rgba(122,29,145,0.10), transparent 72%), linear-gradient(to right, rgba(3,1,9,0.5), transparent 15%, transparent 85%, rgba(3,1,9,0.5))",
        }}
      />

      {/* Subtle film grain for texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Minimal brand bar */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="text-sm font-bold tracking-tight">
            MedHelp<span className="text-brand">Space</span>
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <SiteText as="span" k="sim.topbar.label" fallback="Revalida · 1ª etapa" />
          </span>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero: pitch (left) + gate (right) ─────────────────────────────── */}
        <section className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-muted/30 px-3 py-1 text-xs font-semibold text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              <SiteText as="span" k="sim.hero.badge" fallback="Grátis · 100 questões reais · sem cartão" />
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              <SiteText as="span" k="sim.hero.title_1" fallback="Um simulado completo do Revalida, com" />{" "}
              <span className="bg-gradient-to-r from-brand to-[#c084e8] bg-clip-text text-transparent">
                <SiteText as="span" k="sim.hero.title_accent" fallback="100 questões reais" />
              </span>{" "}
              <SiteText as="span" k="sim.hero.title_2" fallback="da prova." />
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              <SiteText
                as="span"
                multiline
                k="sim.hero.subhead"
                fallback="Todas retiradas das provas oficiais do INEP de 2020 a 2025 — nada inventado. 5 blocos de 20 questões por grande área, correção na hora e um relatório que mostra exatamente onde você está perdendo pontos."
              />
            </p>

            {/* The bold stat strip — authenticity is the hook. */}
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border/80 bg-surface-1/50 p-4 backdrop-blur-sm">
              <div className="shrink-0 text-center">
                <div className="font-display text-3xl font-extrabold tabular-nums text-brand sm:text-4xl">
                  {SIMULADO_TOTAL}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <SiteText as="span" k="sim.hero.stat_label" fallback="questões INEP" />
                </div>
              </div>
              <p className="text-sm leading-snug text-muted-foreground">
                <SiteText
                  as="span"
                  multiline
                  k="sim.hero.stat"
                  fallback="Cada questão traz a identificação da prova de origem (ex.: “Questão 38 · Revalida 2020”). Você treina no nível e no estilo exatos da banca — porque É a banca."
                />
              </p>
            </div>

            {/* Edition chips — visual proof of the 2020–2025 spread. */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {EDITION_CHIPS.map((e) => (
                <span
                  key={e}
                  className="rounded-md bg-surface-1/70 px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground ring-1 ring-border"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>

          {/* The gate + a compact "what you get" strip. */}
          <div>
            <SimuladoGate utm={utm} />
            <ul className="mt-5 space-y-2.5 px-1">
              {[
                { k: "sim.get.0", fallback: "100 questões reais do Revalida (2020–2025)" },
                { k: "sim.get.1", fallback: "Correção na hora + relatório por grande área" },
                { k: "sim.get.2", fallback: "Faça em blocos de 20 — seu progresso fica salvo" },
              ].map((item) => (
                <li key={item.k} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-muted/60 text-[10px] font-bold text-brand"
                  >
                    ✓
                  </span>
                  <SiteText as="span" k={item.k} fallback={item.fallback} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Composition: 5 blocos of 20 by grande área ────────────────────── */}
        <section className="border-y border-border/60 bg-surface-1/30">
          <div className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-wider text-brand">
                <SiteText as="span" k="sim.blocos.eyebrow" fallback="No formato da prova" />
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                <SiteText as="span" k="sim.blocos.title" fallback="5 blocos de 20 questões, um por grande área" />
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                <SiteText
                  as="span"
                  multiline
                  k="sim.blocos.body"
                  fallback="A 1ª etapa do Revalida cobra as 5 grandes áreas — e o simulado espelha isso. Dentro de cada bloco, as questões cobrem os temas de maior incidência real nas provas, misturando todas as edições de 2020 a 2025."
                />
              </p>
            </div>

            <div className="mt-9 grid gap-3 sm:grid-cols-5">
              {SIMULADO_BLOCOS.map((b, i) => (
                <div
                  key={b.key}
                  className="rounded-2xl border border-border/80 bg-surface-1/50 p-4 text-center"
                >
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Bloco {i + 1}
                  </div>
                  <div className="mt-1 min-h-[2.5rem] text-sm font-semibold leading-tight text-foreground">
                    {b.label}
                  </div>
                  <div className="mt-2 font-display text-2xl font-extrabold tabular-nums text-brand">
                    {b.questionIds.length}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    questões
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-wider text-brand">
              <SiteText as="span" k="sim.how.eyebrow" fallback="Como funciona" />
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              <SiteText as="span" k="sim.how.title" fallback="Do e-mail ao diagnóstico em 3 passos" />
            </h2>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "1",
                k: "sim.how.step1",
                fallback: "Deixe seu e-mail e escolha sua prova. O link de acesso chega na hora — e é o mesmo link que salva seu progresso.",
                titleK: "sim.how.step1_title",
                titleFallback: "Receba seu acesso",
              },
              {
                n: "2",
                k: "sim.how.step2",
                fallback: "Responda os 5 blocos no seu ritmo, com correção na hora. Pode parar quando quiser: o simulado continua de onde você parou.",
                titleK: "sim.how.step2_title",
                titleFallback: "Faça no seu ritmo",
              },
              {
                n: "3",
                k: "sim.how.step3",
                fallback: "Ao final, veja seu desempenho por grande área e descubra exatamente quais áreas priorizar até a prova.",
                titleK: "sim.how.step3_title",
                titleFallback: "Receba o relatório",
              },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-border/80 bg-surface-1/50 p-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-muted/60 font-display text-sm font-extrabold text-brand">
                  {s.n}
                </div>
                <h3 className="mt-3 font-display text-base font-bold text-foreground">
                  <SiteText as="span" k={s.titleK} fallback={s.titleFallback} />
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  <SiteText as="span" multiline k={s.k} fallback={s.fallback} />
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA band ────────────────────────────────────────────────── */}
        <section className="border-t border-border/60 bg-gradient-to-b from-brand-muted/10 to-transparent">
          <div className="mx-auto max-w-2xl px-5 py-14 text-center sm:py-20">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              <SiteText
                as="span"
                k="sim.final.title"
                fallback="Descubra hoje a sua distância real da aprovação."
              />
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
              <SiteText
                as="span"
                multiline
                k="sim.final.body"
                fallback="100 questões reais, correção na hora e relatório por área. Deixe seu e-mail e o link chega em segundos — sem cartão, sem pegadinha."
              />
            </p>
            <div className="mx-auto mt-7 max-w-md text-left">
              <SimuladoGate utm={utm} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground">
          <span>
            <SiteText as="span" k="sim.footer.copyright" fallback="© MedHelpSpace" />
          </span>
          <span className="flex gap-4">
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link href="/termos" className="hover:text-foreground">Termos</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
