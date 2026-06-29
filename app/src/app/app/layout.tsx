import { MemberHeader } from "@/components/layout/member-header";
import { MemberFooter } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AdminBarServer } from "@/components/layout/admin-bar-server";
import { NotificationBellServer } from "@/components/layout/notification-bell-server";
import { CopyGuard } from "@/components/layout/copy-guard";
import { OnboardingProvider } from "@/providers/onboarding-provider";
import { getOnboardingContent } from "@/lib/queries/onboarding-content";
import { get60dAccess } from "@/lib/medhelp-60d";
import { requireActiveMembership } from "@/lib/membership-gate";
import { createClient } from "@/lib/supabase/server";
import { getDueReviewCount } from "@/lib/review/queries";
import { getSiteCompletion } from "@/lib/progress/site-completion";
import { getMyUnreadSupportCount } from "@/lib/support-data";

export const metadata = { title: { template: "%s | MedHelpSpace", default: "Dashboard" } };

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  // Single choke point for the whole member area. Unauthenticated → /login,
  // logged-in non-members → /loja, admins bypass. Individual content pages keep
  // their own requireActiveMembership() calls as defense-in-depth (and for the
  // module-level 60D check). Note: /app/acesso-encerrado renders inside this
  // layout, but it's only reached by actual members (module-locked case), so the
  // membership check here passes and there's no redirect loop.
  await requireActiveMembership();

  const { unlocked: show60d } = await get60dAccess();

  // Review due-count for the nav badge (re-evaluated per navigation).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [reviewDueCount, completion, supportUnreadCount] = await Promise.all([
    user ? getDueReviewCount(user.id) : Promise.resolve(0),
    // In mock mode the id is ignored (returns sample data); in real mode a member
    // is always present here because requireActiveMembership() ran first.
    getSiteCompletion(user?.id ?? "mock"),
    user ? getMyUnreadSupportCount(user.id) : Promise.resolve(0),
  ]);

  // Editable onboarding strings (site_content) — seeds the OnboardingProvider so
  // coachmarks + the guide render DB-backed, inline-editable copy.
  const onboardingContent = await getOnboardingContent();

  return (
    <OnboardingProvider content={onboardingContent}>
      <div className="no-copy flex min-h-screen flex-col bg-background [overflow-x:clip]">
        <CopyGuard />
        <div className="sticky top-0 z-50">
          <AdminBarServer />
          <MemberHeader bellSlot={<NotificationBellServer />} show60d={show60d} reviewDueCount={reviewDueCount} completion={completion} supportUnreadCount={supportUnreadCount} />
        </div>
        {/* pb-16 reserves space above the fixed bottom nav (shown below lg) */}
        <main className="flex-1 pb-16 lg:pb-0">{children}</main>
        <MemberFooter className="hidden lg:block" />
        <MobileNav show60d={show60d} reviewDueCount={reviewDueCount} />
      </div>
    </OnboardingProvider>
  );
}
