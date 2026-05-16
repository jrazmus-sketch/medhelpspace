import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import Link from "next/link";
import { Lock, Clock, ArrowRight, BookOpen } from "lucide-react";

export const metadata = { title: "Acesso Encerrado — MedHelpSpace" };

const NEXT_COHORT_SLUG = "revalida-2027-1";
const NEXT_COHORT_NAME = "Revalida 2027.1";

export default async function AcessoEncerradoPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const isModuleLocked = motivo === "modulo-bloqueado";

  let displayName = "Médico";
  let expiredCohortName: string | null = null;
  let expiryDate: string | null = null;

  if (!USE_MOCK_DATA) {
    try {
      const supabase = await createClient();
      const admin = createAdminClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await admin
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .single();
        displayName = (profile?.display_name as string | null)?.split(" ")[0] ?? "Médico";

        const { data: memberships } = await admin
          .from("user_cohort_memberships")
          .select("cohort:cohorts(name, membership_ends_at)")
          .eq("user_id", user.id);

        // Find most recent cohort
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lastMembership = (memberships as any[])?.[memberships?.length ? memberships.length - 1 : 0];
        if (lastMembership?.cohort) {
          expiredCohortName = lastMembership.cohort.name ?? null;
          const ends = lastMembership.cohort.membership_ends_at;
          if (ends) {
            expiryDate = new Date(ends).toLocaleDateString("pt-BR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            });
          }
        }
      }
    } catch {
      // Non-critical — show generic message
    }
  }

  if (isModuleLocked) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="mx-auto max-w-md text-center">
          <div
            style={{
              width: 64, height: 64, borderRadius: "50%",
              background: "color-mix(in srgb, var(--brand) 12%, transparent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <Clock size={28} style={{ color: "var(--brand)" }} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.025em", marginBottom: 12 }}>
            MedHelp 60D ainda não disponível
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted-foreground)", marginBottom: 32 }}>
            Este módulo só será liberado automaticamente nos últimos 60 dias antes da sua prova.
            Quando a data chegar, você receberá uma notificação.
          </p>
          <Link
            href="/app"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "var(--brand)", color: "var(--brand-fg)",
              borderRadius: "var(--radius)", padding: "12px 24px",
              fontWeight: 600, fontSize: 15, textDecoration: "none",
            }}
          >
            <BookOpen size={16} />
            Continuar estudando
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="mx-auto max-w-md">
        <div
          style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "color-mix(in srgb, #ef4444 10%, transparent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 24px",
          }}
        >
          <Lock size={28} style={{ color: "#ef4444" }} />
        </div>

        <h1
          style={{
            fontSize: 24, fontWeight: 700, letterSpacing: "-.025em",
            marginBottom: 12, textAlign: "center",
          }}
        >
          Acesso encerrado{displayName !== "Médico" ? `, ${displayName}` : ""}
        </h1>

        <p
          style={{
            fontSize: 15, lineHeight: 1.6, color: "var(--muted-foreground)",
            marginBottom: 8, textAlign: "center",
          }}
        >
          {expiredCohortName
            ? `Seu acesso ao ${expiredCohortName} foi encerrado${expiryDate ? ` em ${expiryDate}` : ""}.`
            : "Seu acesso à plataforma foi encerrado."}
        </p>
        <p
          style={{
            fontSize: 15, lineHeight: 1.6, color: "var(--muted-foreground)",
            marginBottom: 32, textAlign: "center",
          }}
        >
          Para continuar estudando, adquira acesso à próxima turma.
        </p>

        <div
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--surface-2)",
            borderRadius: "var(--radius)",
            padding: "24px",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 8 }}>
            Próxima turma disponível
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 4 }}>
            {NEXT_COHORT_NAME}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 20 }}>
            Acesso completo a todo o conteúdo MedHelpSpace
          </div>
          <Link
            href={`/checkout?cohort=${NEXT_COHORT_SLUG}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "var(--brand)", color: "var(--brand-fg)",
              borderRadius: "var(--radius)", padding: "13px 24px",
              fontWeight: 600, fontSize: 15, textDecoration: "none",
              width: "100%",
            }}
          >
            Renovar acesso
            <ArrowRight size={16} />
          </Link>
        </div>

        <div style={{ textAlign: "center" }}>
          <Link
            href="/app"
            style={{ fontSize: 14, color: "var(--muted-foreground)", textDecoration: "none" }}
            className="hover:text-foreground transition-colors"
          >
            ← Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
