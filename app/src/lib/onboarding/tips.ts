/**
 * Single source of truth for the new-member walkthrough.
 *
 * Every tip is defined ONCE here and rendered on three surfaces so the copy
 * never drifts:
 *   1. Inline <Coachmark> boxes that appear in context on each section and can
 *      be dismissed with the X (components/onboarding/coachmark.tsx).
 *   2. The permanent guide at /app/comecar (app/app/comecar/page.tsx).
 *   3. The first-run <WelcomeCard> on the dashboard (uses the "welcome" tip).
 *
 * Member-facing surface → copy is hardcoded Portuguese (no i18n here, per the
 * "member-facing site is Portuguese only" rule in CLAUDE.md).
 *
 * Body/reviewNote support a tiny **bold** syntax rendered by <Emphasis> — never
 * raw HTML (the dangerouslySetInnerHTML hook would block it, and we don't want
 * injection on user-visible copy anyway).
 */

export type CoachKey =
  | "welcome"
  | "dash-study-types"
  | "dash-specialties"
  | "specialty-hub"
  | "type-hub"
  | "quiz"
  | "simulados"
  | "flashcards"
  | "lesson"
  | "audio"
  | "audiocards"
  | "memorecards"
  | "revalida-up"
  | "revisao"
  | "plano"
  | "roteiro"
  | "medhelp-60d"
  | "progresso"
  | "nav";

export interface Tip {
  key: CoachKey;
  /** Short heading shown in bold at the top of the box / guide section. */
  title: string;
  /** Main explanation. Supports **bold**. */
  body: string;
  /** Optional "Como entra na Revisão" line, tinted + icon-led. Supports **bold**. */
  reviewNote?: string;
  /**
   * Optional titled section under the body (site_content `onboarding.<key>.<section.field>.title|body`).
   * Paragraphs separated by blank lines.
   */
  section?: { field: string; title: string; body: string };
  /** Optional deep link rendered from the guide page. */
  href?: string;
  hrefLabel?: string;
}

