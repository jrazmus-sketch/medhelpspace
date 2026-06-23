import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireActiveMembership, isViewerAdmin } from "@/lib/membership-gate";
import { getReviewItems, getPageReviewItems, type ReviewMode } from "@/lib/review/queries";
import { ReviewSession } from "@/components/content/review-session";

export const metadata = { title: "Revisão — Sessão" };

export default async function RevisaoSessaoPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/app/revisao");

  const { mode, page } = await searchParams;
  const pageId = page ? Number(page) : NaN;

  let items;
  let sessionMode: ReviewMode = "due";
  let title: string;

  if (Number.isInteger(pageId) && pageId > 0) {
    // On-demand: review one completed page's items, regardless of due date.
    // `getPageReviewItems` reads via the service-role client (RLS bypassed) and
    // `page` is user-controlled, so we must enforce the SAME gating the
    // [specialty]/[slug] content route applies — otherwise a member could review
    // a draft or a still-locked MedHelp 60D page by guessing its id (IDOR).
    const admin = createAdminClient();
    const { data: pageRow } = await admin
      .from("pages")
      .select("status, content_module_id")
      .eq("id", pageId)
      .single();
    if (!pageRow) redirect("/app/revisao");
    // Drafts: admins may preview, members never (mirrors the content route).
    if (pageRow.status !== "publish" && !(await isViewerAdmin())) redirect("/app/revisao");
    // Membership + module gate (e.g. MedHelp 60D); admins bypass, locked → redirect.
    await requireActiveMembership(pageRow.content_module_id);

    items = await getPageReviewItems(pageId);
    title = "Revisar de novo";
  } else {
    sessionMode = mode === "wrong" ? "wrong" : mode === "weak" ? "weak" : "due";
    items = await getReviewItems(user.id, sessionMode);
    title =
      sessionMode === "wrong"
        ? "Só as que errei"
        : sessionMode === "weak"
          ? "Pontos fracos"
          : "Revisão de hoje";
  }

  if (items.length === 0) redirect("/app/revisao");

  return (
    <div className="mx-auto max-w-2xl px-[10px] sm:px-6 pt-7 pb-16">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
        <Link
          href="/app/revisao"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Sair
        </Link>
      </div>
      <ReviewSession items={items} mode={sessionMode} />
    </div>
  );
}
