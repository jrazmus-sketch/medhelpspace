import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { safeDestination } from "@/lib/ambassadors/ref-link";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { LoginPageClient } from "./login-client";

function mapAuthError(msg: string): string {
  if (msg === "empty") return "Preencha todos os campos.";
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("Too many requests")) return "Muitas tentativas. Aguarde alguns minutos.";
  return "Erro ao entrar. Tente novamente.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}) {
  const { error, reset, next: rawNext } = await searchParams;
  // Same guard as /auth/confirm and the ambassador links: `next` arrives in the
  // query string, so it is attacker-controlled.
  const next = rawNext && safeDestination(rawNext) === rawNext ? rawNext : null;

  if (!USE_MOCK_DATA) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // Already signed in: honour where they were going, not the default.
    if (user) redirect(next ?? "/app");
  }

  return (
    <LoginPageClient
      next={next}
      initialError={error ? mapAuthError(error) : null}
      initialNotice={
        reset === "sucesso"
          ? "Senha alterada com sucesso. Faça login com sua nova senha."
          : null
      }
    />
  );
}
