"use client";

// Site-wide publish switches on /admin/settings (super_admin only). Today: the
// WhatsApp button on the Revalida sales pages. Reads its state through a server
// action because this settings page is a client component.

import { useEffect, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSiteGate, setSiteGate } from "@/actions/site-pages";
import { WHATSAPP_GATE_KEY } from "@/lib/whatsapp";

const GATE = WHATSAPP_GATE_KEY.revalida;

export function SiteToggles() {
  const { t } = useTranslation();
  const [published, setPublished] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getSiteGate(GATE).then((r) => {
      if (!alive) return;
      if (r.ok) setPublished(r.published);
      else setError(t("errors.generic"));
    });
    return () => {
      alive = false;
    };
  }, [t]);

  function flip(next: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setSiteGate(GATE, next);
      if (r.ok) setPublished(r.published);
      else setError(t("errors.generic"));
    });
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">{t("settings.siteSection")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("settings.whatsappTitle")}</div>
            <p className="text-sm text-muted-foreground">{t("settings.whatsappDesc")}</p>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="whatsapp-gate-state">
              {published == null
                ? "…"
                : published
                  ? t("settings.whatsappStatePublic")
                  : t("settings.whatsappStateAdmins")}
            </p>
          </div>
          <Button
            type="button"
            variant={published ? "outline" : "default"}
            disabled={pending || published == null}
            onClick={() => flip(!published)}
            className="min-h-11 shrink-0"
          >
            {published ? t("settings.whatsappUnpublish") : t("settings.whatsappPublish")}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
