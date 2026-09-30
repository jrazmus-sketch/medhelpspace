"use client";

// A next/link that fires one GA4 event on click. For server components (the
// store page) that cannot attach handlers themselves. The navigation is never
// delayed or blocked: gtag queues the event and the browser moves on.

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackEvent } from "@/lib/analytics/track";

type Props = ComponentProps<typeof Link> & {
  event: string;
  params?: Record<string, unknown>;
};

export function TrackedLink({ event, params, onClick, ...rest }: Props) {
  return (
    <Link
      {...rest}
      onClick={(e) => {
        trackEvent(event, params ?? {});
        onClick?.(e);
      }}
    />
  );
}
