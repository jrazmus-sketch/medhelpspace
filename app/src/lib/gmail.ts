// Consumer-Gmail detection, used to decide whether a confirmation screen should
// warn about the Promotions tab. Lives in lib/ rather than beside the component
// because node --test strips types but cannot parse JSX — a helper inside a .tsx
// is a helper that cannot be unit-tested.

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * True when the address is a consumer Gmail mailbox.
 *
 * Safe to call with a MASKED address ("j****@gmail.com") — masking only ever
 * replaces the local part, so the domain survives and several call sites only
 * ever hold the masked form.
 *
 * Google Workspace accounts on a custom domain read as false: they are
 * indistinguishable from any other domain here. That is the right trade — those
 * inboxes usually have tabs turned off by their admin anyway, and a false positive
 * costs more than a false negative (it tells someone to open a tab they don't have).
 */
export function isGmailAddress(email: string | null | undefined): boolean {
  const value = email ?? "";
  const at = value.lastIndexOf("@");
  if (at < 0) return false;
  return GMAIL_DOMAINS.has(value.slice(at + 1).trim().toLowerCase());
}
