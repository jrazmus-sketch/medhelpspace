"use client";

import { Pencil } from "lucide-react";
import type { PlanRoutine } from "@/lib/study-plan/derive";
import { formatDuration, studyDayNames } from "@/lib/study-plan/availability";

/** Fired by "Editar meu plano"; the page opens Disponibilidade and scrolls to it. */
export const EDIT_PLAN_EVENT = "plano:editar";

function formatDay(dayKey: string): string {
  return new Date(dayKey + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The compact summary under the page title (Karina 2026-11-18): the routine and
 * the exam date the calculations are ACTUALLY using — both come from the derived
 * plan, never from a separate reading of the settings — and the way to edit them.
 */
export function RoutineSummary({
  routine,
  examDate,
  examConfirmed,
  daysToExam,
}: {
  routine: PlanRoutine;
  /** The date the plan counts towards (the turma's date). null: none registered. */
  examDate: string | null;
  /** false → the board has not confirmed it yet: shown as an estimate. */
  examConfirmed: boolean;
  daysToExam: number | null;
}) {
  const examPassed = examDate != null && daysToExam === 0;
  return (
    <div
      style={{
        padding: "14px 16px",
        marginBottom: 16,
        background: "var(--surface-1)",
        border: "1px solid var(--surface-2)",
        borderRadius: "var(--radius)",
        fontSize: 14,
        lineHeight: 1.55,
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>Sua rotina:</strong>{" "}
        {routine.studyDays === 0
          ? "nenhum dia de estudo selecionado"
          : `${formatDuration(routine.dailyMinutes)} por dia de estudo · ${studyDayNames(routine.studyDayMask)}`}
      </p>
      {routine.reducedUntil && (
        <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted-foreground)" }}>
          Tempo reduzido até {formatDay(routine.reducedUntil)}. Depois, {formatDuration(routine.baseDailyMinutes)} por dia de estudo.
        </p>
      )}
      <p style={{ margin: "2px 0 0" }}>
        <strong>Prova considerada:</strong>{" "}
        {examDate == null
          ? "sem data registrada para a sua turma"
          : examPassed
            ? `${formatDay(examDate)} (data já passou)`
            : examConfirmed
              ? `${formatDay(examDate)}${daysToExam != null ? ` (em ${daysToExam} ${daysToExam === 1 ? "dia" : "dias"})` : ""}`
              : `${formatDay(examDate)} (data estimada, ainda não confirmada)`}
      </p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EDIT_PLAN_EVENT))}
        className="min-h-11 hover:underline"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4, padding: 0,
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: 14, fontWeight: 600, color: "var(--brand-text, var(--brand))",
        }}
      >
        <Pencil size={14} />
        Editar meu plano
      </button>
    </div>
  );
}
