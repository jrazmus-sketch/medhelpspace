import { Lock } from "lucide-react";

/**
 * "Ainda não liberado" for a MedHelp 60D section visited before the module opens.
 * Shared by every 60D section page (Simulados 100Q, MemoreCards) so an early visitor
 * always gets the same countdown rather than an empty page.
 */
export function Medhelp60Locked({
  sectionName,
  daysUntilUnlock,
}: {
  /** Plural subject of the sentence, e.g. "Os Simulados 100Q". */
  sectionName: string;
  daysUntilUnlock: number | null;
}) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-[var(--radius)] px-6 py-14 text-center"
      style={{ background: "var(--surface-1)", boxShadow: "inset 0 0 0 1px var(--surface-2)" }}
    >
      <span
        aria-hidden="true"
        className="flex items-center justify-center rounded-full"
        style={{ width: 56, height: 56, background: "var(--surface-2)", color: "var(--muted-foreground)" }}
      >
        <Lock size={26} strokeWidth={1.8} />
      </span>
      <h2 className="text-lg font-semibold text-foreground">Ainda não liberado</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {daysUntilUnlock != null && daysUntilUnlock > 0 ? (
          <>
            {sectionName} abrem nos últimos 60 dias antes da sua prova. Faltam{" "}
            <strong className="font-semibold text-foreground tabular-nums">
              {daysUntilUnlock.toLocaleString("pt-BR")}
            </strong>{" "}
            {daysUntilUnlock === 1 ? "dia" : "dias"} para a liberação.
          </>
        ) : (
          <>{sectionName} abrem automaticamente nos últimos 60 dias antes da sua prova.</>
        )}
      </p>
    </div>
  );
}
