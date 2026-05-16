import Link from "next/link";
import { AnnouncementBar } from "@/components/landing/announcement-bar";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Check, Lock } from "lucide-react";

const CHECKOUT_2026 = "/checkout?cohort=revalida-2026-2";
const CHECKOUT_2027 = "/checkout?cohort=revalida-2027-1";

const INCLUDED = [
  "Estudo por Questões — questões oficiais + simulados comentados",
  "Resumos Narrativos — casos clínicos com raciocínio e conduta",
  "MedVoice — treinamento de decisão em áudios curtos",
  "Fórmula MedHelp — atalhos de prova, macetes e mnemônicos",
  "Audiocards — flashcards em áudio com o que já caiu",
  "Guia de estudos completo",
  "Acesso em celular, tablet e computador",
  "Tema claro e escuro",
  "Atualizações contínuas",
];

const INCLUDED_60D = [
  "Revalida Up — mini-resumos: padrão + decisão treinada",
  "MemoreCards — cards visuais de alta fixação por especialidade",
  "Simulados completos (100 questões) para treinar o dia da prova",
];

export const metadata = {
  title: "Comprar — MedHelpSpace Revalida",
  description:
    "Escolha sua turma e comece agora. Revalida 2026.2 (R$ 3.990) ou 2027.1 (R$ 4.990). Acesso imediato, garantia de 7 dias.",
};

export default function LojaPage() {
  return (
    <div className="min-h-screen bg-background">
      <AnnouncementBar />
      <LandingNav />

      <main className="px-5 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-14 text-center">
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-1.5 text-sm text-foreground/40 transition-colors hover:text-foreground"
            >
              ← Voltar
            </Link>
            <h1
              className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl md:text-5xl"
              style={{ fontFamily: "var(--font-bricolage)" }}
            >
              Comece sua preparação.
            </h1>
            <p className="mt-4 text-base text-foreground/55 sm:text-lg">
              Escolha a turma da sua prova. Acesso imediato ao sistema completo.
            </p>
          </div>

          {/* Cohort cards */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">

            {/* 2026.2 */}
            <div className="flex flex-col rounded-2xl border border-border bg-background shadow-sm transition-shadow hover:shadow-md">
              <div className="border-b border-border px-6 py-5">
                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-foreground/40">
                  Turma
                </div>
                <h2
                  className="text-2xl font-extrabold text-foreground"
                  style={{ fontFamily: "var(--font-bricolage)" }}
                >
                  Revalida 2026.2
                </h2>
              </div>

              <div className="flex flex-1 flex-col gap-6 p-6">
                <div>
                  <div className="text-4xl font-extrabold tracking-tight text-foreground" style={{ fontFamily: "var(--font-bricolage)" }}>
                    R$ 3.990
                  </div>
                  <p className="mt-1 text-sm text-foreground/45">
                    ou parcele em até 12x no cartão
                  </p>
                </div>

                <IncludedList />

                <Link
                  href={CHECKOUT_2026}
                  className="mt-auto block w-full rounded-xl bg-brand py-3.5 text-center text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95"
                >
                  Comprar 2026.2
                </Link>
              </div>
            </div>

            {/* 2027.1 */}
            <div className="flex flex-col rounded-2xl border-2 border-brand bg-background shadow-lg relative">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-brand px-4 py-1 text-xs font-bold text-white shadow">
                  Mais tempo de preparação
                </span>
              </div>

              <div className="border-b border-brand/20 px-6 py-5">
                <div className="mb-1 text-xs font-bold uppercase tracking-widest text-brand/60">
                  Turma
                </div>
                <h2
                  className="text-2xl font-extrabold text-foreground"
                  style={{ fontFamily: "var(--font-bricolage)" }}
                >
                  Revalida 2027.1
                </h2>
              </div>

              <div className="flex flex-1 flex-col gap-6 p-6">
                <div>
                  <div className="text-4xl font-extrabold tracking-tight text-foreground" style={{ fontFamily: "var(--font-bricolage)" }}>
                    R$ 4.990
                  </div>
                  <p className="mt-1 text-sm text-foreground/45">
                    ou parcele em até 12x no cartão
                  </p>
                </div>

                <IncludedList />

                <Link
                  href={CHECKOUT_2027}
                  className="mt-auto block w-full rounded-xl bg-brand py-3.5 text-center text-base font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/85 hover:-translate-y-0.5 active:scale-95"
                >
                  Comprar 2027.1
                </Link>
              </div>
            </div>
          </div>

          {/* Trust signals */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
            <div className="flex items-center gap-2 text-sm text-foreground/50">
              <Check className="h-4 w-4 text-brand" />
              Acesso imediato após confirmação
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground/50">
              <Check className="h-4 w-4 text-brand" />
              Garantia incondicional de 7 dias
            </div>
            <div className="flex items-center gap-2 text-sm text-foreground/50">
              <Lock className="h-4 w-4 text-brand" />
              Pagamento 100% seguro · PagBank
            </div>
          </div>

          {/* 60D note */}
          <div className="mt-12 rounded-2xl border border-brand/20 bg-brand/5 p-6 md:p-8">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">🔓</span>
              <h3
                className="text-lg font-bold text-foreground"
                style={{ fontFamily: "var(--font-bricolage)" }}
              >
                MedHelp 60D — já incluso em ambas as turmas
              </h3>
            </div>
            <p className="mb-4 text-sm text-foreground/60 sm:text-base">
              A fase final do sistema é liberada automaticamente 60 dias antes da sua prova. Você não precisa fazer nada — o acesso abre na hora certa.
            </p>
            <ul className="flex flex-col gap-2">
              {INCLUDED_60D.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-foreground/65">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

function IncludedList() {
  return (
    <ul className="flex flex-col gap-2">
      {INCLUDED.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm text-foreground/65">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          {item}
        </li>
      ))}
      <li className="mt-1 flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm font-medium text-brand">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        MedHelp 60D — liberado 60 dias antes da prova
      </li>
    </ul>
  );
}
