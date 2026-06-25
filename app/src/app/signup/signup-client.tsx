"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { USE_MOCK_DATA } from "@/lib/mock-data";

function mapSignupError(msg: string): string {
  if (msg.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("Password should be at least")) return "A senha deve ter no mínimo 8 caracteres.";
  if (msg.includes("Unable to validate email")) return "E-mail inválido.";
  return "Erro ao criar conta. Tente novamente.";
}

export function SignupPageClient() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }

    setLoading(true);

    if (USE_MOCK_DATA) {
      await new Promise((r) => setTimeout(r, 400));
      router.push("/app");
      return;
    }

    const res = await fetch("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        displayName: displayName || null,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      }),
    });

    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(mapSignupError(msg ?? ""));
      setLoading(false);
      return;
    }

    const { sessionCreated } = await res.json();
    if (sessionCreated) {
      router.push("/app");
      router.refresh();
    } else {
      setConfirmSent(true);
    }
  }

  if (confirmSent) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="flex h-14 items-center border-b border-border/50 px-6">
          <Link href="/" className="font-semibold tracking-tight text-brand">
            MedHelpSpace
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <Card className="w-full max-w-sm border-border/50 bg-surface-1 text-center">
            <CardContent className="py-8">
              <div className="mb-4 text-4xl">📬</div>
              <h2 className="mb-2 text-lg font-semibold">Verifique seu e-mail</h2>
              <p className="text-sm text-muted-foreground">
                Enviamos um link de confirmação para{" "}
                <span className="font-medium text-foreground">{email}</span>.
                Clique no link para ativar sua conta.
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                Já confirmou?{" "}
                <Link href="/login" className="text-brand hover:underline">
                  Entrar
                </Link>
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b border-border/50 px-6">
        <Link
          href="/"
          className="font-semibold tracking-tight text-brand hover:opacity-80"
        >
          MedHelpSpace
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm border-border/50 bg-surface-1">
          <CardHeader className="pb-4 text-center">
            <CardTitle className="text-xl">Criar conta</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Nome</Label>
                <Input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  placeholder="Dra. Maria Silva"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full bg-brand text-brand-fg hover:bg-brand/90"
                disabled={loading}
              >
                {loading ? "Criando conta…" : "Criar conta"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Ao criar conta, você aceita os{" "}
                <Link href="/termos" className="underline hover:text-brand">
                  Termos de uso
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" className="underline hover:text-brand">
                  Política de privacidade
                </Link>
                .
              </p>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link
                href="/login"
                className="font-medium text-brand hover:underline"
              >
                Entrar
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
