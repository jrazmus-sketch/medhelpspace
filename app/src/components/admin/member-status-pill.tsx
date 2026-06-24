"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import type { MembershipStatus } from "@/lib/admin/member-detail";

// Single source of truth for how a membership status is coloured + labelled,
// shared by the members table/cards and the detail drawer header.
const STATUS_STYLE: Record<MembershipStatus, string> = {
  active: "bg-green-500/15 text-green-700 dark:text-green-400",
  expiring: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  expired: "bg-red-500/15 text-red-700 dark:text-red-400",
  scheduled: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  none: "bg-surface-2 text-muted-foreground",
};

const STATUS_KEY: Record<MembershipStatus, string> = {
  active: "members.statusActive",
  expiring: "members.statusExpiring",
  expired: "members.statusExpired",
  scheduled: "members.statusScheduled",
  none: "members.statusNone",
};

export function StatusPill({ status }: { status: MembershipStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {t(STATUS_KEY[status])}
    </span>
  );
}
