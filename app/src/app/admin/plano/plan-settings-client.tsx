"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { savePlanSettings } from "@/actions/study-plan-settings";
import { PLAN_SETTING_FIELDS, type PlanSettings, type PlanSettingNumberKey } from "@/lib/study-plan/settings";
import type { PaceStats } from "@/lib/study-plan/settings-server";

type Field = (typeof PLAN_SETTING_FIELDS)[number];
const FIELD: Record<PlanSettingNumberKey, Field> = Object.fromEntries(
  PLAN_SETTING_FIELDS.map((f) => [f.key, f]),
) as Record<PlanSettingNumberKey, Field>;

const GROUPS: { id: "materials" | "review" | "phase" | "pace" | "d60"; keys: PlanSettingNumberKey[] }[] = [
  { id: "materials", keys: ["minutesPerQuestion", "secondsPerFlashcard", "minutesPerRevalidaUpInsight", "medvoiceFallbackMinutes"] },
  { id: "review", keys: ["reviewSecondsPerItem", "reviewMaxShare", "reviewReserveShare"] },
  { id: "phase", keys: ["simuladoQuestions", "simuladoDaysPerWeek", "simuladoMaxWeeklyShare"] },
  { id: "pace", keys: ["paceSlowFactor", "paceFastFactor", "paceMinSamples"] },
  { id: "d60", keys: ["d60MinutesPerFormulaPage", "d60SecondsPerMemorecard", "d60CorrectionMinutesPerQuestion"] },
];

/** Which unit label goes after each input. */
const UNIT: Record<PlanSettingNumberKey, "minutes" | "seconds" | "percent" | "times" | "perWeek" | "answers" | "questions"> = {
  minutesPerQuestion: "minutes", secondsPerFlashcard: "seconds", minutesPerRevalidaUpInsight: "minutes",
  medvoiceFallbackMinutes: "minutes", reviewSecondsPerItem: "seconds", reviewMaxShare: "percent",
  reviewReserveShare: "percent", simuladoQuestions: "questions",
  simuladoDaysPerWeek: "perWeek", simuladoMaxWeeklyShare: "percent", paceSlowFactor: "times", paceFastFactor: "times",
  paceMinSamples: "answers",
  d60MinutesPerFormulaPage: "minutes", d60SecondsPerMemorecard: "seconds", d60CorrectionMinutesPerQuestion: "minutes",
};

// Shares are stored 0–1 and typed as a percentage.
const toInput = (f: Field, v: number) => (f.kind === "share" ? String(Math.round(v * 100)) : String(v));
const fromInput = (f: Field, raw: string) => {
  const n = Number(raw.replace(",", "."));
  return f.kind === "share" ? n / 100 : n;
};
const shown = (f: Field, v: number) => (f.kind === "share" ? Math.round(v * 100) : v);

