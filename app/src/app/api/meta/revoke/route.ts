import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Withdrawal of advertising consent — server half (Karina 2026-11-09, item 4).
//
// A Purchase is sent later, by PagBank's confirmation, from the Meta context
// frozen on the order / subscription at checkout (lib/meta/capi.ts). When the
// person presses "Recusar", that frozen context is deleted, so a payment still
// pending (a Pix paid tomorrow, a first ClinAct charge being retried) can no
// longer produce a Purchase. Payments, access and subscriptions are untouched:
// only the `meta_capi` column is cleared.
//
// Scope = the signed-in person's OWN rows, all of them (a paid order's context
// has already done its job, and keeping a stored IP / browser id for Meta after
// a withdrawal would serve nothing). Nobody signed in → { signedIn: false }; the
// browser remembers it and calls again at the next sign-in.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Same-site only: the page's own fetch always sends Origin.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ signedIn: false }, { status: 403 });
  }

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return NextResponse.json({ signedIn: false });

  const admin = createAdminClient();
  const [orders, subs] = await Promise.all([
    admin.from("orders").update({ meta_capi: null }).eq("user_id", userId).not("meta_capi", "is", null),
    admin.from("clinact_subscriptions").update({ meta_capi: null }).eq("user_id", userId).not("meta_capi", "is", null),
  ]);
  if (orders.error || subs.error) {
    console.error("meta revoke: cleanup failed", userId, orders.error ?? subs.error);
    // Not signedIn → the browser keeps the pending flag and retries later.
    return NextResponse.json({ signedIn: false }, { status: 500 });
  }
  return NextResponse.json({ signedIn: true });
}
