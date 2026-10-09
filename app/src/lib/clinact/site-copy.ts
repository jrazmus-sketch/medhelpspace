/**
 * Every editable ClinAct string — the sales page (/clinact) and the platform
 * pages (/clinact/treinar, the specialty page, Minha Evolução) — in ONE place.
 *
 * Why one place (Karina, 2026-10-08: "a edição não está funcionando"): a
 * <SiteText> is only editable once its `site_content` row exists; without the
 * row it renders the fallback as plain text, so "Edição rápida ativa" turned on
 * and nothing could be clicked. The sales page shipped with 41 keys in code and
 * none in the database. Now the components read their fallback from this map
 * (<ClinactText k=…> is typed against it, so a key cannot exist only in code),
 * and `scripts/clinact-seed-site-content.ts` creates every missing row from the
 * same map — run it on prod AND local whenever a key is added.
 *
 * `{token}` placeholders are substituted at render time (SiteText `vars`) and
 * stay in the stored text, so a computed value — the annual plan's monthly
 * equivalent, the case count — never drifts from the real number.
 *
 * The text is Karina's, verbatim (2026-10-08). Pure: no server imports.
 */
export const CLINACT_COPY = {
  // ── Sales page — 1. Início ──────────────────────────────────────────────
  "clinact.hero.label": "MEDHELPSPACE · CLINACT",
  "clinact.hero.title": "Raciocínio que termina em",
  "clinact.hero.title_accent": "decisão.",
  "clinact.hero.sub": "Casos clínicos interativos para treinar suas decisões.",
  "clinact.hero.publico": "Para internos de Medicina, médicos recém-formados e estudantes em fase clínica avançada.",
  "clinact.hero.semanal": "Novos casos toda semana.",
  "clinact.hero.cta": "Experimente o ClinAct de graça",
  "clinact.hero.cta_assinante": "Entrar nos casos",
  "clinact.hero.cta2": "Ver planos",

  // ── 2. Os quatro formatos ───────────────────────────────────────────────
  "clinact.competencias.title": "Quatro formas de treinar suas decisões.",
  "clinact.competencias.codigo_clinico": "Conecte as pistas e construa sua hipótese.",
  "clinact.competencias.clinica_em_cena": "Conduza o caso, decisão por decisão.",
  "clinact.competencias.decisao_30s": "Identifique o que precisa ser feito primeiro.",
  "clinact.competencias.ponto_de_virada": "Diante de um novo dado, decida o que manter e o que mudar.",

  // ── 3. Veja o ClinAct na prática ────────────────────────────────────────
  "clinact.casos.title": "Veja o ClinAct na prática.",
  "clinact.casos.lead": "Analise o caso, tome decisões e aprenda com o feedback.",
  "clinact.casos.legenda":
    "Exemplo do formato Clínica em Cena: o Prontuário Vivo reúne os achados, as condutas e o tempo do caso.",
  "clinact.casos.midia": "Exames e sons clínicos fazem parte do treino quando o caso exige.",
  "clinact.casos.fecho": "Ao final de cada caso, leve um princípio de raciocínio para os próximos desafios.",

  // ── 4. Entenda suas decisões ────────────────────────────────────────────
  "clinact.evolucao.title": "Entenda suas decisões.",
  "clinact.evolucao.lead":
    "Acompanhe seu desempenho e identifique erros cometidos com alta confiança. A revisão prioriza os casos que precisam de mais atenção.",

  // ── 5. Quatro casos gratuitos ───────────────────────────────────────────
  "clinact.gratuitos.label": "4 casos gratuitos",
  "clinact.gratuitos.title": "Experimente o ClinAct antes de assinar.",
  "clinact.gratuitos.lead":
    "Quatro casos completos, um de cada formato, com feedback e acompanhamento da sua evolução. Gratuitos, sem prazo de expiração.",
  "clinact.gratuitos.cta": "Experimentar os 4 casos grátis",
  "clinact.gratuitos.cta_assinante": "Entrar nos casos",

  // ── 6. Planos ───────────────────────────────────────────────────────────
  // Prices are NOT here: they come from lib/clinact/plans.ts (her decision 2).
  "clinact.planos.title": "Assine o ClinAct",
  "clinact.planos.lead": "Acesso à biblioteca completa e aos novos casos publicados toda semana durante a assinatura.",
  "clinact.planos.mensal.nome": "Plano mensal",
  "clinact.planos.mensal.periodo": "por mês",
  "clinact.planos.mensal.cta": "Assinar plano mensal",
  "clinact.planos.anual.nome": "Plano anual",
  "clinact.planos.anual.periodo": "por ano",
  "clinact.planos.anual.equivalente": "Equivalente a {mensal} por mês.",
  "clinact.planos.anual.cta": "Assinar plano anual",
  "clinact.planos.cta_assinante": "Entrar nos casos",
  "clinact.planos.renovacao":
    "Renovação automática mensal ou anual, conforme o plano. Cancele pela sua conta e mantenha o acesso até o fim do período pago.",

  // ── Platform — Casos (/clinact/treinar) ─────────────────────────────────
  "clinact.app.treinar.title": "Casos",
  "clinact.app.treinar.sub": "Raciocínio clínico que termina em uma decisão. Um caso por vez.",
  "clinact.app.treinar.semanal": "Novos casos toda semana para você continuar treinando seu raciocínio clínico.",
  "clinact.app.treinar.gratis_title": "Experimente grátis um caso de cada formato.",
  "clinact.app.treinar.gratis_body":
    "Os casos marcados como grátis estão liberados por completo. Os demais abrem com a assinatura.",
  "clinact.app.treinar.revisoes_title": "Revisões de hoje",
  "clinact.app.treinar.revisoes_hint":
    "Casos que chegaram à data de rever. Refazer não muda a sua primeira nota — reexpõe o raciocínio.",
  "clinact.app.treinar.portaA_label": "Treine uma habilidade",
  "clinact.app.treinar.portaA_lead": "Cada formato treina um jeito diferente de raciocinar. Escolha como você quer pensar hoje.",
  "clinact.app.treinar.portaB_label": "Estude por especialidade",
  "clinact.app.treinar.portaB_lead": "Entre pela especialidade e escolha, lá dentro, em qual formato quer treiná-la.",
  "clinact.app.treinar.vazio": "Nenhuma especialidade com casos publicados ainda.",
  "clinact.app.treinar.todos": "Ver todos os casos",

  // ── Platform — specialty page (/clinact/treinar/[especialidade]) ────────
  "clinact.app.especialidade.lead": "Escolha como quer treinar esta especialidade. {casos} por aqui.",
  "clinact.app.especialidade.formato": "Formato",

  // ── Platform — Minha Evolução (/clinact/evolucao) ───────────────────────
  "clinact.app.evolucao.title": "Minha Evolução",
  "clinact.app.evolucao.lead":
    "Conta a primeira conclusão de cada caso. Refazer um caso treina — mas não muda estes números.",
  "clinact.app.evolucao.vazio": "Nenhum caso concluído ainda.",
  "clinact.app.evolucao.comecar": "Começar um caso",
  "clinact.app.evolucao.por_formato": "Por formato",
  "clinact.app.evolucao.confianca": "Confiança nas decisões",
  "clinact.app.evolucao.concluidos": "Casos concluídos",
} as const;

export type ClinactCopyKey = keyof typeof CLINACT_COPY;
