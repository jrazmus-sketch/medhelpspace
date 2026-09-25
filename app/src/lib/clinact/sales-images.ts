import { CLINACT_CDN_BASE } from "@/lib/clinact/types";

/**
 * The sales page's screenshot slots (her decision 4: replaceable from the
 * admin, no deploy). Each slot is one `site_content` row whose value is the
 * image URL — "an image slot is just another editable field". No row, no image:
 * the section simply renders without one, never an empty frame.
 *
 * Pure (no server imports) so the page, the admin and the tests share it.
 */
export const SALES_IMAGE_SLOTS = [
  { key: "clinact.casos.image", section: "casos" },
  { key: "clinact.evolucao.image", section: "evolucao" },
] as const;

export type SalesImageKey = (typeof SALES_IMAGE_SLOTS)[number]["key"];

export const SALES_IMAGE_PREFIX = "clinact/site";
export const SALES_IMAGE_EXT = ["jpg", "jpeg", "png", "webp"] as const;
export const SALES_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function isSalesImageKey(k: unknown): k is SalesImageKey {
  return SALES_IMAGE_SLOTS.some((s) => s.key === k);
}

/**
 * Only an image WE uploaded is rendered: our CDN, our folder, an image
 * extension. site_content is editable text, so a row edited by hand into
 * anything else (another host, a javascript: URL) renders nothing.
 */
export function isSalesImageUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const prefix = `${CLINACT_CDN_BASE}/${SALES_IMAGE_PREFIX}/`;
  if (!url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length);
  return /^[a-z0-9-]+\.(jpe?g|png|webp)$/.test(rest);
}
