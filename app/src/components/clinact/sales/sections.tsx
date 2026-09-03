import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { SiteText } from "@/components/landing/site-text";
import { FORMATS, FORMAT_COLOR_VARS, FORMAT_LABELS, FORMAT_SKILL, SKILL_LABELS } from "@/lib/clinact/types";
import { CLINACT_PLAN_LIST, annualInMonthlies, annualPerMonth, formatBRL } from "@/lib/clinact/plans";

/**
 * The ClinAct sales page, section by section.
 *
 * Structure and copy are Karina's brief (CLINACT-SALES-PAGE-SPEC.md §1), which
 * moves the reader: problema → proposta → experiência → diferenciais
 * pedagógicos → acompanhamento → experimentação gratuita → assinatura. It is
 * deliberately NOT a feature list.
 *
 * Every string goes through <SiteText>, so all of it is editable from the admin
 * with no deploy; the hardcoded text here is the fallback that renders when a
 * row is missing, so deleting a row can never break the page.
 *
 * The two things that are NOT editable strings, on purpose:
 *   · prices — they come from lib/clinact/plans.ts (her decision 2);
 *   · the case count — computed from the published library, never typed
 *     (her decision 5), and not shown at launch at all.
 *
 * Sections are declared here and merely ORDERED/HIDDEN by `site_sections`, so
 * adding one is a code change and never a database migration.
 */

type SectionProps = { hasAccess: boolean };
type SectionDef = { key: string; Section: (p: SectionProps) => React.ReactElement };

const WRAP = "mx-auto w-full max-w-3xl px-5";
const H2 = "text-2xl font-bold leading-tight sm:text-3xl";
const LEAD = "mt-3 text-base leading-relaxed text-muted-foreground";

/** Signup-first: no anonymous play (her decision 1), landing on the free cases. */
const TRY_HREF = "/signup?next=%2Fclinact%2Ftreinar";

function Hero({ hasAccess }: SectionProps) {
  return (
    <section className={`${WRAP} pb-12 pt-16 text-center sm:pt-24`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">MedHelpSpace</p>
      <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
        <SiteText k="clinact.hero.title" fallback="Raciocínio que termina em decisão." />
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
        <SiteText
          k="clinact.hero.sub"
          fallback="Treine como conectar pistas, conduzir casos, priorizar sob pressão e reavaliar quando o cenário muda."
        />
      </p>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
        <SiteText
          k="clinact.hero.definicao"
          fallback="Plataforma de treinamento de raciocínio clínico e tomada de decisão para internos e médicos recém-formados."
        />
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href={hasAccess ? "/clinact/treinar" : TRY_HREF}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand px-8 text-base font-semibold text-brand-fg sm:w-auto"
        >
          <SiteText k="clinact.hero.cta" fallback={hasAccess ? "Entrar nos casos" : "Experimentar gratuitamente"} />
        </Link>
        <Link
          href="#competencias"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-border px-8 text-base font-medium sm:w-auto"
        >
          <SiteText k="clinact.hero.cta2" fallback="Conhecer o ClinAct" />
        </Link>
      </div>
    </section>
  );
}

function Problema() {
  const perguntas = [
    ["clinact.problema.q1", "Qual pista realmente importa aqui?"],
    ["clinact.problema.q2", "O que eu faço primeiro?"],
    ["clinact.problema.q3", "Que exame pedir agora — e por quê agora?"],
    ["clinact.problema.q4", "Isso muda a minha hipótese?"],
    ["clinact.problema.q5", "Estou confiante porque sei, ou porque estou ancorado?"],
  ];
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.problema.title" fallback="Saber Medicina não é o mesmo que saber decidir." />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.problema.lead"
          fallback="Na hora do plantão, a prova não é de conteúdo. É de decisão — com informação incompleta e o relógio correndo."
        />
      </p>
      <ul className="mt-6 space-y-2.5">
        {perguntas.map(([k, fallback]) => (
          <li key={k} className="flex gap-3 text-[15px] leading-snug">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <SiteText k={k} fallback={fallback} />
          </li>
        ))}
      </ul>
      <p className="mt-6 text-lg font-semibold">
        <SiteText k="clinact.problema.fecho" fallback="É isso que o ClinAct treina." />
      </p>
    </section>
  );
}

