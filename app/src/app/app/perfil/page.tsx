"use client";

import { useState, useTransition } from "react";
import { useAuth } from "@/providers/auth-provider";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PerfilPage() {
  const { profile } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = (new FormData(e.currentTarget).get("display_name") as string).trim();
    if (!name) { setError("Nome não pode ficar em branco."); return; }
    setSaved(false);
    setError(null);
    startTransition(async () => {
      if (!USE_MOCK_DATA) {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_name: name }),
        });
        if (!res.ok) { setError("Erro ao salvar. Tente novamente."); return; }
      }
      setSaved(true);
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">Meu perfil</h1>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Dados da conta</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            key={profile?.id ?? "loading"}
            onSubmit={handleSave}
            className="space-y-4"
          >
            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">Nome</span>
              <input
                name="display_name"
                defaultValue={profile?.display_name ?? ""}
                placeholder="Seu nome"
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm text-muted-foreground">E-mail</span>
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
                {isPending ? "Salvando…" : "Salvar"}
              </button>
              {saved && (
                <span className="text-sm text-green-600 dark:text-green-400">Salvo</span>
              )}
              {error && (
                <span className="text-sm text-destructive">{error}</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
