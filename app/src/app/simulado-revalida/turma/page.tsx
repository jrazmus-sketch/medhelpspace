import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveCohortOptions,
  SIM_SESSION_COOKIE,
} from "@/lib/magnet/simulado";
import { SIMULADO_PATH, UNDECIDED_COHORT } from "@/lib/magnet/links";
import { TurmaPickerForm } from "@/components/magnet/turma-picker-form";

// "Para qual prova você está estudando?" — where the undecided track and the
// post-exam rollover notice land.
//
// The write already happened in /api/leads/turma (a page cannot set cookies or
// mutate during render); this page reads the session cookie that route handed
// over, confirms what was recorded, and lets the lead correct it.
//
// Per-lead → noindex, never cached.

export const metadata: Metadata = {
  title: "Sua próxima prova — MedHelpSpace",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TurmaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const token = (await cookies()).get(SIM_SESSION_COOKIE)?.value;

  let current: string | null = null;
  let firstName: string | null = null;
  let found = false;

  if (token) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("leads")
      .select("target_cohort, first_name")
      .eq("result_token", token)
      .maybeSingle();
    if (data) {
      found = true;
      current = (data.target_cohort as string | null) ?? null;
      firstName = (data.first_name as string | null) ?? null;
    }
  }

  const options = await getActiveCohortOptions();
  const currentLabel =
    current === UNDECIDED_COHORT
      ? "Ainda não decidi"
      : options.find((o) => o.slug === current)?.label ?? null;

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-5 py-14 text-foreground">
      <div className="w-full max-w-md">
        {/* Same eyebrow idiom as the rest of the funnel (simulado-gate, the
            landing sections, the report) so this page reads as part of it. */}
        <p className="font-mono text-[11px] uppercase tracking-wider text-brand">
          Simulado Revalida
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {firstName ? `${firstName}, para qual prova você está estudando?` : "Para qual prova você está estudando?"}
        </h1>

        {!found ? (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Não conseguimos identificar o seu cadastro por aqui. Abra novamente o
              link que enviamos por e-mail — ele leva direto ao seu simulado.
            </p>
            <Link
              href={SIMULADO_PATH}
              className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
            >
              Ir para o simulado →
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              {ok && currentLabel
                ? `Anotado: ${currentLabel}. É com base nessa data que a gente decide o que te mandar — e quando.`
                : "Não é uma pergunta de compra. É o que define o ritmo do que a gente te manda daqui pra frente."}
            </p>

            <TurmaPickerForm
              options={options}
              current={current}
              undecidedSlug={UNDECIDED_COHORT}
            />

            <Link
              href={`${SIMULADO_PATH}/prova`}
              className="mt-2 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
            >
              Voltar ao meu simulado →
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
