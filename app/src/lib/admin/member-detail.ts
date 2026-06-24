// Shared types for the admin Members view + detail drawer.
//
// This file holds ONLY types (no runtime exports), so it is safe to import from
// both the "use server" actions module (app/src/actions/admin.ts) and the
// "use client" drawer component. Keeping these out of admin.ts avoids the
// "use server only exports async functions" footgun — a value/type re-export
// from a Server Actions module compiles to a runtime re-export and crashes /app.

// Membership lifecycle derived from the user's cohort window (computed server-side
// in the members page, so the table can colour the Status pill without per-row work).
export type MembershipStatus =
  | "active" // inside the membership window
  | "expiring" // active, but ends within EXPIRING_SOON_DAYS
  | "expired" // window has passed
  | "scheduled" // window hasn't started yet
  | "none"; // no cohort assigned

// Active/expiring memberships are flagged "expiring" when they end this soon.
export const EXPIRING_SOON_DAYS = 14;

// One row of the members list, built server-side in the members page and passed
// to the client table/cards and (as the drawer header) to the detail drawer.
export type MemberListRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
  cohort_id: number | null;
  cohortName: string | null;
  membershipStartsAt: string | null;
  membershipEndsAt: string | null;
  status: MembershipStatus;
  lastActiveAt: string | null;
  lifetimePaidCents: number;
};

export type MemberOrder = {
  id: string;
  amountCents: number;
  status: string;
  paymentMethod: string;
  ccBrand: string | null;
  ccInstallments: number | null;
  createdAt: string;
  cohortName: string;
};

export type MemberEmail = {
  id: number;
  kind: string;
  sentAt: string;
};

export type MemberCompletion = {
  lessonsTotal: number;
  lessonsDone: number;
  quizTotal: number;
  quizDone: number;
  flashTotal: number;
  flashDone: number;
};

export type MemberFiscal = {
  firstName: string | null;
  lastName: string | null;
  cpf: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
};

// Returned by the getMemberDetail server action and lazy-loaded when the drawer
// opens. Billing-sensitive sections (orders, lifetime paid, fiscal identity) are
// only populated when the calling admin holds a billing/super role.
export type MemberDetail = {
  userId: string;
  canSeeBilling: boolean;
  // Viewer holds a member-access role (super/support/billing) and can run the
  // member-management actions in the drawer (e.g. resend the welcome email).
  // content_admin opens the drawer read-only.
  canManageAccess: boolean;
  completion: MemberCompletion | null;
  reviews: { total: number; due: number } | null;
  lifetimePaidCents: number;
  orders: MemberOrder[];
  emails: MemberEmail[];
  fiscal: MemberFiscal | null;
};
