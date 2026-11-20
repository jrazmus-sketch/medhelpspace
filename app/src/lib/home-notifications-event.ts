/**
 * The home Notificações box and the bell live in different parts of the page (dashboard body vs. header). When one of
 * them hides or restores the box, it tells the other through this window event so both agree at once, without a
 * reload. Client-safe, no imports.
 */
export const HOME_NOTIFICATIONS_EVENT = "mhs:home-notifications";

export function announceHomeNotifications(hidden: boolean) {
  window.dispatchEvent(new CustomEvent(HOME_NOTIFICATIONS_EVENT, { detail: { hidden } }));
}

export function onHomeNotifications(cb: (hidden: boolean) => void): () => void {
  const handler = (e: Event) => cb(Boolean((e as CustomEvent<{ hidden: boolean }>).detail?.hidden));
  window.addEventListener(HOME_NOTIFICATIONS_EVENT, handler);
  return () => window.removeEventListener(HOME_NOTIFICATIONS_EVENT, handler);
}
