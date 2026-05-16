import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/documents/[id]/tags/[tagId]">,
) {
  const { id: documentId, tagId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("document_tags")
    .delete()
    .eq("document_id", documentId)
    .eq("tag_id", tagId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
