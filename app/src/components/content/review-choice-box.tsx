"use client";

import { QUERO_REVISAR } from "@/lib/review/revisao-escolha";

/**
 * The "Quero revisar" box (Karina 2026-11-19): one checkbox, starts unticked until the student chooses, and the
 * whole row (box + label + supporting text) is the tap target — never below 44 px.
 */
export function ReviewChoiceBox({
  id,
  checked,
  onChange,
  help,
  disabled = false,
  className,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  help?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={[
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        checked ? "border-brand/50 bg-brand/5" : "border-border bg-surface-1 hover:border-brand/40",
        disabled ? "cursor-wait opacity-70" : "",
        className ?? "",
      ].join(" ")}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--brand)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug text-foreground">{QUERO_REVISAR}</span>
        {help && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{help}</span>}
      </span>
    </label>
  );
}