function Competencias() {
  return (
    <section id="competencias" className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.competencias.title" fallback="Quatro competências, quatro jeitos de pensar." />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.competencias.lead"
          fallback="Cada formato existe para treinar uma habilidade diferente do raciocínio clínico — e não para variar o visual da mesma questão."
        />
      </p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {FORMATS.map((format) => (
          <div
            key={format}
            className="rounded-xl p-5"
            style={{
              background: `linear-gradient(140deg, color-mix(in srgb, ${FORMAT_COLOR_VARS[format]} 92%, #1a0030) 0%, ${FORMAT_COLOR_VARS[format]} 100%)`,
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(255,255,255,0.88)" }}>
              {SKILL_LABELS[FORMAT_SKILL[format]]}
            </p>
            <p className="mt-1 text-lg font-bold text-white">{FORMAT_LABELS[format]}</p>
            <p className="mt-1.5 text-sm leading-snug" style={{ color: "rgba(255,255,255,0.82)" }}>
              <SiteText k={`clinact.competencias.${format}`} fallback={COMPETENCIA_FALLBACK[format]} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

const COMPETENCIA_FALLBACK: Record<string, string> = {
  codigo_clinico: "Pistas soltas que só fazem sentido juntas. Você monta o quadro antes de nomear o diagnóstico.",
  clinica_em_cena: "Um plantão que avança cena a cena. Cada conduta muda o paciente e consome tempo.",
  decisao_30s: "Pouco tempo, uma decisão. O que importa é a ordem das condutas, não a lista delas.",
  ponto_de_virada: "Você decide, e então um dado novo aparece. A pergunta passa a ser se você muda de ideia.",
};

function Casos() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.casos.title" fallback="Casos interativos, não questões disfarçadas." />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.casos.lead"
          fallback="Em Clínica em Cena, o caso avança conforme as suas condutas. O Prontuário Vivo se monta sozinho com o que você fez, o que encontrou e o tempo que gastou."
        />
      </p>
      <blockquote className="mt-6 rounded-xl border-l-2 border-brand bg-surface-1 p-5 text-lg font-medium leading-snug">
        <SiteText
          k="clinact.casos.frase"
          fallback="A informação não precisa aparecer antes da decisão. Ela pode aparecer porque você decidiu buscá-la."
        />
      </blockquote>
    </section>
  );
}

function Midia() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.midia.title" fallback="Veja e ouça quando isso faz parte da decisão." />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.midia.lead"
          fallback="ECG, radiografia, tomografia, ultrassom, sopros e sons pulmonares — selecionados e auditados, revelados no momento clínico em que passam a existir. Nunca como enfeite."
        />
      </p>
    </section>
  );
}

function Confianca() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.confianca.title" fallback="Não importa apenas se você acertou." />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.confianca.lead"
          fallback="Em decisões de peso, o ClinAct pergunta o quanto você confia na sua escolha: baixa, média ou alta."
        />
      </p>
      <p className="mt-5 rounded-xl bg-brand/10 p-5 text-lg font-medium leading-snug">
        <SiteText
          k="clinact.confianca.frase"
          fallback="O ClinAct não mostra apenas onde você errou. Mostra onde você estava convencido de que estava certo."
        />
      </p>
    </section>
  );
}

function Evolucao() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.evolucao.title" fallback="Minha Evolução" />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.evolucao.lead"
          fallback="Treinos, desempenho geral e por formato, distribuição de confiança e os erros que você cometeu com alta confiança."
        />
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        <SiteText
          k="clinact.evolucao.regra"
          fallback="A sua primeira tentativa concluída permanece como referência. Refazer treina de novo sem apagar o que aconteceu."
        />
      </p>
    </section>
  );
}

function Revisao() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.revisao.title" fallback="Revisite o raciocínio no momento certo." />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.revisao.lead"
          fallback="Os casos voltam conforme o seu desempenho e a sua confiança. O que merece atenção volta antes — sem streak, sem pressão."
        />
      </p>
    </section>
  );
}

function LeveDesteCaso() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">
        <SiteText k="clinact.leve.label" fallback="Leve deste caso" />
      </p>
      <h2 className={`${H2} mt-2`}>
        <SiteText k="clinact.leve.title" fallback="Todo caso termina com uma regra que você leva embora." />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.leve.lead"
          fallback="Não é a resposta daquele caso. É o princípio de raciocínio que serve para o próximo paciente — o que faz o treino transferir."
        />
      </p>
    </section>
  );
}

function Biblioteca() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.biblioteca.title" fallback="Uma biblioteca viva, em expansão contínua." />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.biblioteca.lead"
          fallback="Novos desafios toda semana. Cada caso é construído para treinar uma decisão, com revisão clínica e pedagógica."
        />
      </p>
    </section>
  );
}

