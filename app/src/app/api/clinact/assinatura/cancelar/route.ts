import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { cancelOwnSubscription } from "@/lib/clinact/subscription-manage";

// The subscriber cancels their own ClinAct subscription. No body: the
// subscription is found through the signed-in user's own row, so there is no
// id to pass and nothing to tamper with.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!checkRateLimit(getClientIp(request.headers))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um instante." }, { status: 429 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });

  const result = await cancelOwnSubscription(user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
