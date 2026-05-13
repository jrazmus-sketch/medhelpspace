import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Flashcards" };

export default async function FlashcardsPage() {
  const admin = createAdminClient();
  const { count } = await admin
    .from("flashcard_items")
    .select("*", { count: "exact", head: true });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Flashcards</h1>
      <div className="rounded-xl border border-border bg-surface-1 p-4 w-fit">
        <p className="text-sm text-muted-foreground">Total de itens</p>
        <p className="text-3xl font-bold">{(count ?? 0).toLocaleString("pt-BR")}</p>
      </div>
      <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
        Editor de conteúdo disponível em breve. Para edições, contate o desenvolvedor.
      </div>
    </div>
  );
}
