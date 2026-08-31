/**
 * Product-scoped access gate (§1). Mirrors `requireActiveMembership` in
 * lib/membership-gate.ts: admins bypass, no session → /login, no access →
 * the product's sales page (never /loja — that sells Revalida).
 *
 * ClinAct routes live OUTSIDE /app on purpose: that layout requires a cohort
 * membership a ClinAct subscriber will usually not hold.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";

const ADMIN_ROLES = ["super_admin", "content_admin", "support_admin", "billing_admin"];

export type Product = "revalida" | "clinact";

const SALES_PAGE: Record<Product, string> = { revalida: "/loja", clinact: "/clinact" };

export async function requireProductAccess(product: Product): Promise<{ userId: string; isAdmin: boolean }> {
  if (USE_MOCK_DATA) return { userId: "mock", isAdmin: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/${product}/treinar`)}`);

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (ADMIN_ROLES.includes(profile?.role ?? "")) return { userId: user.id, isAdmin: true };

  const { data: has } = await supabase.rpc("user_has_product_access", { p: product });
  if (!has) redirect(SALES_PAGE[product]);
  return { userId: user.id, isAdmin: false };
}

/** Non-redirecting variant for pages that render differently with/without access. */
export async function hasProductAccess(product: Product): Promise<boolean> {
  if (USE_MOCK_DATA) return true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (ADMIN_ROLES.includes(profile?.role ?? "")) return true;
  const { data: has } = await supabase.rpc("user_has_product_access", { p: product });
  return !!has;
}

export type ClinactViewer = { userId: string; isAdmin: boolean; hasAccess: boolean };

/**
 * The (membro) area gate since the free-samples change (Karina 2026-08-31):
 * being LOGGED IN is enough to enter — pages then decide what the viewer can
 * open (free cases for everyone signed in; the rest only with access).
 */
export async function getClinactViewer(): Promise<ClinactViewer> {
  if (USE_MOCK_DATA) return { userId: "mock", isAdmin: true, hasAccess: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/clinact/treinar")}`);
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (ADMIN_ROLES.includes(profile?.role ?? "")) return { userId: user.id, isAdmin: true, hasAccess: true };
  const { data: has } = await supabase.rpc("user_has_product_access", { p: "clinact" });
  return { userId: user.id, isAdmin: false, hasAccess: !!has };
}