export const TIPS: Record<CoachKey, Tip> = {
  welcome: {
    key: "welcome",
    title: "Bem-vindo ao MedHelpSpace",
    body:
      "Comece pelo **Meu Plano**: defina seus dias e tempo de estudo e receba um cronograma com temas por prioridade para estudar, praticar e revisar.\n\nVocê também pode explorar os materiais por **tipo de conteúdo** — questões, simulados, flashcards, resumos, áudios e outros — ou por **especialidade**.\n\nPara retomar de onde parou, use o cartão **Continuar**.",
    reviewNote:
      "Tudo que você pratica entra automaticamente na **Revisão** e volta na hora certa para fixar na memória.",
    href: "/app/comecar",
    hrefLabel: "Ver o guia completo",
  },

  "dash-study-types": {
    key: "dash-study-types",
    title: "Escolha como estudar",
    body:
      "Cada tipo de conteúdo cobre **todas as especialidades**. Você pode **praticar** (Questões, Flashcards, Revalida Up), **ler** (Resumos) ou **ouvir** (MedVoice, AudioCards). Escolha o tipo e depois a especialidade.",
  },

  "dash-specialties": {
    key: "dash-specialties",
    title: "Estude por especialidade",
    body:
      "Prefere focar num tema? Entre numa especialidade e encontre **todo o conteúdo dela** — questões, resumos, áudios e mais — em um só lugar.",
  },

  "specialty-hub": {
    key: "specialty-hub",
    title: "Tudo desta especialidade",
    body:
      "Aqui estão os tipos de conteúdo disponíveis para esta especialidade. Escolha por onde começar — você alterna entre eles quando quiser pelo menu **Estudar**.",
  },

  "type-hub": {
    key: "type-hub",
    title: "Escolha a especialidade",
    body:
      "Este é o índice deste tipo de conteúdo, com todas as especialidades. Selecione uma para começar.",
  },

  quiz: {
    key: "quiz",
    title: "Como funcionam as questões",
    body:
      "Uma questão por vez, com **correção e comentário** logo após responder. Errou? Você pode marcar **por que errou** (faltou conteúdo, interpretação, distração…) para o plano entender seus pontos fracos. No fim, dá para refazer só as que você errou.",
    reviewNote:
      "Cada questão respondida entra na **Revisão**. Errou? Ela volta amanhã em “Só as que errei”.",
    href: "/app/estudo-por-questoes",
    hrefLabel: "Estudar questões",
  },

  simulados: {
    key: "simulados",
    title: "Como funcionam os simulados",
    body:
      "Cada simulado é um **treino de prova**: uma questão por vez, com correção e comentário logo após responder — e, ao errar, você pode marcar **por que errou**. Em **Geral** você treina um mix de todas as áreas, como na prova real; em **Por área**, foca numa especialidade. No fim, dá para refazer só as que errou.",
    reviewNote:
      "Cada questão respondida entra na **Revisão** e volta na hora certa — errou, ela retorna em “Só as que errei”.",
    href: "/app/estudo-por-questoes?tab=simulados",
    hrefLabel: "Abrir simulados",
  },

  flashcards: {
    key: "flashcards",
    title: "Como funcionam os flashcards",
    body:
      "Toque para virar o cartão e ver a resposta. Depois, marque com honestidade se **errou** ou **acertou**.",
    reviewNote:
      "Sua autoavaliação alimenta a **Revisão**: acertou, o cartão demora mais para voltar; errou, ele volta logo.",
    href: "/app/flashcards",
    hrefLabel: "Abrir flashcards",
  },

  lesson: {
    key: "lesson",
    title: "Como ler os resumos",
    body:
      "Use o índice lateral para navegar entre as seções. Ao terminar cada uma, toque em **“Concluir e continuar”** para marcá-la como concluída e avançar para a próxima.",
    reviewNote:
      "Resumos não entram na Revisão — fixe o conteúdo praticando as **questões e flashcards** do mesmo tema.",
    href: "/app/resumos",
    hrefLabel: "Ver resumos",
  },

  audio: {
    key: "audio",
    title: "Como usar o MedVoice",
    body:
      "Treinamento em **áudio** por tema: ouça por seção, com controles de avançar e voltar 15s. Onde houver, toque em **Transcrição** para ler enquanto escuta.",
    reviewNote:
      "O MedVoice é para escuta — fixe o conteúdo praticando as **questões e flashcards** do mesmo tema.",
    href: "/app/medvoice",
    hrefLabel: "Ouvir MedVoice",
  },

  audiocards: {
    key: "audiocards",
    title: "Como funcionam os AudioCards",
    body:
      "São os mesmos cartões dos **Flashcards**, agora em áudio: ouça a pergunta e a resposta de cada tema sem precisar olhar a tela. Toque em **Transcrição do áudio** para ler junto; avance e volte 15s pelos controles. Você encontra os áudios da especialidade logo depois das suas sessões de flashcards, no seu painel e na própria seção de AudioCards — é um apoio opcional, é só ouvir, sem marcar nada.",
    reviewNote:
      "Os AudioCards são só para escuta — quem agenda a **Revisão** espaçada é o mesmo tema nos **Flashcards**.",
    href: "/app/audiocards",
    hrefLabel: "Abrir AudioCards",
  },

  memorecards: {
    key: "memorecards",
    title: "Como usar os MemoreCards",
    body:
      "Os pontos-chave de cada tema em cartões visuais, na mesma organização do **Revalida Up**. Escolha a especialidade e avance no seu ritmo — pelo botão **Próximo**, pelas setas do teclado ou deslizando no celular. Quando um tema termina, o seguinte começa em sequência; em **Temas** você vai direto a qualquer um.",
    reviewNote:
      "Ao terminar um tema, ele entra num ciclo de **releitura espaçada** na Revisão (em 3, 7, 14 e 30 dias), sempre antes da data da sua prova.",
    href: "/app/memorecards",
    hrefLabel: "Abrir MemoreCards",
  },

  "revalida-up": {
    key: "revalida-up",
    title: "Como usar o Revalida Up",
    body:
      "Os padrões que mais caem na prova, em formato de **recordação ativa**: tente lembrar o PADRÃO antes de revelar. É a sua decisão estratégica para os pontos de maior retorno.",
    href: "/app/revalida-up",
    hrefLabel: "Abrir Revalida Up",
  },

  revisao: {
    key: "revisao",
    title: "Sua central de Revisão",
    body:
      "Aqui voltam, na hora certa, as questões e flashcards que você já estudou. **Revisar hoje** traz o que está no ponto; **Só as que errei** recupera os erros; **Pontos fracos** foca nas especialidades mais frágeis; e **Reler memorecards** traz de volta os temas dos MemoreCards (MedHelp 60D) na hora da releitura.",
    reviewNote:
      "O número ao lado de *Revisão* no menu mostra quantos itens estão prontos para hoje.",
    href: "/app/revisao",
    hrefLabel: "Ir para a Revisão",
  },

  plano: {
    key: "plano",
    title: "Seu plano de estudos",
    body:
      // Karina's text (2026-11-18); since 2026-11-19 the forecast is said to cover the regular course up to the
      // MedHelp 60D opening. The live copy is the site_content row `onboarding.plano.body`
      // (schema-patch-revisao-escolha-60d.sql) — keep both equal.
      "Configure seus dias de estudo, o tempo disponível por dia e os conteúdos que deseja incluir. O Meu Plano organiza suas atividades por prioridade, inclui revisões e estima o que cabe do curso regular até a abertura do MedHelp 60D. A programação se ajusta conforme seu progresso e as mudanças na sua disponibilidade.",
    reviewNote: "O plano já prioriza as suas revisões pendentes do dia.",
    href: "/app/plano",
    hrefLabel: "Ver meu plano",
  },

  roteiro: {
    key: "roteiro",
    title: "Seu roteiro de estudos",
    body:
      "A lista completa dos temas do Revalida, **ordenados pelo que mais cai na prova** (2020–2026.1) e agrupados por prioridade A→D. Vá de cima para baixo — os temas do topo dão o **maior retorno**. Cada tema mostra se você já **iniciou** ou **dominou**.",
    href: "/app/plano/roteiro",
    hrefLabel: "Abrir o roteiro",
  },

  "medhelp-60d": {
    key: "medhelp-60d",
    title: "O que é o MedHelp 60D",
    body:
      "Módulo de revisão intensiva que **abre sozinho** nos últimos ~60 dias antes da sua prova. Reúne a Fórmula MedHelp, os MemoreCards e os Simulados 100Q. Não é preciso fazer nada — o cadeado se solta na data certa.",
    // Karina's text (2026-11-19, 13h27 EST), verbatim — live copy in site_content
    // `onboarding.medhelp-60d.escolha.title|body` (schema-patch-revisao-escolha-60d.sql).
    section: {
      field: "escolha",
      title: "Escolha o que deseja revisar",
      body:
        "Ao terminar uma página do Fórmula MedHelp, marque “Quero revisar” se desejar retomá-la pela revisão espaçada. Nos Simulados 100Q, você pode selecionar individualmente as questões que errou.\n\nOs conteúdos selecionados ficam disponíveis pelo menu Revisão. Você pode desmarcar sua escolha a qualquer momento, sem perder seu histórico ou progresso no cronograma.\n\nOs MemoreCards continuam sendo incluídos automaticamente após a conclusão de cada tema. Durante o MedHelp 60D, essas revisões são opcionais e não são acrescentadas à programação diária do Meu Plano.",
    },
    href: "/app/medhelp-60d",
    hrefLabel: "Abrir MedHelp 60D",
  },

  progresso: {
    key: "progresso",
    title: "Acompanhe sua jornada",
    body:
      "No alto da tela, a barrinha de progresso mostra num relance quanto você já concluiu de todo o conteúdo liberado. Toque nela para abrir **Sua jornada** e ver o detalhe por seção — **Questões, Resumos, MedVoice, Flashcards** e mais.",
  },

  nav: {
    key: "nav",
    title: "Como navegar",
    body:
      "No menu **Estudar** você acessa os seis tipos de conteúdo. Use a **busca** para achar qualquer tema, o **sino** para avisos, e o número na **Revisão** mostra o que revisar hoje. No celular, a barra inferior traz o **Estudar** e a **Revisão**; a busca e o sino ficam no topo da tela.",
  },
};

/** Set of valid keys — used to validate the dismiss payload server-side. */
export const COACH_KEYS: ReadonlySet<string> = new Set(Object.keys(TIPS));

/**
 * Editable tip strings fetched from `site_content`, keyed by
 * `onboarding.<tip>.<field>` (field ∈ title/body/review, + onboarding.guide.h1).
 * `{}` when the table isn't seeded / mock mode → callers fall back to the
 * hardcoded TIPS above (identical text, just not editable).
 */
export type OnboardingContentMap = Record<string, { id: number; value: string }>;

/** Ordered layout for the permanent guide at /app/comecar. */
export const GUIDE_GROUPS: { title: string; keys: CoachKey[] }[] = [
  { title: "Visão geral", keys: ["welcome", "nav"] },
  {
    title: "Como estudar",
    keys: ["dash-study-types", "dash-specialties", "quiz", "simulados", "flashcards", "lesson", "audio", "audiocards", "revalida-up"],
  },
  { title: "A Revisão espaçada", keys: ["revisao"] },
  { title: "Planejamento", keys: ["plano", "roteiro"] },
  { title: "MedHelp 60D", keys: ["medhelp-60d", "memorecards"] },
];
