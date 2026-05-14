"use client";

import { useState, useTransition, useEffect } from "react";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/components/theme/theme-provider";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const THEMES = [
  { value: "system", label: "Automático" },
  { value: "light",  label: "Claro" },
  { value: "dark",   label: "Escuro" },
] as const;

export default function ConfiguracoesPage() {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Password change state
  const [isPending, startTransition] = useTransition();
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  async function handleThemeChange(next: "system" | "light" | "dark") {
    setTheme(next);
    if (!USE_MOCK_DATA) {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_preference: next }),
      });
    }
  }

  function handlePasswordSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newPw  = (fd.get("new_password")     as string).trim();
    const confirm = (fd.get("confirm_password") as string).trim();

    setPwSaved(false);
    setPwError(null);

    if (newPw.length < 8) { setPwError("A senha deve ter no mínimo 8 caracteres."); return; }
    if (newPw !== confirm) { setPwError("As senhas não coincidem."); return; }

    startTransition(async () => {
      if (USE_MOCK_DATA) { setPwSaved(true); return; }
      const res = await fetch("/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPw }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        setPwError(
          msg?.includes("same password")
            ? "A nova senha não pode ser igual à senha atual."
            : "Erro ao atualizar senha. Tente novamente.",
        );
      } else {
        setPwSaved(true);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Configurações</h1>

      {/* Theme */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {THEMES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleThemeChange(value)}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  mounted && theme === value
                    ? "bg-brand text-brand-fg"
                    : "border border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Alterar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSave} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Nova senha</span>
              <input
                name="new_password"
                type="password"
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Confirmar nova senha</span>
              <input
                name="confirm_password"
                type="password"
                autoComplete="new-password"
                placeholder="Repita a senha"
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isPending ? "Salvando…" : "Alterar senha"}
              </button>
              {pwSaved && (
                <span className="text-sm text-green-600 dark:text-green-400">Senha alterada</span>
              )}
              {pwError && (
                <span className="text-sm text-destructive">{pwError}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
