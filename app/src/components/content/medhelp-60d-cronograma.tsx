"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarDays, Check, ChevronDown, ChevronUp, Clock, ExternalLink } from "lucide-react";
import { setD60Check } from "@/actions/medhelp60";
import { d60Duration, d60Position, type D60Cronograma, type D60Item, type D60Week } from "@/lib/medhelp60/cronograma";

/**
 * MedHelp 60D — the schedule, inside the 60D page (Karina 2026-11-17 23h06). A fixed sequence of eight weeks and a
 * final stretch; the student ticks what was done (manual checklist) and sees whether each week's load fits their
 * time. Nothing is removed or reordered when it does not fit — the page says so.
 */

function dayMonth(key: string): string {
  return new Date(key + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
}
function fullDay(key: string): string {
  return new Date(key + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

const KIND_LABEL: Record<D60Item["kind"], string> = {
  formula: "Fórmula MedHelp", memore: "MemoreCards", sim: "Simulado 100Q", "sim-correcao": "Correção",
};

export function Medhelp60Cronograma({
  cronograma, checked, todayKey, weeklyMinutes, dailyMinutes, studyDays, examConfirmed, preview,
}: {
  cronograma: D60Cronograma;
  checked: string[];
  todayKey: string;
  weeklyMinutes: number;
  dailyMinutes: number;
  studyDays: number;
  examConfirmed: boolean;
  preview: boolean;
}) {
  const pos = d60Position(cronograma, todayKey);
  const [done, setDone] = useState<Set<string>>(() => new Set(checked));
  const [open, setOpen] = useState<Set<number>>(() => new Set([pos.week ?? 1]));
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  function toggle(item: D60Item) {
    if (item.pending) return;
    const next = !done.has(item.key);
    setFailed(false);
    setDone((prev) => { const s = new Set(prev); if (next) s.add(item.key); else s.delete(item.key); return s; });
    startTransition(async () => {
      const r = await setD60Check(item.key, next);
      if (!r.ok) {
        setFailed(true);
        setDone((prev) => { const s = new Set(prev); if (next) s.delete(item.key); else s.add(item.key); return s; });
      }
    });
  }

  const all = cronograma.weeks.flatMap((w) => w.items).filter((i) => !i.pending);
  const doneCount = all.filter((i) => done.has(i.key)).length;

  return (
    <section aria-labelledby="cronograma-60d" className="mt-10">
      <div className="flex items-center gap-2">
        <CalendarDays size={20} style={{ color: "var(--brand-text, var(--brand))" }} aria-hidden="true" />
        <h2 id="cronograma-60d" className="text-xl font-bold">Cronograma</h2>
      </div>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground" style={{ lineHeight: 1.6 }}>
        Sequência definida para os 60 dias antes da prova: oito semanas de estudo e a reta final. Os temas seguem a ordem de
        prioridade (os mais cobrados primeiro). Marque cada atividade ao concluir.
      </p>

      <div
        className="mt-4 rounded-[var(--radius)] px-4 py-3 text-sm"
        style={{ background: "var(--surface-1)", boxShadow: "inset 0 0 0 1px var(--surface-2)", lineHeight: 1.6 }}
      >
        <p>
          <strong>Período:</strong> {fullDay(cronograma.startKey)} a {fullDay(cronograma.endKey)}
          {examConfirmed ? "" : " (com base na data estimada da prova, ainda não confirmada)"}
          {preview ? " — prévia da próxima turma" : ""}
        </p>
        <p>
          <strong>Hoje:</strong>{" "}
          {pos.phase === "week" ? `semana ${pos.week} de ${cronograma.weeks.length}`
            : pos.phase === "final" ? "reta final"
            : pos.phase === "before" ? "o período ainda não começou"
            : "período encerrado"}
          {" · "}{doneCount} de {all.length} atividades concluídas
        </p>
        <p>
          <strong>Seu tempo de estudo:</strong>{" "}
          {studyDays === 0
            ? "nenhum dia de estudo selecionado"
            : `${d60Duration(dailyMinutes)} por dia · ${studyDays} ${studyDays === 1 ? "dia" : "dias"} por semana · ${d60Duration(weeklyMinutes)} semanais`}
        </p>
        <Link
          href="/app/plano"
          className="inline-flex min-h-11 items-center font-semibold underline"
          style={{ color: "var(--brand-text, var(--brand))" }}
        >
          Ajustar no Meu Plano
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          Os tempos são estimativas. O MedHelp 60D e o Meu Plano usam a mesma disponibilidade.
        </p>
      </div>

      {failed && (
        <p role="alert" className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
          Não foi possível salvar a marcação. Tente de novo.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {cronograma.weeks.map((w) => (
          <WeekBlock
            key={w.n}
            week={w}
            current={pos.week === w.n}
            open={open.has(w.n)}
            onToggleOpen={() => setOpen((prev) => { const s = new Set(prev); if (s.has(w.n)) s.delete(w.n); else s.add(w.n); return s; })}
            done={done}
            onToggle={toggle}
            weeklyMinutes={weeklyMinutes}
          />
        ))}

        <div
          className="rounded-[var(--radius)] px-4 py-4 text-sm"
          style={{ background: "var(--surface-1)", boxShadow: "inset 0 0 0 1px var(--surface-2)", lineHeight: 1.6 }}
        >
          <p className="font-semibold">
            Reta final · {dayMonth(cronograma.finalStretch.startKey)} a {dayMonth(cronograma.finalStretch.endKey)}
            {pos.phase === "final" ? " · período atual" : ""}
          </p>
          <p className="mt-1 text-muted-foreground">
            Sem conteúdo novo. Use estes {cronograma.finalStretch.days} dias para concluir o que ficou sem marcar nas semanas
            anteriores e para as suas revisões.
          </p>
        </div>
      </div>
    </section>
  );
}

function WeekBlock({
  week, current, open, onToggleOpen, done, onToggle, weeklyMinutes,
}: {
  week: D60Week;
  current: boolean;
  open: boolean;
  onToggleOpen: () => void;
  done: Set<string>;
  onToggle: (item: D60Item) => void;
  weeklyMinutes: number;
}) {
  const available = week.items.filter((i) => !i.pending);
  const doneCount = available.filter((i) => done.has(i.key)).length;
  const pending = week.items.length - available.length;
  // The whole week's load against the student's weekly time: when it does not fit, it is SAID — nothing is removed.
  const over = weeklyMinutes > 0 && week.minutes > weeklyMinutes + 0.5;
  return (
    <div
      className="rounded-[var(--radius)]"
      style={{
        background: "var(--surface-1)",
        boxShadow: current ? "inset 0 0 0 2px var(--brand)" : "inset 0 0 0 1px var(--surface-2)",
      }}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
      >
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">
            Semana {week.n}
            <span className="font-normal text-muted-foreground"> · {dayMonth(week.startKey)} a {dayMonth(week.endKey)}</span>
            {current && (
              <span className="ml-2 text-xs font-semibold" style={{ color: "var(--brand-text, var(--brand))" }}>semana atual</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground" style={{ lineHeight: 1.5 }}>
            {doneCount} de {available.length} concluídas · carga estimada {d60Duration(week.minutes)}
            {pending > 0 ? ` · ${pending} ${pending === 1 ? "material pendente" : "materiais pendentes"}` : ""}
          </div>
        </div>
        {open ? <ChevronUp size={18} className="shrink-0 text-muted-foreground" /> : <ChevronDown size={18} className="shrink-0 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 sm:px-4">
          {over && (
            <p
              role="note"
              className="mb-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm"
              style={{
                background: "color-mix(in srgb, #f59e0b 14%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, #f59e0b 40%, transparent)", lineHeight: 1.55,
              }}
            >
              A carga estimada desta semana ({d60Duration(week.minutes)}) é maior que o seu tempo de estudo semanal
              ({d60Duration(weeklyMinutes)}). Nenhuma atividade foi retirada do cronograma: aumente sua disponibilidade no Meu
              Plano ou escolha o que concluir primeiro.
            </p>
          )}
          <ul className="flex flex-col" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {week.items.map((item) => {
              const isDone = done.has(item.key);
              return (
                <li
                  key={item.key}
                  className="flex items-start gap-3 py-2"
                  style={{ borderTop: "1px solid var(--surface-2)", opacity: item.pending ? 0.75 : 1 }}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={`${isDone ? "Desmarcar" : "Marcar como concluído"}: ${KIND_LABEL[item.kind]} — ${item.title}`}
                    disabled={item.pending}
                    onClick={() => onToggle(item)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center"
                    style={{ background: "transparent", border: "none", cursor: item.pending ? "not-allowed" : "pointer" }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-[6px]"
                      style={{
                        border: isDone ? "2px solid var(--brand)" : "2px solid var(--muted-foreground)",
                        background: isDone ? "var(--brand)" : "transparent",
                        color: "var(--brand-fg)",
                      }}
                    >
                      {isDone && <Check size={16} strokeWidth={3} />}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 py-1">
                    <div
                      className="text-sm font-semibold"
                      style={{ overflowWrap: "anywhere", textDecoration: isDone ? "line-through" : "none" }}
                    >
                      {item.title}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground" style={{ lineHeight: 1.5, overflowWrap: "anywhere" }}>
                      {item.detail}
                      {!item.pending && (
                        <>
                          {" · "}
                          <Clock size={11} className="inline" aria-hidden="true" /> cerca de {d60Duration(item.minutes)}
                        </>
                      )}
                    </div>
                  </div>
                  {item.href && (
                    <Link
                      href={item.href}
                      aria-label={`Abrir ${KIND_LABEL[item.kind]} — ${item.title}`}
                      className="flex h-11 shrink-0 items-center gap-1 px-2 text-sm font-semibold"
                      style={{ color: "var(--brand-text, var(--brand))" }}
                    >
                      Abrir <ExternalLink size={14} aria-hidden="true" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
