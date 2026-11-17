"use client";

import { useState } from "react";
import { CalendarCheck, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import type { PlanForecast, ContentType, ForecastHint } from "@/lib/study-plan/derive";

/**
 * "Previsão até a prova" (Karina 2026-11-17): how many of the topics still to
 * study the schedule reaches before the exam, which ones it does not, what the
 * student could change to widen the coverage, and what is counted.
 *
 * Wording is hers: topics are "previstos" / "não previstos até a prova" — never
 * described as left out, because the forecast is recalculated every day (a
 * test refuses the old phrasing in this file).
 */

const TYPE_LABEL: Partial<Record<ContentType, string>> = {
  quiz: "Questões",
  revalida_up: "Revalida Up",
  flashcards: "Flashcards",
  audio: "MedVoice",
};

function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function formatDay(dayKey: string): string {
  return new Date(dayKey + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

/** Minutes → "X h" / "X h Y min" / "Y min". */
function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function hintText(h: ForecastHint, pending: number): string {
  const reach = h.coversAll
    ? "todos os temas ficam com conclusão prevista"
    : `${h.expectedTopics} de ${pending} temas ficam com conclusão prevista`;
  if (h.kind === "minutes") return `Com mais ${h.extraMinutesPerDay} min por dia de estudo, ${reach}.`;
  const day = h.dayName === "sábado" || h.dayName === "domingo" ? `aos ${h.dayName}s` : `às ${h.dayName}s`;
  return `Estudando também ${day}, ${reach}.`;
}

export function ForecastPanel({
  forecast,
  dateConfirmed,
}: {
  forecast: PlanForecast;
  /** The exam date is shown to the student only once the board confirms it. */
  dateConfirmed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { pendingTopics, expectedTopics, notExpected, completedTopics } = forecast;
  const allFit = notExpected.length === 0;
  const nothingLeft = pendingTopics === 0;
  const pct = pendingTopics > 0 ? Math.round((expectedTopics / pendingTopics) * 100) : 100;

  const counted = forecast.scope.countedTypes.map((t) => TYPE_LABEL[t]).filter((s): s is string => Boolean(s));
  const hasAudio = forecast.scope.countedTypes.includes("audio");

  // Group the not-expected topics by specialty, keeping the priority order inside each.
  const bySpecialty = new Map<string, typeof notExpected>();
  for (const t of notExpected) {
    const list = bySpecialty.get(t.specialtyName);
    if (list) list.push(t);
    else bySpecialty.set(t.specialtyName, [t]);
  }

  return (
    <section aria-labelledby="previsao-titulo">
      <h2
        id="previsao-titulo"
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 12 }}
      >
        Previsão até a prova
      </h2>

      <div style={{ padding: "18px 18px 16px", background: "var(--surface-1)", border: "1px solid var(--surface-2)", borderRadius: "var(--radius)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <CalendarCheck size={20} style={{ color: "var(--brand-text, var(--brand))", flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {nothingLeft ? (
              <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
                Você concluiu os materiais selecionados de todos os temas.
              </p>
            ) : (
              <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
                Previstos até a prova: {expectedTopics} de {pendingTopics} {pendingTopics === 1 ? "tema pendente" : "temas pendentes"}
              </p>
            )}
            {!nothingLeft && (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
                {allFit
                  ? dateConfirmed && forecast.finishDay
                    ? `No seu ritmo atual, tudo o que falta cabe até a prova — o último tema termina por volta de ${formatDay(forecast.finishDay)}.`
                    : "No seu ritmo atual, tudo o que falta cabe até a prova."
                  : expectedTopics === 0
                    ? "Com a disponibilidade atual, nenhum tema tem conclusão integral prevista até a prova."
                    : `${notExpected.length} ${notExpected.length === 1 ? "tema não tem" : "temas não têm"} conclusão integral prevista até a prova com a disponibilidade atual. Os de maior incidência vêm primeiro.`}
              </p>
            )}
            {/* "Not concluded in full" is not "not studied": say how far the plan gets. */}
            {!nothingLeft && !allFit && forecast.partialTopics > 0 && (
              <p style={{ fontSize: 13, color: "var(--foreground)", marginTop: 6, lineHeight: 1.5 }}>
                O plano avança parcialmente em {forecast.partialTopics} {forecast.partialTopics === 1 ? "tema" : "temas"}:
                {" "}cabem cerca de {hours(forecast.scheduledMinutes)} das {hours(forecast.pendingMinutes)} de materiais pendentes.
              </p>
            )}
          </div>
        </div>

        {!nothingLeft && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Temas previstos até a prova"
            style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", marginTop: 14, overflow: "hidden" }}
          >
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--brand)" }} />
          </div>
        )}

        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 10, lineHeight: 1.5 }}>
          {dateConfirmed
            ? `${forecast.studyDaysLeft} ${forecast.studyDaysLeft === 1 ? "dia de estudo" : "dias de estudo"} até a prova · `
            : ""}
          {forecast.minutesPerStudyDay} min por dia de estudo
          {completedTopics > 0 ? ` · ${completedTopics} ${completedTopics === 1 ? "tema já concluído" : "temas já concluídos"}` : ""}
          {forecast.inReviewTopics > 0
            ? ` · ${forecast.inReviewTopics} ${forecast.inReviewTopics === 1 ? "tema com acerto abaixo de 70% segue" : "temas com acerto abaixo de 70% seguem"} na Revisão`
            : ""}
          {!dateConfirmed ? " · com base na data estimada da prova, ainda não confirmada" : ""}
        </p>

        {/* What would widen the coverage */}
        {forecast.hints.length > 0 && (
          <div
            style={{
              marginTop: 14, padding: "12px 14px",
              background: "color-mix(in srgb, var(--brand) 8%, transparent)",
              borderRadius: "var(--radius-sm)",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}
          >
            <Lightbulb size={16} style={{ color: "var(--brand-text, var(--brand))", flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Para ampliar a cobertura</p>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.55, color: "var(--foreground)" }}>
                {forecast.hints.map((h, i) => (
                  <li key={i}>{hintText(h, pendingTopics)}</li>
                ))}
              </ul>
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
                Ajuste em Disponibilidade, logo abaixo.
              </p>
            </div>
          </div>
        )}

        {/* The topics not expected before the exam */}
        {notExpected.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="min-h-11 hover:underline"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "var(--brand-text, var(--brand))", textAlign: "left",
              }}
            >
              {open ? "Ocultar" : "Ver"} os {notExpected.length} temas não previstos até a prova
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {open && (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 12 }}>
                {[...bySpecialty.entries()].map(([spec, topics]) => (
                  <div key={spec}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 4 }}>{spec}</p>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6 }}>
                      {topics.map((t) => (
                        <li key={t.id}>
                          {t.name}
                          {t.tier ? <span style={{ color: "var(--muted-foreground)" }}> · prioridade {t.tier}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* What is counted */}
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--surface-2)", lineHeight: 1.55 }}>
          Entram no cálculo: {counted.length > 0 ? joinPt(counted) : "nenhum material selecionado"}
          {forecast.scope.excludedSpecialties > 0 ? ", das especialidades que você manteve no plano" : ""}
          .{hasAudio ? " O MedVoice é programado só a mais de 60 dias da prova." : ""} A Revisão e, nos últimos 60
          dias, os mini simulados ocupam parte do tempo de estudo. Resumos Narrativos e os materiais do
          MedHelp 60D (Fórmula MedHelp, MemoreCards e Simulados 100Q) não estão incluídos. A previsão é
          recalculada todos os dias a partir do que você já estudou.
        </p>
      </div>
    </section>
  );
}
