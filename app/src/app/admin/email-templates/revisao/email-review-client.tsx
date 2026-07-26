"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

// Read-only review surface: every e-mail already rendered server-side with sample
// data, stacked in send order. The editor shows one template at a time, which is
// right for editing and wrong for reviewing — judging a funnel's voice means
// reading its messages next to each other, in the order they arrive.
//
// Previews are iframes fed by srcDoc; raw e-mail HTML is never injected into this
// document.

export type ReviewItem = {
  kind: string;
  name: string;
  description: string;
  subject: string;
  html: string;
  active: boolean;
};

export type ReviewGroup = { slug: string; count: number };

export function EmailReviewClient({
  groups,
  selected,
  items,
}: {
  groups: ReviewGroup[];
  selected: string;
  items: ReviewItem[];
}) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("emailReview.title")}</h1>
          <Link
            href="/admin/email-templates"
            className="text-sm font-medium text-brand hover:underline"
          >
            {t("emailReview.editLink")}
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">{t("emailReview.subtitle")}</p>
      </header>

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {groups.map((g) => {
          const isActive = g.slug === selected;
          return (
            <Link
              key={g.slug}
              href={`/admin/email-templates/revisao?grupo=${g.slug}`}
              className={`flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold transition-colors ${
                isActive
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border bg-surface-1 text-muted-foreground hover:border-brand"
              }`}
            >
              {t(`emailReview.group.${g.slug}`)}
              <span className="tabular-nums opacity-70">{g.count}</span>
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("emailReview.empty")}
        </p>
      ) : (
        <div className="space-y-8">
          {items.map((item, i) => (
            <section key={item.kind} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <h2 className="text-base font-semibold text-foreground">{item.name}</h2>
                <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {item.kind}
                </code>
                {!item.active && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                    {t("emailReview.inactiveBadge")}
                  </span>
                )}
              </div>

              {item.description && (
                <p className="text-xs text-muted-foreground">{item.description}</p>
              )}

              <p className="text-sm">
                <span className="text-muted-foreground">{t("emailReview.subjectLabel")} </span>
                <strong className="text-foreground">{item.subject}</strong>
              </p>

              <iframe
                srcDoc={item.html}
                title={t("emailReview.previewTitle", { name: item.name })}
                sandbox=""
                loading="lazy"
                className="h-[620px] w-full rounded-xl border border-border bg-white"
              />
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("emailReview.sampleNote")}</p>
    </div>
  );
}
