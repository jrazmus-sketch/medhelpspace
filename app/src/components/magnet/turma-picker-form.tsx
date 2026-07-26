"use client";

import { useState, useTransition } from "react";
import { setSimuladoTargetCohort } from "@/actions/simulado";
import type { CohortOption } from "@/lib/magnet/simulado";

// The turma picker on /simulado-revalida/turma. One tap per option, stacked
// full-width — this is opened almost exclusively from a phone inbox, so the
// options are thumb-sized targets rather than a radio group plus a submit button.
//
// The one-click path from the email has already written the answer before this
// page renders; this exists so the lead can CORRECT it without another email.

export function TurmaPickerForm({
  options,
  current,
  undecidedSlug,
}: {
  options: CohortOption[];
  current: string | null;
  undecidedSlug: string;
}) {
  const [selected, setSelected] = useState<string | null>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(slug: string) {
    if (pending) return;
    const previous = selected;
    setSelected(slug);
    setError(null);
    startTransition(async () => {
      const res = await setSimuladoTargetCohort(slug);
      if (res.status !== "saved") {
        setSelected(previous);
        setError(
          res.status === "no_session"
            ? "Sua sessão expirou. Abra novamente o link que enviamos por e-mail."
            : "Não conseguimos salvar essa turma. Tente de novo.",
        );
      }
    });
  }

  const rows: { slug: string; label: string; hint: string }[] = [
    ...options.map((o) => ({ slug: o.slug, label: o.label, hint: o.when })),
    {
      slug: undecidedSlug,
      label: "Ainda não decidi",
      hint: "Tudo bem — a gente pergunta de novo mais pra frente",
    },
  ];

  return (
    <div>
      <ul className="mt-6 space-y-3">
        {rows.map((r) => {
          const active = selected === r.slug;
          return (
            <li key={r.slug}>
              <button
                type="button"
                onClick={() => choose(r.slug)}
                disabled={pending}
                aria-pressed={active}
                className={`flex min-h-[64px] w-full flex-col items-start justify-center gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                  active
                    ? "border-brand bg-brand/10"
                    : "border-border bg-card hover:border-brand/50"
                }`}
              >
                <span className="text-[15px] font-semibold text-foreground">{r.label}</span>
                <span className="text-[13px] text-muted-foreground">{r.hint}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p aria-live="polite" className="mt-4 min-h-[20px] text-[13px]">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : selected && !pending ? (
          <span className="text-muted-foreground">Anotado. Pode mudar quando quiser.</span>
        ) : null}
      </p>
    </div>
  );
}
