import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { updateOwnCard } from "@/lib/clinact/subscription-manage";

// The subscriber replaces the card on their own subscription. Accepts only the
// card encrypted in their browser — no number, and no CVV either: PagBank's
// PUT billing_info takes the encrypted blob alone.
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

  let body: { encryptedCard?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!body.encryptedCard) {
    return NextResponse.json({ error: "Dados do cartão não recebidos." }, { status: 400 });
  }

  const result = await updateOwnCard(user.id, body.encryptedCard);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
