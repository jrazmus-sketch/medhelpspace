import { Hourglass, Lock } from "lucide-react";
import { requireActiveMembership } from "@/lib/membership-gate";
import { get60dAccess } from "@/lib/medhelp-60d";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { VoltarButton } from "@/components/layout/voltar-button";
import { Medhelp60Accordion } from "@/components/content/medhelp-60d-accordion";

export const metadata = { title: "MedHelp 60D" };

export default async function Medhelp60dPage() {
  await requireActiveMembership();
  const { unlocked, daysUntilUnlock } = await get60dAccess();

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }} className="px-[10px] sm:px-8 pt-7 pb-16">
      <div className="mb-2">
        <VoltarButton fallbackHref="/app" />
      </div>
      <Breadcrumbs className="mb-6" />

      {/* ── HERO ── */}
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className="flex items-center justify-center rounded-[var(--radius)]"
            style={{
              width: 44,
              height: 44,
              background: "color-mix(in srgb, var(--brand) 12%, transparent)",
              color: "var(--brand)",
            }}
          >
            <Hourglass size={24} strokeWidth={1.8} />
          </span>
          <h1 className="text-3xl font-bold leading-tight">MedHelp 60D</h1>
        </div>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Revisão intensiva para os últimos 60 dias antes da prova.
        </p>
      </header>

      {unlocked ? (
        <Medhelp60Accordion />
      ) : (
        <LockedNotice daysUntilUnlock={daysUntilUnlock} />
      )}
    </div>
  );
}

function LockedNotice({ daysUntilUnlock }: { daysUntilUnlock: number | null }) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-[var(--radius)] px-6 py-14 text-center"
      style={{ background: "var(--surface-1)", boxShadow: "inset 0 0 0 1px var(--surface-2)" }}
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{
          width: 56,
          height: 56,
          background: "var(--surface-2)",
          color: "var(--muted-foreground)",
        }}
      >
        <Lock size={26} strokeWidth={1.8} />
      </span>
      <h2 className="text-lg font-semibold text-foreground">Ainda não liberado</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {daysUntilUnlock != null && daysUntilUnlock > 0 ? (
          <>
            O MedHelp 60D abre nos últimos 60 dias antes da sua prova. Faltam{" "}
            <strong className="font-semibold text-foreground tabular-nums">
              {daysUntilUnlock.toLocaleString("pt-BR")}
            </strong>{" "}
            {daysUntilUnlock === 1 ? "dia" : "dias"} para a liberação.
          </>
        ) : (
          <>
            O MedHelp 60D abre automaticamente nos últimos 60 dias antes da sua prova. Volte mais
            perto da data.
          </>
        )}
      </p>
    </div>
  );
}
