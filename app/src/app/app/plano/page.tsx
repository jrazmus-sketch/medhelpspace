import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getDerivedPlanForUser } from "@/lib/study-plan/fetch";
import { PlanoClient } from "./plano-client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

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

  const [plan, prefsRes, specialtiesRes] = await Promise.all([
    getDerivedPlanForUser(user.id),
    admin
      .from("study_plans")
      .select("intensity, focus_specialty_id, email_weekly_summary, email_daily_plan, paused_until")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin.from("specialties").select("id, name, slug").order("display_order"),
  ]);

  const prefs = prefsRes.data ?? {
    intensity: "padrao",
    focus_specialty_id: null,
    email_weekly_summary: true,
    email_daily_plan: false,
    paused_until: null,
  };

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
        <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 32 }}>
          {plan.daysToExam} dias para a prova · Fase: {phaseLabel(plan.phase)}
        </p>
      )}

      <PlanoClient
        plan={plan}
        prefs={{
          intensity: prefs.intensity as "leve" | "padrao" | "intenso",
          focus_specialty_id: prefs.focus_specialty_id,
          email_weekly_summary: prefs.email_weekly_summary,
          email_daily_plan: prefs.email_daily_plan,
          paused_until: prefs.paused_until,
        }}
        specialties={(specialtiesRes.data ?? []) as { id: number; name: string; slug: string }[]}
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
