"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMyNotificationPrefs,
  updateMyNotificationPref,
} from "@/actions/admin-notifications";
import {
  ADMIN_ALERT_EVENTS,
  type AdminAlertEvent,
  type AdminNotifyFrequency,
} from "@/lib/admin-notify-types";

const FREQUENCIES: AdminNotifyFrequency[] = ["instant", "daily", "off"];
const FREQ_LABEL_KEY: Record<AdminNotifyFrequency, string> = {
  instant: "settings.freqInstant",
  daily: "settings.freqDaily",
  off: "settings.freqOff",
};

// Per-admin email-notification preferences. Self-hides for non-eligible roles
// (super_admin / billing_admin only) — getMyNotificationPrefs returns eligible:false.
export default function AdminNotificationPrefs() {
  const { t } = useTranslation();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Record<string, AdminNotifyFrequency>>({});
  const [savingEvent, setSavingEvent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyNotificationPrefs()
      .then((res) => {
        if (!active) return;
        setEligible(res.eligible);
        setPrefs(res.prefs);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading || !eligible) return null;

  async function setFrequency(event: AdminAlertEvent, frequency: AdminNotifyFrequency) {
    if (prefs[event] === frequency) return;
    const prev = prefs[event];
    setPrefs((p) => ({ ...p, [event]: frequency })); // optimistic
    setSavingEvent(event);
    setError(null);
    const res = await updateMyNotificationPref(event, frequency);
    setSavingEvent(null);
    if ("error" in res) {
      setPrefs((p) => ({ ...p, [event]: prev })); // revert
      setError(t("settings.saveError"));
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">{t("settings.notifications")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{t("settings.notificationsDesc")}</p>

        {ADMIN_ALERT_EVENTS.map((event) => (
          <div
            key={event}
            className="space-y-2 border-b border-border/40 pb-4 last:border-0 last:pb-0"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {t(`settings.events.${event}`)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(`settings.events.${event}Desc`)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {FREQUENCIES.map((freq) => {
                const selected = prefs[event] === freq;
                return (
                  <button
                    key={freq}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={savingEvent === event}
                    onClick={() => setFrequency(event, freq)}
                    className={[
                      "min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
                      selected
                        ? "bg-brand text-brand-fg"
                        : "border border-border text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {t(FREQ_LABEL_KEY[freq])}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
