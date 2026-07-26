import type { Metadata } from "next";
import Link from "next/link";
import { FunnelBeacon } from "@/components/magnet/funnel-beacon";
import { SimuladoGate } from "@/components/magnet/simulado-gate";
import { SimuladoPeek } from "@/components/magnet/simulado-peek";
import { SimuladoFaq } from "@/components/magnet/simulado-faq";
import { SiteText } from "@/components/landing/site-text";
import type { MagnetUtm } from "@/components/magnet/magnet-quiz";
import {
  getActiveCohortOptions,
  getSimuladoAreaCounts,
  SIMULADO_TOTAL,
} from "@/lib/magnet/simulado";

// PUBLIC, indexable, dark-only landing for the free 100-question simulado — the
// third lead funnel. The questions are 100 QUESTÕES INÉDITAS written in the style
// of the INEP 1ª etapa (not recycled past exams), delivered with a fully commented
// gabarito. The exam starts immediately after the form — no inbox round-trip — and
// the emailed link is for resuming. Lives OUTSIDE the /app gate. All copy is
// SiteText-wired (sim.*) so Karina can edit it in the visual editor.

export const metadata: Metadata = {
  title: "Simulado Revalida Grátis | 100 Questões Estilo INEP | Gabarito Comentado",
  description:
    "Faça grátis um simulado com 100 questões inéditas no estilo INEP e gabarito comentado. Teste seu nível, identifique lacunas e descubra o que revisar. Sem cartão.",
  alternates: { canonical: "/simulado-revalida" },
};

export const dynamic = "force-dynamic"; // reads UTM from the query string

