import type { ComponentProps } from "react";
import { SiteText } from "@/components/landing/site-text";
import { CLINACT_COPY, type ClinactCopyKey } from "@/lib/clinact/site-copy";

/**
 * An editable ClinAct string. Same as <SiteText>, but the key is typed against
 * CLINACT_COPY and the fallback comes from it — so a key can never exist in
 * the page without a seed (see lib/clinact/site-copy.ts for why that matters).
 */
export function ClinactText({ k, ...rest }: { k: ClinactCopyKey } & Omit<ComponentProps<typeof SiteText>, "k" | "fallback">) {
  return <SiteText k={k} fallback={CLINACT_COPY[k]} {...rest} />;
}
