import { getClinactViewer } from "@/lib/clinact/access";
import { ClinactShell } from "@/components/clinact/clinact-shell";

export const metadata = { title: { template: "%s | ClinAct", default: "ClinAct" } };
export const dynamic = "force-dynamic";

// The ClinAct member area. Outside /app on purpose (§1): that layout requires
// an active cohort membership, which a ClinAct subscriber usually lacks.
//
// Since the free-samples change (Karina 2026-08-31) the layout only requires a
// LOGIN — each page decides what the viewer can open: free cases for anyone
// signed in, everything else behind the subscription.
export default async function ClinactMemberLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getClinactViewer();
  return <ClinactShell isAdmin={viewer.isAdmin}>{children}</ClinactShell>;
}
