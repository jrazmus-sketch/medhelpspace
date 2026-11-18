"use client";

import { useState } from "react";
import {
  DAILY_MINUTES_MAX, DAILY_MINUTES_MIN, formatDuration, isValidDailyMinutes,
} from "@/lib/study-plan/availability";

/**
 * "Quanto tempo você pode estudar por dia?" — hours and minutes typed in two
 * fields (Karina 2026-11-18: 30 minutes or 1 hour and 30 minutes must be
 * enterable, not only reachable with a slider). The shortcuts only fill these
 * same fields. `onChange` is called with a VALID total only, so a half-typed
 * value ("1" on the way to "10") is never saved.
 */

const SHORTCUTS = [30, 60, 120, 240];

function parsePart(text: string, max: number): number | null {
  const t = text.trim();
  if (t === "") return 0;
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n <= max ? n : null;
}

export function DailyTimeFields({
  idPrefix,
  minutes,
  onChange,
  onInvalid,
  shortcuts = true,
  maxMinutes = DAILY_MINUTES_MAX,
  maxMessage,
}: {
  idPrefix: string;
  /** The starting value (the fields keep what is typed afterwards). */
  minutes: number;
  onChange: (minutes: number) => void;
  /** Called when what is typed stops being a valid time (so a form can refuse to submit the last valid one). */
  onInvalid?: () => void;
  shortcuts?: boolean;
  /** An upper limit below the general one (a reduction must stay under the regular time). */
  maxMinutes?: number;
  maxMessage?: string;
}) {
  const [hText, setHText] = useState(String(Math.floor(minutes / 60)));
  const [mText, setMText] = useState(String(minutes % 60));
  // Complain only once the student leaves a field — "1" is a normal step towards "10".
  const [left, setLeft] = useState(false);

  const h = parsePart(hText, 16);
  const m = parsePart(mText, 59);
  const total = h == null || m == null ? null : h * 60 + m;
  const inRange = total != null && isValidDailyMinutes(total);
  const overMax = inRange && total > maxMinutes;
  const invalid = !inRange || overMax;

  function update(nextH: string, nextM: string) {
    setHText(nextH);
    setMText(nextM);
    const ph = parsePart(nextH, 16);
    const pm = parsePart(nextM, 59);
    const t = ph == null || pm == null ? null : ph * 60 + pm;
    if (t != null && isValidDailyMinutes(t) && t <= maxMinutes) onChange(t);
    else onInvalid?.();
  }

  const fieldStyle: React.CSSProperties = {
    width: 72,
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    border: `1px solid ${invalid && left ? "var(--destructive)" : "var(--surface-2)"}`,
    background: "var(--background)",
    color: "var(--foreground)",
    // 16px: a smaller font makes iOS zoom the page when the field is focused.
    fontSize: 16,
    fontWeight: 600,
    textAlign: "center",
    outline: "none",
  };
  const unitStyle: React.CSSProperties = { fontSize: 14, color: "var(--foreground)" };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px" }}>
        <label htmlFor={`${idPrefix}-horas`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            id={`${idPrefix}-horas`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={hText}
            aria-invalid={invalid && left}
            onFocus={() => setLeft(false)}
            onBlur={() => setLeft(true)}
            onChange={(e) => update(e.target.value.replace(/\D/g, ""), mText)}
            className="min-h-11"
            style={fieldStyle}
          />
          <span style={unitStyle}>{h === 1 ? "hora" : "horas"} e</span>
        </label>
        <label htmlFor={`${idPrefix}-minutos`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            id={`${idPrefix}-minutos`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={mText}
            aria-invalid={invalid && left}
            onFocus={() => setLeft(false)}
            onBlur={() => setLeft(true)}
            onChange={(e) => update(hText, e.target.value.replace(/\D/g, ""))}
            className="min-h-11"
            style={fieldStyle}
          />
          <span style={unitStyle}>{m === 1 ? "minuto" : "minutos"}</span>
        </label>
      </div>

      {invalid && left && (
        <p role="alert" style={{ fontSize: 12, color: "var(--destructive)", marginTop: 6, lineHeight: 1.5 }}>
          {overMax && maxMessage
            ? maxMessage
            : `Informe um tempo entre ${formatDuration(DAILY_MINUTES_MIN)} e ${formatDuration(DAILY_MINUTES_MAX)} por dia (minutos de 0 a 59).`}
        </p>
      )}

      {shortcuts && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }} aria-label="Atalhos de tempo">
          {SHORTCUTS.filter((s) => s <= maxMinutes).map((s) => {
            const active = total === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => { setLeft(false); update(String(Math.floor(s / 60)), String(s % 60)); }}
                className="min-h-11"
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: active ? "1px solid var(--brand)" : "1px solid var(--surface-2)",
                  background: active ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "transparent",
                  color: active ? "var(--brand-text, var(--brand))" : "var(--foreground)",
                  fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer",
                }}
              >
                {formatDuration(s)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
