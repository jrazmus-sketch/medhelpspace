import { createClient } from "@/lib/supabase/server";
import { requireActiveMembership } from "@/lib/membership-gate";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { getRoadmapForUser } from "@/lib/study-plan/roadmap";
import { RoteiroClient } from "./roteiro-client";
import { Coachmark } from "@/components/onboarding/coachmark";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata = { title: "Roteiro de Estudos — MedHelpSpace" };

export default async function RoteiroPage() {
  await requireActiveMembership();

  if (USE_MOCK_DATA) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-20">
        <h1 className="text-2xl font-bold mb-4">Roteiro de Estudos</h1>
        <p className="text-muted-foreground">Modo demonstração — conecte ao Supabase para ver o roteiro completo.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const roadmap = await getRoadmapForUser(user.id);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 pb-20">
      <Link
        href="/app/plano"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--muted-foreground)", textDecoration: "none", marginBottom: 28 }}
        className="hover:text-foreground transition-colors"
      >
        <ChevronLeft size={16} />
        Voltar ao plano
      </Link>

      <h1 style={{ fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 700, letterSpacing: "-.03em", marginBottom: 4 }}>
        Roteiro de Estudos
      </h1>
      <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 20, lineHeight: 1.5 }}>
        Todos os temas do Revalida, ordenados do mais ao menos cobrado (2020–2025). Priorize de cima para baixo — o seu plano diário já segue esta ordem.
      </p>

      <Coachmark coachKey="roteiro" className="mt-0" />

      <RoteiroClient roadmap={roadmap} />
    </div>
  );
}