export function PlanSettingsClient({
  settings,
  stats,
  unavailable,
}: {
  settings: PlanSettings;
  stats: PaceStats | null;
  unavailable: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(PLAN_SETTING_FIELDS.map((f) => [f.key, toInput(f, settings[f.key])])),
  );
  const [adaptive, setAdaptive] = useState(settings.adaptivePaceEnabled);
  const [status, setStatus] = useState<"idle" | "saved" | "forbidden" | "invalid" | "failed">("idle");
  const [pending, startTransition] = useTransition();

  const num = (v: number, digits = 1) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: digits }).format(v);

  const invalid = (f: Field) => {
    const n = fromInput(f, raw[f.key] ?? "");
    return !Number.isFinite(n) || n < f.min - 1e-9 || n > f.max + 1e-9;
  };
  const anyInvalid = PLAN_SETTING_FIELDS.some(invalid);

  // The typical time between answers across all students, next to the two defaults it informs.
  const typical = (key: PlanSettingNumberKey): string | null => {
    if (!stats) return null;
    if (key === "minutesPerQuestion") {
      return stats.questionSeconds != null && stats.questionSamples > 0
        ? t("planSettings.typical", {
            value: `${num(stats.questionSeconds / 60)} ${t("planSettings.units.minutes")}`,
            samples: stats.questionSamples, students: stats.questionStudents,
          })
        : t("planSettings.typicalNone");
    }
    if (key === "secondsPerFlashcard") {
      return stats.flashcardSeconds != null && stats.flashcardSamples > 0
        ? t("planSettings.typical", {
            value: `${num(stats.flashcardSeconds, 0)} ${t("planSettings.units.seconds")}`,
            samples: stats.flashcardSamples, students: stats.flashcardStudents,
          })
        : t("planSettings.typicalNone");
    }
    return null;
  };

  const mpq = fromInput(FIELD.minutesPerQuestion, raw.minutesPerQuestion ?? "");
  const perHour = Number.isFinite(mpq) && mpq > 0 ? Math.round(60 / mpq) : null;

  function save() {
    if (anyInvalid) { setStatus("invalid"); return; }
    const values = Object.fromEntries(PLAN_SETTING_FIELDS.map((f) => [f.key, fromInput(f, raw[f.key])]));
    startTransition(async () => {
      const res = await savePlanSettings({ values, adaptivePaceEnabled: adaptive });
      setStatus(res.ok ? "saved" : res.error);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("planSettings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("planSettings.intro")}</p>
      </div>

      {unavailable && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">{t("planSettings.errors.unavailable")}</p>
      )}

      {GROUPS.map((g) => (
        <section key={g.id} className="space-y-3 rounded-xl border border-border p-4 sm:p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t(`planSettings.groups.${g.id}.title`)}</h2>
            <p className="text-sm text-muted-foreground">{t(`planSettings.groups.${g.id}.help`)}</p>
          </div>

          {g.id === "pace" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("planSettings.adaptive.label")}</p>
                <p className="text-sm text-muted-foreground">{t("planSettings.adaptive.help")}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={adaptive}
                aria-label={t("planSettings.adaptive.label")}
                onClick={() => { setAdaptive((v) => !v); setStatus("idle"); }}
                className={`inline-flex min-h-11 min-w-24 items-center justify-center rounded-lg border px-4 text-sm font-semibold ${
                  adaptive ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground"
                }`}
              >
                {adaptive ? t("planSettings.adaptive.on") : t("planSettings.adaptive.off")}
              </button>
            </div>
          )}

          <div className="divide-y divide-border">
            {g.keys.map((key) => {
              const f = FIELD[key];
              const help = t(`planSettings.fields.${key}.help`);
              const tip = typical(key);
              const bad = invalid(f);
              return (
                <div key={key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <label htmlFor={`ps-${key}`} className="text-sm font-medium">
                      {t(`planSettings.fields.${key}.label`)}
                    </label>
                    {help && <p className="text-sm text-muted-foreground">{help}</p>}
                    {tip && <p className="text-sm text-muted-foreground">{tip}</p>}
                    {key === "minutesPerQuestion" && perHour != null && (
                      <p className="text-sm text-muted-foreground">{t("planSettings.perHour", { n: perHour })}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <input
                        id={`ps-${key}`}
                        type="number"
                        inputMode="decimal"
                        min={shown(f, f.min)}
                        max={shown(f, f.max)}
                        step={f.kind === "share" ? 5 : f.step}
                        value={raw[key] ?? ""}
                        onChange={(e) => { setRaw((r) => ({ ...r, [key]: e.target.value })); setStatus("idle"); }}
                        aria-invalid={bad}
                        className={`min-h-11 w-24 rounded-lg border bg-background px-3 text-right text-base ${
                          bad ? "border-destructive" : "border-border"
                        }`}
                      />
                      <span className="w-20 text-sm text-muted-foreground">{t(`planSettings.units.${UNIT[key]}`)}</span>
                    </div>
                    <span className={`text-sm ${bad ? "text-destructive" : "text-muted-foreground"}`}>
                      {t("planSettings.range", { min: num(shown(f, f.min), 2), max: num(shown(f, f.max), 2) })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || unavailable}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-fg disabled:opacity-50"
        >
          {pending ? t("planSettings.saving") : t("planSettings.save")}
        </button>
        <p role="status" aria-live="polite" className={`text-sm ${status === "saved" ? "text-foreground" : "text-destructive"}`}>
          {status === "saved" ? t("planSettings.saved") : status === "idle" ? "" : t(`planSettings.errors.${status}`)}
        </p>
      </div>
    </div>
  );
}
