"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { FileText, BookOpen, HelpCircle, Layers, Users, CalendarCheck } from "lucide-react";

interface Props {
  memberCount: number;
  cohortCount: number;
  draftCount: number;
}

export function AdminDashboardClient({ memberCount, cohortCount, draftCount }: Props) {
  const { t } = useTranslation();

  const statCards = [
    { icon: FileText,      key: "pages",      count: 958,        href: "/admin/pages" },
    { icon: BookOpen,      key: "lessons",    count: 1253,       href: "/admin/lessons" },
    { icon: HelpCircle,    key: "quizzes",    count: 711,        href: "/admin/quizzes" },
    { icon: Layers,        key: "flashcards", count: 3506,       href: "/admin/flashcards" },
    { icon: Users,         key: "members",    count: memberCount, href: "/admin/members" },
    { icon: CalendarCheck, key: "cohorts",    count: cohortCount, href: "/admin/cohorts" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {statCards.map(({ icon: Icon, key, count, href }) => (
          <Link key={key} href={href}>
            <Card className="group border-border/50 transition-colors hover:border-brand/40 hover:bg-accent/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-brand">
                  <Icon className="h-4 w-4" />
                  {t(`nav.${key}`)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold">{count.toLocaleString("pt-BR")}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {draftCount > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">{t("pages.draft")} ({draftCount})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {draftCount === 18
                ? "14 hubs incompletos (OB/Ped) e 3 referências H5P órfãs aguardam revisão."
                : `${draftCount} páginas em rascunho aguardam revisão.`}
            </p>
            <Link href="/admin/pages?status=draft" className="mt-2 inline-block text-sm text-brand hover:underline">
              {t("common.viewAll")} →
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
