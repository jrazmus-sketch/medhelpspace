import { MemberHeader } from "@/components/layout/member-header";
import { MemberFooter } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { AdminBarServer } from "@/components/layout/admin-bar-server";

export const metadata = { title: { template: "%s | MedHelpSpace", default: "Dashboard" } };

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background [overflow-x:clip]">
      <div className="sticky top-0 z-50">
        <AdminBarServer />
        <MemberHeader />
      </div>
      {/* pb-16 reserves space above the fixed mobile bottom nav */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <MemberFooter className="hidden md:block" />
      <MobileNav />
    </div>
  );
}
