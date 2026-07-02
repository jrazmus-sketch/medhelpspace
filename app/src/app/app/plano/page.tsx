import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getDerivedPlanForUser, getStudyPlanPrefs, getStudyPlanPauses } from "@/lib/study-plan/fetch";
import { PlanoClient } from "./plano-client";
import { Coachmark } from "@/components/onboarding/coachmark";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";

export const metadata = { title: "Meu Plano de Estudos — MedHelpSpace" };

export default async function PlanoPage() {
  await requireActiveMembership();

  if (USE_MOCK_DATA) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-20">
        <h1 className="text-2xl font-bold mb-4">Meu Plano de Estudos</h1>
        <p className="text-muted-foreground">Modo demonstração — conecte ao Supabase para ver seu plano personalizado.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [plan, { prefs, welcomedAt }, pauses, specialtiesRes, membershipRes] = await Promise.all([
    getDerivedPlanForUser(user.id),
    getStudyPlanPrefs(user.id),
    getStudyPlanPauses(user.id),
    admin.from("specialties").select("id, name, slug").order("display_order"),
    admin
      .from("user_cohort_memberships")
      .select("cohort:cohorts(name, test_date)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cohort = (membershipRes.data as any)?.cohort as { name: string; test_date: string | null } | null;
  const examDate = cohort?.test_date ?? null;
  const examDateLabel = examDate
    ? new Date(examDate + "T12:00:00").toLocaleDateString("pt-BR", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-20">
      <Link
        href="/app"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--muted-foreground)", textDecoration: "none", marginBottom: 28 }}
        className="hover:text-foreground transition-colors"
      >
        <ChevronLeft size={16} />
        Voltar ao início
      </Link>

      <h1 style={{ fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 700, letterSpacing: "-.03em", marginBottom: 4 }}>
        Meu Plano de Estudos
      </h1>
      {plan && plan.daysToExam !== null && (
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 16 }}>
          {plan.daysToExam} dias para a prova · Fase: {phaseLabel(plan.phase)}
        </p>
      )}

      <Link
        href="/app/plano/roteiro"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--brand)", textDecoration: "none", marginBottom: 28 }}
        className="hover:underline"
      >
        <ListOrdered size={15} />
        Ver o roteiro completo dos temas
        <ChevronRight size={14} />
      </Link>

      <Coachmark coachKey="plano" className="mt-0" />

      <PlanoClient
        plan={plan}
        prefs={prefs}
        specialties={(specialtiesRes.data ?? []) as { id: number; name: string; slug: string }[]}
        pauses={pauses}
        welcomedAt={welcomedAt}
        examDate={examDate}
        examDateLabel={examDateLabel}
      />
    </div>
  );
}

function phaseLabel(phase: string) {
  switch (phase) {
    case "foundation":      return "Fundação (cobertura ampla + interleaving)";
    case "intensification": return "Intensificação (MedHelp 60D + alta densidade de questões)";
    case "taper":           return "Reta final (revisão e descanso)";
    default:                return phase;
  }
}
