import { requireContentAdminPage } from "@/lib/clinact/admin-gate";
import { createClient } from "@/lib/supabase/server";
import { getPageLayout, orderSections } from "@/lib/queries/site-sections";
import { CLINACT_SECTIONS, CLINACT_ALWAYS_VISIBLE } from "@/components/clinact/sales/sections";
import { createAdminClient } from "@/lib/supabase/admin";
import { SALES_IMAGE_SLOTS, isSalesImageUrl } from "@/lib/clinact/sales-images";
import { SalesPageClient } from "./sales-page-client";

export const metadata = { title: "ClinAct — página de vendas" };
export const dynamic = "force-dynamic";

/**
 * The ClinAct sales page's STRUCTURE: publish gate, section order, visibility.
 * The copy itself is edited in place on /clinact (site_content). Sections are
 * declared in code; this only arranges them — "um editor estruturado e seguro".
 */
export default async function ClinactSalesPageAdmin() {
  const user = await requireContentAdminPage();
  const supabase = await createClient();
  const [layout, { data: profile }, { data: imageRows }] = await Promise.all([
    getPageLayout("clinact"),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    createAdminClient()
      .from("site_content")
      .select("key, value")
      .in("key", SALES_IMAGE_SLOTS.map((s) => s.key)),
  ]);
  const imageUrl = new Map((imageRows ?? []).map((r) => [r.key as string, r.value as string]));

  // Hidden sections stay in the list (orderSections would drop them), placed by
  // their stored position so the admin sees where they would reappear.
  const ordered = orderSections(CLINACT_SECTIONS, { ...layout, visible: {} });

  return (
    <SalesPageClient
      published={layout.published}
      canPublish={profile?.role === "super_admin"}
      images={SALES_IMAGE_SLOTS.map((slot) => {
        const url = imageUrl.get(slot.key);
        return { key: slot.key, section: slot.section, url: isSalesImageUrl(url) ? url : null };
      })}
      sections={ordered.map((s) => ({
        key: s.key,
        visible: layout.visible[s.key] !== false || CLINACT_ALWAYS_VISIBLE.includes(s.key),
        locked: CLINACT_ALWAYS_VISIBLE.includes(s.key),
      }))}
    />
  );
}
