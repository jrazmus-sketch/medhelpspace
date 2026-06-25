"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { SiteText } from "@/components/landing/site-text";

export function LoginPageClient({ initialError }: { initialError: string | null }) {
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
            <CardTitle className="text-xl">
              <SiteText as="span" k="login.title" fallback="Entrar na plataforma" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action="/auth/login" method="post" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  <Link
                    href="/recuperar-senha"
                    className="text-xs text-muted-foreground hover:text-brand"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>

              {initialError && (
                <p className="text-sm text-destructive">{initialError}</p>
              )}

              <button
                type="submit"
                className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg"
              >
                Entrar
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Não tem conta?{" "}
              <Link href="/signup" className="font-medium text-brand hover:underline">
                Criar conta
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
