import { CalendarClock } from "lucide-react";

// The gap between two MedHelp 60D cycles for a launch-condition student: their
// first turma closed, they were moved onto the next one, and its 60D has not
// opened yet. Karina (2026-09-21): make it clear that everything else is still
// available and when the next 60D opens. Fed by get60dAccess().nextCycle.
//
// `panel` replaces the generic "Ainda não liberado" block on the 60D pages;
// `banner` is the one-line version for the dashboard.
export function Medhelp60NextCycle({
  cohortName,
  unlockDateLabel,
  variant = "panel",
}: {
  cohortName: string;
  unlockDateLabel: string | null;
  variant?: "panel" | "banner";
}) {
  const when = unlockDateLabel ? (
    <>
      será liberado em{" "}
      <strong className="font-semibold text-foreground tabular-nums">{unlockDateLabel}</strong>
    </>
  ) : (
    <>será liberado automaticamente nos 60 dias antes da prova</>
  );

  if (variant === "banner") {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-[var(--radius)] px-4 py-3.5"
        style={{ background: "var(--surface-1)", boxShadow: "inset 0 0 0 1px var(--surface-2)" }}
      >
        <CalendarClock
          aria-hidden="true"
          size={20}
          strokeWidth={1.8}
          className="mt-0.5 shrink-0"
          style={{ color: "var(--brand)" }}
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Sua preparação continua para o {cohortName}.</span>{" "}
          Todo o restante do conteúdo segue disponível. O próximo MedHelp 60D {when}.
        </p>
      </div>
    );
  }

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
          background: "color-mix(in srgb, var(--brand) 12%, transparent)",
          color: "var(--brand)",
        }}
      >
        <CalendarClock size={26} strokeWidth={1.8} />
      </span>
      <h2 className="text-lg font-semibold text-foreground">Próximo ciclo do MedHelp 60D</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Sua preparação continua para o {cohortName}, e todo o restante do conteúdo segue
        disponível normalmente. O próximo MedHelp 60D {when}.
      </p>
    </div>
  );
}
