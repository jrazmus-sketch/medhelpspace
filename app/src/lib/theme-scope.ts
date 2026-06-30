/**
 * Theme scoping.
 *
 * The public-facing surface (marketing landing, /loja, /checkout, auth, legal,
 * /suporte, etc.) is locked to DARK mode: it's designed dark-first and its
 * marketing screenshots are dark-only, so light mode there has no "wow factor"
 * and would need a second set of light screenshots that aren't worth producing.
 *
 * Only the authenticated product zones (`/app`, `/admin`) honor the user's
 * light / dark / system preference, where long study/admin sessions justify the
 * choice and every surface is real themed components (no static screenshots).
 *
 * NOTE: the same rule is duplicated in `public/theme-init.js` — the pre-hydration
 * flash-prevention script, which is plain static JS and cannot import this module.
 * Keep the two in sync if the boundary ever changes.
 */
export function isThemeUnlockedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}
