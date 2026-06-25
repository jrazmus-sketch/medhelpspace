"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteText } from "@/components/landing/site-text";
import { USE_MOCK_DATA } from "@/lib/mock-data";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);

    if (USE_MOCK_DATA) {
      await new Promise((r) => setTimeout(r, 500));
      router.push("/app");
      return;
    }

    const res = await fetch("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json();
      if (msg?.includes("same password")) {
        setError("A nova senha não pode ser igual à senha atual.");
      } else if (msg?.includes("session")) {
        setError("Sessão expirada. Solicite um novo link de recuperação.");
      } else {
        setError("Não foi possível atualizar a senha. Tente novamente.");
      }
      setLoading(false);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link href="/" className="font-semibold tracking-tight text-brand hover:opacity-80">
          MedHelpSpace
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm border-border/50 bg-surface-1">
          <CardHeader className="pb-4 text-center">
            <CardTitle className="text-xl">
              <SiteText as="span" k="reset.title" fallback="Nova senha" />
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              <SiteText
                as="span"
                multiline
                k="reset.subtitle"
                fallback="Escolha uma nova senha para sua conta."
              />
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmar nova senha</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full bg-brand text-brand-fg hover:bg-brand/90"
                disabled={loading}
              >
                {loading ? "Salvando…" : "Definir nova senha"}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Lembrou a senha?{" "}
              <Link href="/login" className="font-medium text-brand hover:underline">
                Entrar
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