function Gratuitos({ hasAccess }: SectionProps) {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <div className="rounded-2xl border border-brand/40 bg-brand/10 p-7 text-center">
        <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand">
          <Sparkles className="h-4 w-4" />
          <SiteText k="clinact.gratuitos.label" fallback="Quatro casos gratuitos" />
        </p>
        <h2 className={`${H2} mt-3`}>
          <SiteText k="clinact.gratuitos.title" fallback="Experimente o ClinAct antes de assinar." />
        </h2>
        <p className={`${LEAD} mx-auto max-w-xl`}>
          <SiteText
            k="clinact.gratuitos.lead"
            fallback="Um caso gratuito de cada formato, completo do início ao fim — com feedback, confiança e Minha Evolução. Permanentemente gratuitos, não é um teste que expira."
          />
        </p>
        <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left">
          {FORMATS.map((format) => (
            <li key={format} className="flex items-center gap-2 text-[15px]">
              <Check className="h-4 w-4 shrink-0 text-brand" />
              {FORMAT_LABELS[format]}
            </li>
          ))}
        </ul>
        <Link
          href={hasAccess ? "/clinact/treinar" : TRY_HREF}
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-8 text-base font-semibold text-brand-fg"
        >
          <SiteText k="clinact.gratuitos.cta" fallback="Experimentar os 4 casos" />
        </Link>
      </div>
    </section>
  );
}

function ParaQuem() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.paraquem.title" fallback="Para quem é" />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.paraquem.lead"
          fallback="Internos de Medicina e médicos recém-formados que precisam decidir sob pressão. Também serve a estudantes em fase clínica avançada."
        />
      </p>
    </section>
  );
}

function OQueENaoE() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.oquee.title" fallback="O que é e o que não é" />
      </h2>
      <p className={LEAD}>
        <SiteText
          k="clinact.oquee.lead"
          fallback="Não é curso. Não é banco de questões. Não é videoaula. É treino de decisão."
        />
      </p>
    </section>
  );
}

function Planos() {
  return (
    <section className={`${WRAP} border-t border-surface-2 py-14`}>
      <h2 className={H2}>
        <SiteText k="clinact.planos.title" fallback="Assine o ClinAct" />
      </h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {CLINACT_PLAN_LIST.map((plan) => (
          <div key={plan.key} className="rounded-xl border border-border bg-surface-1 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">{plan.label}</p>
            {/* Price comes from the plan config, never from an editable string
                (her decision 2): a price edited out of step with what PagBank
                charges is a CDC problem, not a bug. */}
            <p className="mt-2 text-3xl font-bold tabular-nums">{formatBRL(plan.amount_cents)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.key === "mensal" ? "por mês" : `por ano — ${annualPerMonth()} por mês`}
            </p>
            {plan.key === "anual" ? (
              <p className="mt-3 text-sm font-medium text-brand">
                {`${annualInMonthlies()} mensalidades, doze meses`}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {/* Her decision 3: renewal and billing terms are excluded from the
          section-visibility toggle — they can never be hidden with the plans. */}
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        <SiteText
          k="clinact.planos.renovacao"
          fallback="A assinatura é renovada automaticamente conforme a modalidade escolhida — mensal a cada mês, anual a cada doze meses — até que você cancele. O cancelamento pode ser feito a qualquer momento pela sua conta, e o acesso permanece até o fim do período já pago."
        />
      </p>
    </section>
  );
}

/**
 * The sections, in their default order. `site_sections` only reorders and hides
 * them — a section with no row keeps the position it has here, so adding one is
 * never a database migration.
 */
export const CLINACT_SECTIONS: SectionDef[] = [
  { key: "hero", Section: Hero },
  { key: "problema", Section: Problema },
  { key: "competencias", Section: Competencias },
  { key: "casos", Section: Casos },
  { key: "midia", Section: Midia },
  { key: "confianca", Section: Confianca },
  { key: "evolucao", Section: Evolucao },
  { key: "revisao", Section: Revisao },
  { key: "leve-deste-caso", Section: LeveDesteCaso },
  { key: "biblioteca", Section: Biblioteca },
  { key: "gratuitos", Section: Gratuitos },
  { key: "para-quem", Section: ParaQuem },
  { key: "o-que-e-nao-e", Section: OQueENaoE },
  { key: "planos", Section: Planos },
];
