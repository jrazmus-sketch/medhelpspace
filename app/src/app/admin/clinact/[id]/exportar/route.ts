import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCaseDoc } from "@/lib/clinact/queries";
import { serializeCase } from "@/lib/clinact/serialize";

// Round-trip export (§3.3): the case in the exact format the importer reads.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["super_admin", "content_admin"].includes(profile.role as string)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { id } = await params;
  const doc = await getCaseDoc(Number(id));
  if (!doc) return new NextResponse("Not found", { status: 404 });
  const text = serializeCase(doc);
  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${doc.slug}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
