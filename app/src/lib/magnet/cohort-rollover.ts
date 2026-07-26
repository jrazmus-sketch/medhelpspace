import { createAdminClient } from "@/lib/supabase/admin";
import { UNDECIDED_COHORT } from "@/lib/magnet/links";

// Cohort intelligence shared by the lead funnels: one read of the `cohorts` table
// turned into everything the drip needs to know about a lead's target turma, plus
// the post-exam rollover rule.
//
// WHY THIS EXISTS: before it, the drip knew a lead's turma only as a string. It
// could not tell an exam that is 200 days away from one that happened last week,
// so a lead whose exam had already passed kept receiving preparation mail for it
// forever. Nothing in the funnel prevented that.

export type CohortInfo = {
  slug: string;
  name: string;
  testDate: string | null;
  isForSale: boolean;
  active: boolean;
  dateConfirmed: boolean;
};

export type CohortDirectory = Map<string, CohortInfo>;

// Every cohort, keyed by slug — not filtered by active/is_for_sale, because the
// drip must be able to describe the turma a lead is ALREADY on even after it
// leaves the storefront (that is exactly the 2026.2 case).
export async function loadCohortDirectory(): Promise<CohortDirectory> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cohorts")
    .select("slug, name, test_date, is_for_sale, active, date_confirmed")
    .order("test_date", { ascending: true });

  const dir: CohortDirectory = new Map();
  if (error || !data) return dir;

  for (const c of data) {
    dir.set(c.slug as string, {
      slug: c.slug as string,
      name: (c.name as string) ?? (c.slug as string),
      testDate: (c.test_date as string | null) ?? null,
      isForSale: c.is_for_sale === true,
      active: c.active === true,
      dateConfirmed: c.date_confirmed === true,
    });
  }
  return dir;
}

// What the drip assumes about a turma it cannot find. Unknown slugs are legacy
// or hand-entered rows; treating them as sellable-with-no-date keeps the lead in
// the sequence with generic copy instead of silently suppressing them forever.
const UNKNOWN_COHORT: Omit<CohortInfo, "slug"> = {
  name: "",
  testDate: null,
  isForSale: true,
  active: true,
  dateConfirmed: false,
};

export function cohortInfoFor(dir: CohortDirectory, slug: string | null): CohortInfo {
  const key = slug ?? UNDECIDED_COHORT;
  const found = dir.get(key);
  if (found) return found;
  // 'undecided' is a sentinel, not a turma: no date, and sales are allowed
  // because checkout sends them to /loja to pick one.
  return { slug: key, ...UNKNOWN_COHORT };
}

// ── Target-turma validation ──────────────────────────────────────────────────
//
// Replaces the hardcoded VALID_TARGET_COHORTS allowlist at every capture point.
// That Set (and the CHECK constraint that mirrored it) meant the day a new turma
// was added in the admin panel, every funnel silently rejected leads who picked
// it and filed them under the fallback turma instead — a segmentation bug that
// only surfaces months later as mail about the wrong exam.
//
// 'undecided' is a sentinel rather than a turma, so it is allowed explicitly.
export async function isValidTargetCohort(slug: string | null | undefined): Promise<boolean> {
  const s = (slug ?? "").trim();
  if (!s) return false;
  if (s === UNDECIDED_COHORT) return true;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cohorts")
    .select("slug")
    .eq("slug", s)
    .eq("active", true)
    .maybeSingle();
  return !error && data != null;
}

export async function resolveTargetCohort(
  slug: string | null | undefined,
  fallback: string,
): Promise<string> {
  return (await isValidTargetCohort(slug)) ? (slug as string).trim() : fallback;
}

// The turma a lead rolls onto once their own exam has passed: the SOONEST active
// turma still in the future, regardless of whether it is on sale. Sale state is
// not a tiebreaker here — a candidate who just sat the September exam is sitting
// the next one, not the one after it, and the suppression rule already stops us
// selling a closed turma. Getting the timing right matters more than getting a
// checkout link in front of them.
export function pickRolloverCohort(dir: CohortDirectory, today: string): CohortInfo | null {
  const future = [...dir.values()]
    .filter((c) => c.active && c.testDate != null && c.testDate.slice(0, 10) > today)
    .sort((a, b) => (a.testDate! < b.testDate! ? -1 : 1));
  return future[0] ?? null;
}
