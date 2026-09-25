"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAppError } from "@/actions/app-errors";

export type AppErrorRow = {
  id: number;
  kind: "server" | "client";
  message: string;
  route: string | null;
  digest: string | null;
  stack: string | null;
  last_path: string | null;
  user_agent: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
};

export function ErrorsClient({ rows }: { rows: AppErrorRow[] }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const locale = i18n.language === "en" ? "en-US" : "pt-BR";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  function resolve(id: number) {
    startTransition(async () => {
      await resolveAppError(id);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t("errors.title")}</h1>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{t("errors.subtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("errors.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface-1">
          {rows.map((r) => {
            const isOpen = open === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  aria-expanded={isOpen}
                  className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/50"
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      r.kind === "server"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {t(`errors.kind.${r.kind}`)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium">{r.message}</span>
                    <span className="mt-0.5 block break-all text-xs text-muted-foreground">
                      {r.route ?? r.last_path ?? "—"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t("errors.count", { count: r.count })} · {t("errors.last", { when: fmt(r.last_seen) })}
                    </span>
                  </span>
                  <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen ? (
                  <div className="space-y-2 border-t border-border bg-background/40 px-4 py-3 text-xs">
                    <p>
                      <span className="text-muted-foreground">{t("errors.first")}</span> {fmt(r.first_seen)}
                    </p>
                    {r.last_path ? (
                      <p className="break-all">
                        <span className="text-muted-foreground">{t("errors.path")}</span> {r.last_path}
                      </p>
                    ) : null}
                    {r.digest ? (
                      <p className="break-all">
                        <span className="text-muted-foreground">digest</span> {r.digest}
                      </p>
                    ) : null}
                    {r.user_agent ? (
                      <p className="break-all text-muted-foreground">{r.user_agent}</p>
                    ) : null}
                    {r.stack ? (
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">
                        {r.stack}
                      </pre>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => resolve(r.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-60"
                    >
                      <Check className="h-4 w-4" /> {t("errors.resolve")}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
