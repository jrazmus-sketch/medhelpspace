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
  /** Optional deep link rendered from the guide page. */
  href?: string;
  hrefLabel?: string;
}

export const TIPS: Record<CoachKey, Tip> = {
  welcome: {
    key: "welcome",
    title: "Bem-vindo ao MedHelpSpace",
    body:
      "Há duas formas de estudar: escolha um **tipo** de conteúdo (questões, flashcards, resumos, áudios…) ou entre direto numa **especialidade** e veja tudo dela reunido. O cartão *Continuar* sempre te traz de volta de onde parou.",
    reviewNote:
      "Tudo que você pratica entra automaticamente na **Revisão** e volta na hora certa para fixar na memória.",
    href: "/app/comecar",
    hrefLabel: "Ver o guia completo",
  },

  "dash-study-types": {
    key: "dash-study-types",
    title: "Escolha como estudar",
    body:
      "Cada modalidade cobre **todas as especialidades**: Praticar (Questões, Flashcards), Ler (Resumos, Revalida Up) ou Ouvir (MedVoice, AudioCards). Escolha o tipo e depois a especialidade.",
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
      "Uma questão por vez, com **correção e comentário** logo após responder. No fim, dá para refazer só as que você errou.",
    reviewNote:
      "Cada questão respondida entra na **Revisão**. Errou? Ela volta amanhã em “Só as que errei”.",
    href: "/app/estudo-por-questoes",
    hrefLabel: "Estudar questões",
  },

  simulados: {
    key: "simulados",
    title: "Como funcionam os simulados",
    body:
      "Cada simulado é um **treino de prova**: uma questão por vez, com correção e comentário logo após responder. Em **Geral** você treina um mix de todas as áreas, como na prova real; em **Por área**, foca numa especialidade. No fim, dá para refazer só as que errou.",
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
      "Use o índice lateral para navegar entre as seções e o botão “Próxima seção” para avançar. Onde houver, marque cada seção como **concluída** ao terminar.",
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
      "São os mesmos cartões dos **Flashcards**, agora em áudio: ouça a pergunta e a resposta de cada tema sem precisar olhar a tela. Toque em **Transcrição do áudio** para ler junto; avance e volte 15s pelos controles. Sugerimos os áudios da especialidade logo depois das suas sessões de flashcards e no seu painel — é um apoio opcional, é só ouvir, sem marcar nada.",
    reviewNote:
      "Os AudioCards são só para escuta — quem agenda a **Revisão** espaçada é o mesmo tema nos **Flashcards**.",
    href: "/app/audiocards",
    hrefLabel: "Abrir AudioCards",
  },

  memorecards: {
    key: "memorecards",
    title: "Como usar os MemoreCards",
    body:
      "Cartões de memorização para revisão rápida dentro do MedHelp 60D. Avance pelo conjunto no seu ritmo.",
    reviewNote:
      "Ao terminar um conjunto, ele entra num ciclo de **releitura espaçada** na Revisão (em 7, 21, 60 e 120 dias).",
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
      "Aqui voltam, na hora certa, as questões e flashcards que você já estudou. **Revisar hoje** traz o que está no ponto; **Só as que errei** recupera os erros; **Pontos fracos** foca nas especialidades mais frágeis.",
    reviewNote:
      "O número ao lado de *Revisão* no menu mostra quantos itens estão prontos para hoje.",
    href: "/app/revisao",
    hrefLabel: "Ir para a Revisão",
  },

  plano: {
    key: "plano",
    title: "Seu plano de estudos",
    body:
      "Um roteiro diário montado a partir das suas metas e do seu desempenho, com **links diretos** para o próximo conteúdo. Pode pausar quando precisar — ele se reajusta.",
    reviewNote: "O plano já prioriza as suas revisões pendentes do dia.",
    href: "/app/plano",
    hrefLabel: "Ver meu plano",
  },

  "medhelp-60d": {
    key: "medhelp-60d",
    title: "O que é o MedHelp 60D",
    body:
      "Módulo de revisão intensiva que **abre sozinho** nos últimos ~60 dias antes da sua prova. Reúne a Fórmula MedHelp, os MemoreCards e os Simulados 100Q. Não é preciso fazer nada — o cadeado se solta na data certa.",
    href: "/app/medhelp-60d",
    hrefLabel: "Abrir MedHelp 60D",
  },

  progresso: {
    key: "progresso",
    title: "Acompanhe sua jornada",
    body:
      "No alto da tela, a barra **Sua jornada** mostra num relance quanto você já concluiu de todo o conteúdo liberado. Toque nela para ver o detalhe por seção — **Questões, Resumos, MedVoice, Flashcards** e mais.",
  },

  nav: {
    key: "nav",
    title: "Como navegar",
    body:
      "No menu **Estudar** você acessa os seis tipos de conteúdo. Use a **busca** para achar qualquer tema, o **sino** para avisos, e o número na **Revisão** mostra o que revisar hoje. No celular, tudo isso fica na barra inferior.",
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
  { title: "A Revisão espaçada", keys: ["revisao", "memorecards"] },
  { title: "Planejamento", keys: ["plano"] },
  { title: "MedHelp 60D", keys: ["medhelp-60d"] },
];
