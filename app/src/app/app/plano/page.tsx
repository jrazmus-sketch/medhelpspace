import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveMembership } from "@/lib/membership-gate";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getDerivedPlanForUser, getStudyPlanPrefs, getStudyPlanPauses } from "@/lib/study-plan/fetch";
import { PlanoClient } from "./plano-client";
import { RoutineSummary } from "./routine-summary";
import { Coachmark } from "@/components/onboarding/coachmark";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";
import { getAuthUser } from "@/lib/viewer";
import { loadPlanSettings } from "@/lib/study-plan/settings-server";
import type { PaceOptions } from "./pace-editor";

/** "Adiantar": the extra minutes a student may add to a finished day (?adiantar=30). */
const EXTRA_STEPS = [30, 60, 90, 120];

export const metadata = { title: "Meu Plano de Estudos — MedHelpSpace" };

export default async function PlanoPage({
  searchParams,
}: {
  searchParams: Promise<{ adiantar?: string }>;
}) {
  await requireActiveMembership();
  const { adiantar } = await searchParams;
  const extraMinutes = EXTRA_STEPS.includes(Number(adiantar)) ? Number(adiantar) : 0;

  if (USE_MOCK_DATA) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-20">
        <h1 className="text-2xl font-bold mb-4">Meu Plano de Estudos</h1>
        <p className="text-muted-foreground">Modo demonstração — conecte ao Supabase para ver seu plano personalizado.</p>
      </div>
    );
  }

  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();

  const [plan, { prefs, welcomedAt }, pauses, specialtiesRes, membershipRes, settings] = await Promise.all([
    getDerivedPlanForUser(user.id, { extraMinutesToday: extraMinutes }),
    getStudyPlanPrefs(user.id),
    getStudyPlanPauses(user.id),
    admin.from("specialties").select("id, name, slug").order("display_order"),
    admin
      .from("user_cohort_memberships")
      .select("cohort:cohorts(name, test_date, date_confirmed)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle(),
    loadPlanSettings(admin),
  ]);

  // What each "Ritmo de estudo" choice means in practice (questions per hour).
  const paceOptions: PaceOptions = {
    slow: Math.round(60 / (settings.minutesPerQuestion * settings.paceSlowFactor)),
    standard: Math.round(60 / settings.minutesPerQuestion),
    fast: Math.round(60 / (settings.minutesPerQuestion * settings.paceFastFactor)),
    adaptiveEnabled: settings.adaptivePaceEnabled,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cohort = (membershipRes.data as any)?.cohort as
    | { name: string; test_date: string | null; date_confirmed: boolean }
    | null;
  // Don't show the exam date/countdown until the exam board confirms it — the
  // plan itself still paces off the internal guess (see derivePlan), this only
  // gates what's rendered.
  const dateConfirmed = cohort?.date_confirmed ?? false;
  const examDate = dateConfirmed ? cohort?.test_date ?? null : null;
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

      <h1 style={{ fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 700, letterSpacing: "-.03em", marginBottom: 12 }}>
        Meu Plano de Estudos
      </h1>
      {/* The routine and the exam date the calculations use (Karina 2026-11-18). The
          phase name is no longer shown to the student — the planning rules are unchanged. */}
      {plan && (
        <RoutineSummary
          routine={plan.routine}
          examDate={plan.examDate}
          examConfirmed={dateConfirmed}
          daysToExam={plan.daysToExam}
        />
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
        // The per-day trace is for checks and reports — never sent to the browser.
        plan={plan ? { ...plan, scheduleDays: [] } : plan}
        prefs={prefs}
        specialties={(specialtiesRes.data ?? []) as { id: number; name: string; slug: string }[]}
        pauses={pauses}
        welcomedAt={welcomedAt}
        examDate={examDate}
        examDateLabel={examDateLabel}
        cohortName={cohort?.name ?? null}
        dateConfirmed={dateConfirmed}
        paceOptions={paceOptions}
        extraMinutes={extraMinutes}
        nextExtraMinutes={EXTRA_STEPS.find((m) => m > extraMinutes) ?? null}
      />
    </div>
  );
}
