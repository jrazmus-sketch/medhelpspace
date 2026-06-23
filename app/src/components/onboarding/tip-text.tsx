"use client";

import { useEditMode } from "@/providers/edit-mode-provider";
import { useOnboarding } from "@/providers/onboarding-provider";
import { EditableText } from "@/components/admin/editable-text";
import { Emphasis } from "./emphasis";

/**
 * A single editable onboarding string. Reads its current value from the
 * `site_content` map carried by OnboardingProvider (`onboarding.<tip>.<field>`),
 * falling back to the hardcoded TIPS string before the row is seeded.
 *
 * - Display (edit mode off / non-admin / mobile, OR `editable={false}`):
 *   renders <Emphasis> so the **bold** / *italic* markers in the copy show as
 *   real formatting.
 * - Edit mode on (admin, desktop) + a DB row exists: renders the inline
 *   EditableText input (raw text incl. the ** markers), saving to
 *   site_content.value via the shared updateScalarField action.
 *
 * `editable={false}` keeps a string DB-backed (reflects edits) but never
 * in-place editable — used on the brand-colored welcome card, where the editor's
 * light input background would clash with the inherited white text. Those
 * strings are edited from the guide page (/app/comecar) instead, on a normal
 * background.
 */
export function TipText({
  k,
  fallback,
  as = "span",
  className,
  multiline,
  tone,
  editable = true,
}: {
  /** site_content key, e.g. `onboarding.quiz.body`. */
  k: string;
  /** Hardcoded fallback (the TIPS default) shown until the row is seeded. */
  fallback: string;
  as?: "span" | "div";
  className?: string;
  multiline?: boolean;
  tone?: "default" | "inherit";
  editable?: boolean;
}) {
  const { content } = useOnboarding();
  const { active } = useEditMode();
  const row = content[k];
  const value = row?.value || fallback;

  if (editable && active && row) {
    return (
      <EditableText
        variant="plain"
        table="site_content"
        id={row.id}
        field="value"
        value={value}
        as={as}
        className={className}
        multiline={multiline}
      />
    );
  }

  const Tag = as;
  return (
    <Tag className={className}>
      <Emphasis text={value} tone={tone} />
    </Tag>
  );
}
