import Link from "next/link";

export function MidCta() {
  return (
    <section className="bg-brand px-5 py-16 text-center md:py-20">
      <div className="mx-auto max-w-3xl">
        <h2
          className="mb-4 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl"
          style={{ fontFamily: "var(--font-bricolage)" }}
        >
          Isso não é mais um preparatório.
          <br />
          É um sistema.
        </h2>
        <p className="mb-8 text-base text-white/70 sm:text-lg">
          Chega de aula interminável, live que não muda resultado e PDF que parece livro.
          <br />
          O MedHelpSpace Revalida não vende aula. Entrega autonomia, direção e revisão inteligente.
        </p>
        <Link
          href="/loja"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-bold text-brand shadow-xl transition-all hover:bg-white/90 hover:-translate-y-0.5 active:scale-95"
        >
          Escolha sua turma e comece agora
          <span aria-hidden>→</span>
        </Link>
        <p className="mt-4 text-xs text-white/50">
          Acesso imediato · Garantia incondicional de 7 dias · Revalida 2027.1 e 2027.2
        </p>
      </div>
    </section>
  );
}
