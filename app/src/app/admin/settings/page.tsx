"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfile } from "@/actions/admin";
import { useState, useTransition, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { USE_MOCK_DATA } from "@/lib/mock-data";

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function handleThemeChange(next: "system" | "light" | "dark") {
    setTheme(next);
    if (!USE_MOCK_DATA && profile) {
      const supabase = createClient();
      await supabase.from("profiles").update({ theme_preference: next }).eq("id", profile.id);
    }
  }

  function handleSave(formData: FormData) {
    const name = (formData.get("display_name") as string).trim();
    if (!name) {
      setSaveError(t("errors.validation"));
      return;
    }
    setSaved(false);
    setSaveError(null);
    startTransition(async () => {
      await updateProfile(formData);
      setSaved(true);
    });
  }

  const themes = ["system", "light", "dark"] as const;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      {/* Profile — key remounts form when profile loads so defaultValue is fresh */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form key={profile?.id ?? "loading"} action={handleSave} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">{t("settings.displayName")}</span>
              <input
                name="display_name"
                defaultValue={profile?.display_name ?? ""}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">{t("settings.email")}</span>
              <input
                value={profile?.email ?? ""}
                readOnly
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? t("common.loading") : t("settings.saveChanges")}
              </button>
              {saved && (
                <span className="text-sm text-green-600 dark:text-green-400">{t("common.success")}</span>
              )}
              {saveError && (
                <span className="text-sm text-red-500">{saveError}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Language */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.language")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {["pt-BR", "en"].map((lang) => (
              <button
                key={lang}
                onClick={() => {
                  i18n.changeLanguage(lang);
                  if (!USE_MOCK_DATA && profile) {
                    const s = createClient();
                    s.from("profiles").update({ admin_locale: lang }).eq("id", profile.id);
                  }
                }}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  i18n.language === lang
                    ? "bg-brand text-brand-fg"
                    : "border border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {lang === "pt-BR" ? "Português" : "English"}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.theme")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {themes.map((t_) => (
              <button
                key={t_}
                onClick={() => handleThemeChange(t_)}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors",
                  mounted && theme === t_
                    ? "bg-brand text-brand-fg"
                    : "border border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {t_ === "system" ? "Auto" : t_ === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
