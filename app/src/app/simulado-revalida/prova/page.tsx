import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSimuladoExamQuestions,
  SIM_SESSION_COOKIE,
  SIMULADO_MIN_ANSWERS,
  type SimuladoProgress,
} from "@/lib/magnet/simulado";
import { SIMULADO_PATH } from "@/lib/magnet/links";
import { SimuladoExam } from "@/components/magnet/simulado-exam";

// The exam itself. Session comes from the httpOnly cookie set either by the
// immediate-start form or by the emailed magic link (/acesso), so the result_token
// is never in the URL here and never reaches client JS.
//
// Per-candidate and answer-bearing → noindex, never cached.

export const metadata: Metadata = {
  title: "Simulado Revalida — 100 questões inéditas",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  return `${local.slice(0, 1)}${"*".repeat(Math.max(3, local.length - 1))}@${email.slice(at + 1)}`;
}

function NoSession() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 text-center text-foreground">
      <div className="max-w-md">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-3xl"
        >
          🔗
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Não encontramos o seu simulado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Abra o link que enviamos por e-mail para retomar de onde parou — ou comece um novo em
          poucos segundos.
        </p>
        <Link
          href={SIMULADO_PATH}
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-fg transition-opacity hover:opacity-90"
        >
          Começar meu simulado grátis →
        </Link>
      </div>
    </div>
  );
}

export default async function SimuladoProvaPage() {
  const token = (await cookies()).get(SIM_SESSION_COOKIE)?.value;
  if (!token) return <NoSession />;

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select(
      "id, email, first_name, sim_progress, sim_flagged, sim_completed_at, sim_started_at, drip_status, sim_email_confirmed_at",
    )
    .eq("result_token", token)
    .maybeSingle();

  if (!lead) return <NoSession />;

  // A submitted exam is over — send them to their result rather than letting them
  // back into the questions.
  if (lead.sim_completed_at) redirect("/simulado-revalida/resultado");

  const questions = await getSimuladoExamQuestions();

  // Drop answers for ids no longer in the set (survives a future set swap).
  const validIds = new Set(questions.map((q) => q.id));
  const stored = (lead.sim_progress as SimuladoProgress | null) ?? {};
  const initialAnswers: SimuladoProgress = {};
  for (const [k, v] of Object.entries(stored)) {
    if (validIds.has(Number(k)) && typeof v?.a === "number") initialAnswers[k] = { a: v.a };
  }
  const initialFlagged = ((lead.sim_flagged as number[] | null) ?? []).filter((id) =>
    validIds.has(id),
  );

  return (
    <SimuladoExam
      questions={questions}
      firstName={(lead.first_name as string | null) ?? null}
      maskedEmail={maskEmail(lead.email as string)}
      // The resume-link email hard-bounced (set by the Resend webhook). This page
      // is the only surface left that can reach them — the drips have already
      // excluded a bounced lead permanently. See simulado-email-check.tsx.
      emailBounced={lead.drip_status === "bounced"}
      emailConfirmed={lead.sim_email_confirmed_at != null}
      initialAnswers={initialAnswers}
      initialFlagged={initialFlagged}
      minAnswers={SIMULADO_MIN_ANSWERS}
      // Returning candidates go straight back to the questions; the instructions
      // screen is only for a first sitting.
      startOnInstructions={!lead.sim_started_at}
    />
  );
}
