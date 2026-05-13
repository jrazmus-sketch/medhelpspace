import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (!USE_MOCK_DATA) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/app");
  }

  const { error } = await searchParams;
  return <LoginPageClient initialError={error ? mapAuthError(error) : null} />;
}