export default async function SimuladoRevalidaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [cohorts, areaCounts] = await Promise.all([
    getActiveCohortOptions(),
    getSimuladoAreaCounts(),
  ]);
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
      style={{ background: "radial-gradient(ellipse 140% 85% at 50% -8%, #1d1042 0%, #120a2b 44%, #08041a 100%)" }}
    >
      <FunnelBeacon utm={utm} funnel="simulado-100" />

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
              "linear-gradient(rgba(150,115,245,0.085) 1px, transparent 1px), linear-gradient(90deg, rgba(150,115,245,0.085) 1px, transparent 1px), linear-gradient(rgba(120,90,215,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(120,90,215,0.035) 1px, transparent 1px)",
            backgroundSize: "104px 104px, 104px 104px, 26px 26px, 26px 26px",
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
            "radial-gradient(44% 32% at 82% 0%, rgba(192,132,232,0.22), transparent 60%), radial-gradient(38% 26% at 70% 8%, rgba(240,170,140,0.09), transparent 62%), radial-gradient(42% 34% at 6% 14%, rgba(122,29,145,0.20), transparent 58%), radial-gradient(ellipse 90% 42% at 50% 110%, rgba(122,29,145,0.10), transparent 72%), linear-gradient(to right, rgba(3,1,9,0.5), transparent 15%, transparent 85%, rgba(3,1,9,0.5))",
        }}
      />

      {/* Subtle film grain for texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035] mix-blend-soft-light"
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
        {/* items-START, not items-center: the columns are never the same height,
            and centering a short column against a tall form leaves it floating in
            the middle with dead space above and below. */}
        <section className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-muted/30 px-3 py-1 text-xs font-semibold text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              <SiteText as="span" k="sim.hero.badge" fallback="Grátis · 100 questões inéditas · sem cartão" />
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              <SiteText as="span" k="sim.hero.title_1" fallback="Simulado Revalida gratuito com" />{" "}
              <span className="bg-gradient-to-r from-brand to-[#c084e8] bg-clip-text text-transparent">
                <SiteText as="span" k="sim.hero.title_accent" fallback="100 questões inéditas" />
              </span>
              <SiteText as="span" k="sim.hero.title_2" fallback="." />
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              <SiteText
                as="span"
                multiline
                k="sim.hero.subhead"
                fallback="Treine com questões no estilo da prova do INEP, revise as cinco grandes áreas e use o gabarito comentado para compreender seus erros e direcionar melhor seus estudos."
              />
            </p>

            {/* The bold stat strip. */}
            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border/80 bg-surface-1/50 p-4 backdrop-blur-sm">
              <div className="shrink-0 text-center">
                <div className="font-display text-3xl font-extrabold tabular-nums text-brand sm:text-4xl">
                  {SIMULADO_TOTAL}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <SiteText as="span" k="sim.hero.stat_label" fallback="questões inéditas" />
                </div>
              </div>
              <p className="text-sm leading-snug text-muted-foreground">
                <SiteText
                  as="span"
                  multiline
                  k="sim.hero.stat"
                  fallback="Questões elaboradas para avaliar raciocínio clínico, interpretação e escolha da conduta mais adequada — no nível e no formato da 1ª etapa."
                />
              </p>
            </div>

            {/* "O que você vai receber" lives on the LEFT now: it's pitch, not form,
                and it gives this column the height it was missing. */}
            <ul className="mt-6 space-y-2.5">
              {[
                { k: "sim.get.0", fallback: "100 questões inéditas no estilo da 1ª etapa" },
                { k: "sim.get.1", fallback: "Clínica Médica, Cirurgia, Pediatria, GO e Saúde Coletiva" },
                { k: "sim.get.2", fallback: "Gabarito com comentários sobre todas as alternativas" },
                { k: "sim.get.3", fallback: "Sem limite de tempo — seu progresso fica salvo" },
              ].map((item) => (
                <li key={item.k} className="flex items-start gap-2.5 text-[15px] text-muted-foreground">
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

            {/* The three things that actually dissolve the hesitation, said where
                the hesitation happens rather than after signup. */}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
              {[
                { k: "sim.hero.re_0", fallback: "Grátis, sem cartão" },
                { k: "sim.hero.re_1", fallback: "Sem cronômetro" },
                { k: "sim.hero.re_2", fallback: "Pare e volte quando quiser" },
              ].map((item) => (
                <span key={item.k} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="text-brand">
                    ✓
                  </span>
                  <SiteText as="span" k={item.k} fallback={item.fallback} />
                </span>
              ))}
            </div>

            <p className="mt-5 border-l-2 border-brand/40 pl-4 text-[15px] leading-relaxed text-muted-foreground">
              <SiteText
                as="span"
                multiline
                k="sim.hero.trust"
                fallback="São as mesmas 100 questões que entregamos aos nossos alunos dentro da plataforma. Aqui elas são suas de graça — sem versão reduzida."
              />
            </p>
          </div>

          {/* Right column: the form, and only the form. */}
          <div className="lg:sticky lg:top-8">
            <SimuladoGate utm={utm} cohorts={cohorts} />
          </div>
        </section>

        <SimuladoPeek />

        {/* ── Composition: the five grandes áreas ───────────────────────────── */}
        <section className="border-y border-border/60 bg-surface-1/30">
          <div className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-wider text-brand">
                <SiteText as="span" k="sim.blocos.eyebrow" fallback="No formato da prova" />
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                <SiteText as="span" k="sim.blocos.title" fallback="As cinco grandes áreas da 1ª etapa" />
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
                <SiteText
                  as="span"
                  multiline
                  k="sim.blocos.body"
                  fallback="As questões vêm misturadas, como no caderno oficial — você não sabe de antemão a área de cada uma, e reconhecer isso faz parte da prova. O peso de cada área acompanha o da 1ª etapa."
                />
              </p>
            </div>

            <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {areaCounts.map((a) => (
                <div
                  key={a.key}
                  className="rounded-2xl border border-border/80 bg-surface-1/50 p-4 text-center"
                >
                  <div className="min-h-[2.5rem] text-sm font-semibold leading-tight text-foreground">
                    {a.label}
                  </div>
                  <div className="mt-2 font-display text-2xl font-extrabold tabular-nums text-brand">
                    {a.count}
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
              <SiteText as="span" k="sim.how.title" fallback="Cadastre-se, resolva, revise" />
            </h2>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {[
              {
                n: "1",
                k: "sim.how.step1",
                fallback: "Informe nome, e-mail e para qual Revalida você estuda. A prova começa na hora, sem espera — e o link de retorno vai para o seu e-mail.",
                titleK: "sim.how.step1_title",
                titleFallback: "Cadastre-se",
              },
              {
                n: "2",
                k: "sim.how.step2",
                fallback: "Responda as 100 questões sem limite de tempo, como na prova real: sem ver acertos e erros durante o simulado. Pode parar e voltar quando quiser.",
                titleK: "sim.how.step2_title",
                titleFallback: "Resolva",
              },
              {
                n: "3",
                k: "sim.how.step3",
                fallback: "Ao entregar, veja seu desempenho nas cinco grandes áreas e o gabarito comentado de todas as questões — por que a certa está certa e onde cada alternativa erra.",
                titleK: "sim.how.step3_title",
                titleFallback: "Revise",
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

        <SimuladoFaq />

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
                fallback="100 questões inéditas, desempenho por grande área e gabarito comentado. Grátis, sem cartão — e você começa agora mesmo."
              />
            </p>
            <div className="mx-auto mt-7 max-w-md text-left">
              <SimuladoGate utm={utm} cohorts={cohorts} />
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
