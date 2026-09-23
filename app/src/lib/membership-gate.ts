import { redirect } from "next/navigation";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import {
  getAuthUser,
  isViewerStaff,
  viewerHasActiveMembership,
  viewerHasModuleAccess,
} from "@/lib/viewer";

// The answers (who is this, which role, is there a membership) come from
// lib/viewer.ts, memoized per request: the /app layout and the page both call
// requireActiveMembership(), and get60dAccess() asks the same questions — they
// now share one round trip each instead of repeating them.

/**
 * Returns true if the current viewer holds any admin role. Used to gate
 * draft-page visibility: the member-facing content route reads pages with the
 * service-role client (RLS bypassed), so the `status='publish'` filter that RLS
 * would normally apply has to be re-checked in app code — admins see drafts,
 * members never do, even via a direct URL.
 */
export async function isViewerAdmin(): Promise<boolean> {
  if (USE_MOCK_DATA) return true;
  if (!(await getAuthUser())) return false;
  return isViewerStaff();
}

/**
 * Call this at the top of any content server component that should require
 * an active cohort membership. Admins bypass the gate entirely.
 * No active membership → /loja (the store) so the visitor can buy access.
 * An unlocked-but-not-yet-available module → /app/acesso-encerrado (the user
 * IS a member; the 60D module just hasn't opened yet).
 * Pass contentModuleId to also enforce module-level access (e.g. MedHelp 60D).
 */
export async function requireActiveMembership(contentModuleId?: number | null) {
  if (USE_MOCK_DATA) return;

  const user = await getAuthUser();
  if (!user) redirect("/login");

  if (await isViewerStaff()) return;

  // Includes the launch-condition rollover fallback (see lib/viewer.ts).
  if (!(await viewerHasActiveMembership())) redirect("/loja");

  if (contentModuleId) {
    // The buyer is a member, so this lives inside the /app layout (no redirect loop).
    if (!(await viewerHasModuleAccess(contentModuleId))) {
      redirect("/app/acesso-encerrado?motivo=modulo-bloqueado");
    }
  }
}
