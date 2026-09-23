import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { applyDueRolloverFor } from "@/lib/cohort-promotions";

// Who is viewing, answered ONCE per request.
//
// Every /app render used to ask the same questions three or four times over: the
// layout's membership gate, get60dAccess(), the layout's own getUser(), then the
// page's gate again — each asking Supabase Auth "who is this?" (a network round
// trip) and re-reading the profile and the membership (Justin, 2026-09-23: slow
// links). React's cache() memoizes per server request, so the first caller pays
// and every later caller in the same render gets the same answer for free.
// A new request (the next click) always asks again — nothing is shared between
// requests or between users.

export const ADMIN_ROLES = ["super_admin", "content_admin", "support_admin", "billing_admin"];

/** The signed-in user, validated with Supabase Auth (getUser, not getSession). */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The viewer's profile role, or null when signed out. */
export const getViewerRole = cache(async (): Promise<string | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return (data?.role as string | undefined) ?? null;
});

export async function isViewerStaff(): Promise<boolean> {
  return ADMIN_ROLES.includes((await getViewerRole()) ?? "");
}

/**
 * Does the viewer hold an active cohort membership? Includes the launch-condition
 * fallback: a buyer whose first turma just closed is moved onto the next one here
 * if the daily rollover cron was missed, instead of being sent to the store.
 */
export const viewerHasActiveMembership = cache(async (): Promise<boolean> => {
  const user = await getAuthUser();
  if (!user) return false;
  const supabase = await createClient();
  let { data: has } = await supabase.rpc("user_has_active_membership");
  if (!has && (await applyDueRolloverFor(user.id))) {
    ({ data: has } = await supabase.rpc("user_has_active_membership"));
  }
  return !!has;
});

/** Is a date-gated module (e.g. MedHelp 60D) open for the viewer's turma? */
export const viewerHasModuleAccess = cache(async (moduleId: number): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("user_has_module_access", { mod_id: moduleId });
  return !!data;
});
