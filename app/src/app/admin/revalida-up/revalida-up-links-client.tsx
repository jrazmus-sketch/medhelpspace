"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";

export type LinkIssue = {
  issue: "pagina_sem_tema" | "vinculo_invalido";
  pageId: number;
  title: string;
  specialty: string | null;
  topicName: string | null;
};

function IssueList({ rows }: { rows: LinkIssue[] }) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {rows.map((r) => (
        <li key={`${r.issue}-${r.pageId}-${r.topicName ?? ""}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{r.title}</p>
            <p className="break-words text-sm text-muted-foreground">
              {[r.specialty, r.topicName ? t("revalidaUpLinks.topic", { name: r.topicName }) : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Link
            href={`/admin/pages/${r.pageId}/edit`}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            {t("revalidaUpLinks.edit")}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RevalidaUpLinksClient({ rows, unavailable }: { rows: LinkIssue[]; unavailable: boolean }) {
  const { t } = useTranslation();
  const missing = rows.filter((r) => r.issue === "pagina_sem_tema");
  const invalid = rows.filter((r) => r.issue === "vinculo_invalido");
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("revalidaUpLinks.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("revalidaUpLinks.intro")}</p>
        <p className="text-sm font-medium">{t("revalidaUpLinks.rule")}</p>
      </div>
      {unavailable ? null : rows.length === 0 ? (
        <p className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 text-sm">{t("revalidaUpLinks.allOk")}</p>
      ) : (
        <>
          {missing.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">{t("revalidaUpLinks.missingTitle", { count: missing.length })}</h2>
              <p className="text-sm text-muted-foreground">{t("revalidaUpLinks.missingHelp")}</p>
              <IssueList rows={missing} />
            </section>
          )}
          {invalid.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">{t("revalidaUpLinks.invalidTitle", { count: invalid.length })}</h2>
              <p className="text-sm text-muted-foreground">{t("revalidaUpLinks.invalidHelp")}</p>
              <IssueList rows={invalid} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
