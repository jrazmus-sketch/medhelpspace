"use client";

// Site-wide publish switches on /admin/settings (super_admin only): the WhatsApp
// button on the Revalida sales pages, and the optional WhatsApp step in the lead
// funnels. Each gate is a site_pages row read through a server action, because
// this settings page is a client component.

import { useEffect, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSiteGate, setSiteGate } from "@/actions/site-pages";
import { WHATSAPP_GATE_KEY } from "@/lib/whatsapp";
import { WHATSAPP_OPTIN_GATE_KEY } from "@/lib/whatsapp-optin";

const GATES: { key: string; i18n: string }[] = [
  { key: WHATSAPP_GATE_KEY.revalida, i18n: "whatsapp" },
  { key: WHATSAPP_OPTIN_GATE_KEY, i18n: "whatsappOptin" },
];

function GateRow({ gate }: { gate: { key: string; i18n: string } }) {
  const { t } = useTranslation();
  const [published, setPublished] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getSiteGate(gate.key).then((r) => {
      if (!alive) return;
      if (r.ok) setPublished(r.published);
      else setError(t("errors.generic"));
    });
    return () => {
      alive = false;
    };
  }, [gate.key, t]);

  function flip(next: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setSiteGate(gate.key, next);
      if (r.ok) setPublished(r.published);
      else setError(t("errors.generic"));
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium">{t(`settings.${gate.i18n}Title`)}</div>
          <p className="text-sm text-muted-foreground">{t(`settings.${gate.i18n}Desc`)}</p>
          <p className="mt-1 text-xs text-muted-foreground" data-testid={`gate-state-${gate.key}`}>
            {published == null
              ? "…"
              : published
                ? t(`settings.${gate.i18n}StatePublic`)
                : t(`settings.${gate.i18n}StateAdmins`)}
          </p>
        </div>
        <Button
          type="button"
          variant={published ? "outline" : "default"}
          disabled={pending || published == null}
          onClick={() => flip(!published)}
          className="min-h-11 shrink-0"
        >
          {published ? t(`settings.${gate.i18n}Unpublish`) : t(`settings.${gate.i18n}Publish`)}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function SiteToggles() {
  const { t } = useTranslation();
  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">{t("settings.siteSection")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 divide-y divide-border/50 [&>*+*]:pt-5">
        {GATES.map((g) => (
          <GateRow key={g.key} gate={g} />
        ))}
      </CardContent>
    </Card>
  );
}
