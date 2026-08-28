import { requireProductAccess } from "@/lib/clinact/access";
import { ClinactShell } from "@/components/clinact/clinact-shell";

export const metadata = { title: { template: "%s | ClinAct", default: "ClinAct" } };
export const dynamic = "force-dynamic";

// The ClinAct member area. Outside /app on purpose (§1): that layout requires
// an active cohort membership, which a ClinAct subscriber usually lacks. One
// gate here; admins bypass (so preview links work for content admins).
export default async function ClinactMemberLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = await requireProductAccess("clinact");
  return <ClinactShell isAdmin={isAdmin}>{children}</ClinactShell>;
}
