import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDueFlashcards } from "@/lib/review/queries";
import { ReviewSession } from "@/components/content/review-session";

export const metadata = { title: "Revisão — Sessão" };

export default async function RevisaoSessaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/revisao");

  const items = await getDueFlashcards(user.id);
  if (items.length === 0) redirect("/app/revisao");

  return (
    <div className="mx-auto max-w-2xl px-[10px] sm:px-6 pt-7 pb-16">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight text-foreground">Revisão de hoje</h1>
        <Link
          href="/app/revisao"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Sair
        </Link>
      </div>
      <ReviewSession items={items} />
    </div>
  );
}
