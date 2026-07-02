import { createAdminClient } from "@/lib/supabase/admin";
import { CohortsClient } from "./cohorts-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Turmas" };

export default async function CohortsPage() {
  const admin = createAdminClient();

  const [
    { data: cohorts },
    { data: memberships },
    { data: modules },
    { data: access },
  ] = await Promise.all([
    admin
      .from("cohorts")
      .select("id, slug, name, test_date, date_confirmed, membership_starts_at, membership_ends_at, active, price_cents, sale_price_cents, is_for_sale, display_order, sale_ends_at")
      .order("display_order")
      .order("id"),
    admin.from("user_cohort_memberships").select("cohort_id"),
    admin.from("content_modules").select("id, name, unlock_offset_days").order("id"),
    admin.from("cohort_module_access").select("cohort_id, content_module_id, is_manual_override"),
  ]);

  const countByCohort = new Map<number, number>();
  for (const m of memberships ?? []) {
    const id = m.cohort_id as number;
    countByCohort.set(id, (countByCohort.get(id) ?? 0) + 1);
  }

  const rows = (cohorts ?? []).map((c) => ({
    id: c.id as number,
    slug: c.slug as string,
    name: c.name as string,
    test_date: c.test_date as string,
    date_confirmed: (c.date_confirmed ?? false) as boolean,
    membership_starts_at: c.membership_starts_at as string,
    membership_ends_at: c.membership_ends_at as string,
    member_count: countByCohort.get(c.id as number) ?? 0,
    active: (c.active ?? true) as boolean,
    price_cents: (c.price_cents ?? null) as number | null,
    sale_price_cents: (c.sale_price_cents ?? null) as number | null,
    is_for_sale: (c.is_for_sale ?? false) as boolean,
    display_order: (c.display_order ?? 0) as number,
    sale_ends_at: (c.sale_ends_at ?? null) as string | null,
  }));

  return (
    <CohortsClient
      rows={rows}
      modules={(modules ?? []).map((m) => ({
        id: m.id as number,
        name: m.name as string,
        unlock_offset_days: m.unlock_offset_days as number,
      }))}
      access={(access ?? []).map((a) => ({
        cohort_id: a.cohort_id as number,
        content_module_id: a.content_module_id as number,
        is_manual_override: (a.is_manual_override ?? false) as boolean,
      }))}
    />
  );
}
