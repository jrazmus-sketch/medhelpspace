import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pageId } = await request.json();
  if (!pageId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ last_page_id: pageId, last_page_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
