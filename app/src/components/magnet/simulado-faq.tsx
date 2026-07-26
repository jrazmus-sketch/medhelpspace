import { SiteText } from "@/components/landing/site-text";

// The four objections that actually stop someone on this page, answered plainly.
//
// Every one of them is a reason to leave, and all four have a genuinely reassuring
// answer — so not saying them out loud costs conversions for no reason. Written as
// plain <details> so it works without JS and stays keyboard-accessible.

const FAQ = [
  {
    q: { k: "sim.faq.q1", fallback: "Preciso pagar alguma coisa?" },
    a: {
      k: "sim.faq.a1",
      fallback:
        "Não. O simulado e o gabarito comentado são gratuitos, sem cartão e sem período de teste. Se depois disso você quiser conhecer a plataforma, o convite estará lá — mas o simulado é seu de qualquer forma.",
    },
  },
  {
    q: { k: "sim.faq.q2", fallback: "Quanto tempo leva?" },
    a: {
      k: "sim.faq.a2",
      fallback:
        "Na prova real você teria cinco horas para 100 questões. Aqui não há limite de tempo: pode responder dez hoje, vinte amanhã, e terminar na semana que vem.",
    },
  },
  {
    q: { k: "sim.faq.q3", fallback: "Posso parar no meio e voltar depois?" },
    a: {
      k: "sim.faq.a3",
      fallback:
        "Pode. Cada resposta é salva automaticamente e enviamos um link por e-mail que te traz de volta exatamente ao ponto em que você parou — no computador ou no celular.",
    },
  },
  {
    q: { k: "sim.faq.q4", fallback: "O que vocês fazem com o meu e-mail?" },
    a: {
      k: "sim.faq.a4",
      fallback:
        "Usamos para te enviar o link do seu simulado e, depois, conteúdos sobre a preparação para o Revalida. Nada de spam, e todo e-mail tem um link de cancelamento com um clique.",
    },
  },
];

export function SimuladoFaq() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <h2 className="text-center font-display text-2xl font-bold tracking-tight sm:text-3xl">
        <SiteText as="span" k="sim.faq.title" fallback="Perguntas honestas, respostas diretas" />
      </h2>

      <div className="mt-8 space-y-2.5">
        {FAQ.map((item) => (
          <details
            key={item.q.k}
            className="group rounded-2xl border border-border/80 bg-surface-1/50 px-5 open:bg-surface-1/80"
          >
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 py-4 text-[15px] font-semibold text-foreground marker:hidden">
              <SiteText as="span" k={item.q.k} fallback={item.q.fallback} />
              <span
                aria-hidden
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <p className="pb-4 text-[15px] leading-relaxed text-muted-foreground">
              <SiteText as="span" multiline k={item.a.k} fallback={item.a.fallback} />
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
