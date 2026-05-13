import { FeatureBand, type FeatureBandData } from "./feature-band";
import { HeaderInner } from "./features-section-header";

const FEATURES: FeatureBandData[] = [
  {
    num: "01",
    id: "questoes",
    name: "Estudo por Questões",
    tagline: "Treino real de Revalida: resolver, entender e acertar mais.",
    body: "Você faz questões oficiais por tema com comentários que mostram o raciocínio, a pegadinha e a conduta que marca ponto.",
    detail: "Reforça com simulados inéditos comentados no mesmo padrão: alternativa correta + comentário + pega Revalida + resumo-chave.",
    result: "Você treina o que cai, do jeito que cai — reduz pegadinhas e ganha segurança.",
    color: "var(--c-questoes)",
    mockupVariant: "questoes",
    bgClass: "bg-background",
  },
  {
    num: "02",
    id: "resumos",
    name: "Resumos Narrativos",
    tagline: "Clínica em cena: menos teoria solta, mais raciocínio que vira acerto.",
    body: "Você acompanha o caso, reconhece o padrão, entende o raciocínio e fecha com a conduta do jeito que cai.",
    detail: "No final você recebe o que a prova quer + checklist de revisão rápida para destravar a questão em minutos.",
    result: "Menos decoreba, mais clareza — e mais acertos sob pressão.",
    color: "var(--c-resumos)",
    mockupVariant: "resumos",
    flip: true,
    bgClass: "bg-[var(--lp-alt-bg)]",
  },
  {
    num: "03",
    id: "medvoice",
    name: "MedVoice",
    tagline: "Não é aula. É treinamento de decisão — em áudios curtos.",
    body: "Você entra numa cena clínica, aprende o raciocínio que cai, identifica a pegadinha e sai com a conduta pronta na cabeça.",
    detail: "Cada áudio: cena → diagnóstico → pegadinhas → conduta → grito da prova. Fecha com comando de sobrevivência + fica a dica.",
    result: "Revisão rápida, todo dia, sem enrolação — resposta mais automática na prova.",
    color: "var(--c-medvoice)",
    mockupVariant: "medvoice",
    bgClass: "bg-background",
  },
  {
    num: "04",
    id: "formula",
    name: "Fórmula MedHelp",
    tagline: "Não é resumo. É atalho de prova — em dicas curtas e diretas.",
    body: "Você pega o tema que já caiu, vê onde a banca tenta te derrubar e grava a resposta certa em segundos.",
    detail: "Cada dica: pegadinha clássica → regrinha de memorização → o que fazer → dica extra. Com macetes, mnemônicos e frases-chave.",
    result: "Você reduz erro bobo, ganha velocidade — e marca certo quando a banca tenta te confundir.",
    color: "var(--c-formula)",
    mockupVariant: "formula",
    flip: true,
    bgClass: "bg-[var(--lp-alt-bg)]",
  },
  {
    num: "05",
    id: "audiocards",
    name: "Audiocards",
    tagline: "Flashcards em áudio com o que já caiu na prova.",
    body: "Para revisar em qualquer lugar, de forma leve, rápida e constante — do jeito que fixa.",
    detail: "Áudios curtos e objetivos, perfeitos para repetição diária. Só temas recorrentes do Revalida — para transformar conteúdo em memória ativa.",
    result: "Revisão rápida em qualquer momento do dia — conteúdo vivo na cabeça na hora da prova.",
    color: "var(--c-audiocards)",
    mockupVariant: "audiocards",
    bgClass: "bg-background",
  },
];

export function FeaturesSection() {
  return (
    <div id="sistema">
      {/* Section header */}
      <HeaderInner />

      {/* Feature bands */}
      {FEATURES.map((feat) => (
        <FeatureBand key={feat.id} feature={feat} />
      ))}
    </div>
  );
}
