import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA, MOCK_COHORT_PRODUCTS } from "@/lib/mock-data";
import type { CohortProduct } from "@/types/supabase";
import { activeSalePriceCents, discountPercentOf } from "@/lib/cohort-sale";

// The cohort product catalog. Reads the commerce columns added to the `cohorts`
// table (price_cents, is_for_sale, display_order, sale_ends_at) and
// is the single source of truth for what's on sale and at what price — replacing
// the old hardcoded COHORT_PRODUCTS in lib/pricing.ts and the cohort arrays in
// the landing/loja pages.
//
// Server-only: uses the service-role admin client (storefront data is public, so
// this also sidesteps RLS for now — public-read policies come in a later step).
// Never import this from client code.

// Format centavos as Brazilian currency. 399000 -> "R$ 3.990";
// 399050 -> "R$ 3.990,50". Mirrors fmtBRL in checkout-client.tsx.
export function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// The promotional price only counts inside its window (lib/cohort-sale.ts), and the
// campaign label rides along for the price block ("BLACK FRIDAY").
const SALE_FIELDS = "sale_price_cents, sale_price_starts_at, sale_price_ends_at, sale_badge_label";
const PRODUCT_COLUMNS = `id, slug, name, price_cents, ${SALE_FIELDS}, display_order`;

// Storefront columns also pull test_date and the per-cohort MedHelp 60D unlock
// date (embedded from cohort_module_access) so the loja/landing cards can render
// the date-driven countdown + 60D status. Checkout/charge use PRODUCT_COLUMNS
// (no timing needed), so toCohortProduct coalesces the timing fields to null.
const SALE_COLUMNS =
  `id, slug, name, price_cents, ${SALE_FIELDS}, display_order, test_date, date_confirmed, ` +
  "cohort_module_access ( unlock_date, content_modules ( slug ) )";

type ModuleAccessRow = {
  unlock_date: string | null;
  content_modules: { slug: string } | { slug: string }[] | null;
};

type CohortRow = {
  id: number;
  slug: string;
  name: string;
  price_cents: number | null;
  sale_price_cents?: number | null;
  sale_price_starts_at?: string | null;
  sale_price_ends_at?: string | null;
  sale_badge_label?: string | null;
  display_order: number | null;
  test_date?: string | null;
  date_confirmed?: boolean | null;
  cohort_module_access?: ModuleAccessRow[] | null;
};

// The MedHelp 60D unlock date for this cohort, from the embedded
// cohort_module_access rows. Returns null when not fetched (PRODUCT_COLUMNS) or
// when the cohort has no 60D access row.
function extract60dUnlock(row: CohortRow): string | null {
  for (const a of row.cohort_module_access ?? []) {
    const cm = Array.isArray(a.content_modules) ? a.content_modules[0] : a.content_modules;
    if (cm?.slug === "medhelp-60d") return a.unlock_date ?? null;
  }
  return null;
}

function toCohortProduct(row: CohortRow): CohortProduct {
  // is_for_sale rows always have a price (enforced by the
  // cohorts_for_sale_needs_price CHECK constraint), but coalesce defensively.
  const base = row.price_cents ?? 0;
  // A sale is on when a valid promo price is set (non-negative, strictly below the base —
  // the cohorts_sale_price_below_base CHECK enforces the same) AND its campaign window is
  // open right now (lib/cohort-sale.ts; NULL bounds = open). The sale price then becomes
  // the effective price everywhere — including the charge, which reads priceCents — with
  // the base shown struck through. Outside the window the turma is simply back at its
  // normal price: Black Friday ends on its own, with no one touching the row.
  const sale = activeSalePriceCents(row);
  const onSale = sale != null;
  const effective = onSale ? sale : base;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    priceCents: effective,
    priceLabel: formatBRL(effective),
    compareAtPriceCents: onSale ? base : null,
    compareAtPriceLabel: onSale ? formatBRL(base) : null,
    isOnSale: onSale,
    discountPercent: onSale ? discountPercentOf(base, effective) : null,
    savingsLabel: onSale ? `Economize ${formatBRL(base - effective)}` : null,
    saleBadgeLabel: onSale ? (row.sale_badge_label?.trim() || null) : null,
    saleEndsAt: onSale ? (row.sale_price_ends_at ?? null) : null,
    displayOrder: row.display_order ?? 0,
    testDate: row.test_date ?? null,
    unlock60dDate: extract60dUnlock(row),
    dateConfirmed: row.date_confirmed ?? false,
  };
}

// All cohorts currently for sale, ordered for storefront display. A cohort is
// purchasable when it's a live entity (active), flagged for sale, and either has
// no auto-close date or that date hasn't passed.
export const getCohortsForSale = cache(async (): Promise<CohortProduct[]> => {
  if (USE_MOCK_DATA) {
    return [...MOCK_COHORT_PRODUCTS].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("cohorts")
    .select(SALE_COLUMNS)
    .eq("active", true)
    .eq("is_for_sale", true)
    .or(`sale_ends_at.is.null,sale_ends_at.gt.${new Date().toISOString()}`)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as CohortRow[]).map(toCohortProduct);
});

// All cohorts (regardless of sale status), minimal shape — for admin pickers
// like coupon cohort-scoping, where you may target a turma that isn't on sale.
export const getAllCohortsBasic = cache(
  async (): Promise<{ id: number; slug: string; name: string }[]> => {
    if (USE_MOCK_DATA) {
      return MOCK_COHORT_PRODUCTS.map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("cohorts")
      .select("id, slug, name")
      .order("display_order")
      .order("id");
    if (error) throw error;
    return (data ?? []) as { id: number; slug: string; name: string }[];
  },
);

// One cohort by slug, but only if it's currently purchasable (same rule as
// above). Returns null otherwise — checkout and the charge route use this null
// as the "reject non-saleable slug" gate.
export const getCohortProduct = cache(
  async (slug: string): Promise<CohortProduct | null> => {
    if (USE_MOCK_DATA) {
      return MOCK_COHORT_PRODUCTS.find((c) => c.slug === slug) ?? null;
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("cohorts")
      .select(PRODUCT_COLUMNS)
      .eq("slug", slug)
      .eq("active", true)
      .eq("is_for_sale", true)
      .or(`sale_ends_at.is.null,sale_ends_at.gt.${new Date().toISOString()}`)
      .maybeSingle();

    if (error || !data) return null;
    return toCohortProduct(data as CohortRow);
  },
);
