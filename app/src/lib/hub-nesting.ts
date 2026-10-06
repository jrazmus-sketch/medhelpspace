// Area level inside a specialty hub (Karina, 2026-10-06): Resumos → Outros →
// Oftalmologia / Otorrinolaringologia / Urologia → resumos. The area hubs are
// ordinary blurb-nav-hub pages of the same view + specialty whose parent_id is the
// specialty's hub. They are reached THROUGH that hub — never listed next to it.
//
// Pure (no Supabase import) so it can be unit-tested.

export type HubRow = { id: number | string; parent_id: number | string | null };

/** The hubs that are not nested inside another hub of the same list. */
export function topLevelHubs<T extends HubRow>(hubs: T[]): T[] {
  const ids = new Set(hubs.map((h) => String(h.id)));
  return hubs.filter((h) => h.parent_id == null || !ids.has(String(h.parent_id)));
}
