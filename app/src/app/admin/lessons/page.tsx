import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Aulas" };

export default async function LessonsPage() {
  const admin = createAdminClient();
  const { count } = await admin
    .from("lessons")
    .select("*", { count: "exact", head: true });
  const { count: withAudio } = await admin
    .from("lessons")
    .select("*", { count: "exact", head: true })
    .not("audio_url", "is", null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Aulas</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-3xl font-bold">{(count ?? 0).toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="text-sm text-muted-foreground">Com áudio</p>
          <p className="text-3xl font-bold text-brand">{(withAudio ?? 0).toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <p className="text-sm text-muted-foreground">Sem áudio</p>
          <p className="text-3xl font-bold text-muted-foreground">
            {((count ?? 0) - (withAudio ?? 0)).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
        Editor de conteúdo disponível em breve. Para edições, contate o desenvolvedor.
      </div>
    </div>
  );
}
