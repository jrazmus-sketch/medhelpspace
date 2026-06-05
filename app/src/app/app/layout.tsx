import { MemberHeader } from "@/components/layout/member-header";
import { MemberFooter } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AdminBarServer } from "@/components/layout/admin-bar-server";
import { NotificationBellServer } from "@/components/layout/notification-bell-server";
import { get60dAccess } from "@/lib/medhelp-60d";
import { requireActiveMembership } from "@/lib/membership-gate";

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

  return (
    <div className="flex min-h-screen flex-col bg-background [overflow-x:clip]">
      <div className="sticky top-0 z-50">
        <AdminBarServer />
        <MemberHeader bellSlot={<NotificationBellServer />} show60d={show60d} />
      </div>
      {/* pb-16 reserves space above the fixed mobile bottom nav */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <MemberFooter className="hidden md:block" />
      <MobileNav show60d={show60d} />
    </div>
  );
}
