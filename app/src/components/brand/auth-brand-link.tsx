import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-lockup";

/**
 * The logo in the header of the shared auth screens (signup, login, password
 * recovery). From ClinAct it reads "MedHelpSpace | ClinAct" and goes back to the
 * ClinAct page; otherwise it is the Revalida lockup linking home.
 */
export function AuthBrandLink({ clinact }: { clinact: boolean }) {
  return clinact ? (
    <Link href="/clinact" aria-label="MedHelpSpace ClinAct — início" className="flex items-center hover:opacity-80">
      <BrandLockup product="clinact" />
    </Link>
  ) : (
    <Link href="/" aria-label="MedHelpSpace Revalida — início" className="flex items-center hover:opacity-80">
      <BrandLockup />
    </Link>
  );
}
