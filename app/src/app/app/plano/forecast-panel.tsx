"use client";

import { useState } from "react";
import { CalendarCheck, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import type { PlanForecast, ForecastHint } from "@/lib/study-plan/derive";

/**
 * "Previsão até a prova" (Karina 2026-11-17): how many of the topics still to
 * study the schedule reaches before the exam, which ones it does not, what the
 * student could change to widen the coverage. (The "what is counted" footer was removed at Karina's request,
 * 2026-11-19 — the counting rules themselves are unchanged.)
 *
 * Wording is hers: topics are "previstos" / "não previstos até a prova" (since 2026-11-19 "até a abertura do
 * MedHelp 60D", the regular course's deadline) — never
 * described as left out, because the forecast is recalculated every day (a
 * test refuses the old phrasing in this file).
 */

/** Karina's text for the transition to the MedHelp 60D (2026-11-19, 13h27 EST) — verbatim, tested. */
export const D60_TRANSITION = [
  "Esta previsão mostra quantos temas do curso regular têm conclusão prevista até a abertura do MedHelp 60D, considerando sua disponibilidade e os conteúdos selecionados.",
  "O curso regular reúne os recursos disponíveis na plataforma antes da abertura do MedHelp 60D. Esses recursos continuam acessíveis durante o MedHelp 60D.",
  "Quando o MedHelp 60D abrir, 60 dias antes da prova, o Meu Plano continuará acompanhando sua preparação: a programação passará a seguir o cronograma do MedHelp 60D.",
  "Seu histórico permanece salvo. As atividades do curso regular que você fizer por escolha própria continuarão sendo contabilizadas no “Registro do curso regular”. As atividades marcadas no checklist do 60D aparecerão no “Registro do MedHelp 60D”. Você poderá acompanhar os dois registros no Meu Plano.",
];

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

/** "cerca de": from 3 hours up, whole hours are enough (38 h 51 min → 39 h). */
function approxHours(minutes: number): string {
  return minutes >= 180 ? `${Math.round(minutes / 60)} h` : hours(minutes);
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

  // The deadline of the regular course (Karina 2026-11-19): the plan schedules it up to the MedHelp 60D opening, and
  // the screen says so in every sentence that names a deadline.
  const ate = forecast.endsAtD60 ? "até a abertura do MedHelp 60D" : "até a prova";

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
        {forecast.endsAtD60 ? "Previsão do curso regular" : "Previsão até a prova"}
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
                Previstos {ate}: {expectedTopics} de {pendingTopics} {pendingTopics === 1 ? "tema pendente" : "temas pendentes"}
              </p>
            )}
            {!nothingLeft && (
              <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
                {allFit
                  ? dateConfirmed && forecast.finishDay
                    ? `No seu ritmo atual, tudo o que falta cabe ${ate} — o último tema termina por volta de ${formatDay(forecast.finishDay)}.`
                    : `No seu ritmo atual, tudo o que falta cabe ${ate}.`
                  : `Com a disponibilidade atual, nem todos os temas pendentes têm conclusão integral prevista ${ate}. Os de maior incidência vêm primeiro.`}
              </p>
            )}
          </div>
        </div>

        {/* The transition to the MedHelp 60D, explained where the forecast is read — Karina's text verbatim
            (2026-11-19, 13h27 EST): the plan does not stop when the 60D opens, its programme follows the 60D
            schedule, and both records stay on Meu Plano. */}
        {forecast.endsAtD60 && (
          <div
            style={{
              margin: "12px 0 0", padding: "10px 12px", fontSize: 13, lineHeight: 1.5,
              background: "color-mix(in srgb, var(--brand) 8%, transparent)", borderRadius: "var(--radius-sm)",
              display: "flex", flexDirection: "column", gap: 8,
            }}
          >
            {D60_TRANSITION.map((para) => (
              <p key={para} style={{ margin: 0 }}>{para}</p>
            ))}
          </div>
        )}

        {/* Three separate facts, each on its own line (Karina 2026-11-18): topics
            concluded in full, topics the plan only advances in, and how much of the
            pending study time fits — the hours belong to the whole plan, never to
            the partially advanced topics. */}
        {!nothingLeft && (
          <dl
            style={{
              margin: "14px 0 0", padding: "12px 14px",
              background: "var(--background)", border: "1px solid var(--surface-2)", borderRadius: "var(--radius-sm)",
              display: "flex", flexDirection: "column", gap: 10, fontSize: 13, lineHeight: 1.5,
            }}
          >
            <div>
              <dt style={{ color: "var(--muted-foreground)" }}>Temas com conclusão integral prevista</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                {expectedTopics} {expectedTopics === 1 ? "tema" : "temas"}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--muted-foreground)" }}>Temas com avanço parcial previsto</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                {forecast.partialTopics === 0
                  ? "Nenhum"
                  : `${forecast.partialTopics} ${forecast.partialTopics === 1 ? "tema" : "temas"}`}
              </dd>
            </div>
            <div>
              <dt style={{ color: "var(--muted-foreground)" }}>Tempo de materiais pendentes que cabe {ate}</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                {allFit
                  ? `Cerca de ${approxHours(forecast.pendingMinutes)} — tudo o que está pendente`
                  : `Cerca de ${approxHours(forecast.scheduledMinutes)} de ${approxHours(forecast.pendingMinutes)}, somando todos os temas`}
              </dd>
            </div>
          </dl>
        )}

        {!nothingLeft && (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`Temas previstos ${ate}`}
            style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", marginTop: 14, overflow: "hidden" }}
          >
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--brand)" }} />
          </div>
        )}

        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 10, lineHeight: 1.5 }}>
          {dateConfirmed
            ? `${forecast.studyDaysLeft} ${forecast.studyDaysLeft === 1 ? "dia de estudo" : "dias de estudo"} até ${forecast.endsAtD60 ? "o início do MedHelp 60D" : "a prova"} · `
            : ""}
          {hours(forecast.minutesPerStudyDay)} por dia de estudo
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
              {open ? "Ocultar" : "Ver"} temas sem conclusão integral prevista ({notExpected.length})
              {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {open && (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  Temas não previstos {ate} com a disponibilidade atual, por ordem de prioridade.
                  Eles continuam disponíveis para estudo livre.
                </p>
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

      </div>
    </section>
  );
}
