import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/documents/[id]/notes/[noteId]">,
) {
  const { noteId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { body?: unknown };
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "empty_body" }, { status: 400 });

  const { data, error } = await supabase
    .from("document_notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .select("id, document_id, body, created_at, updated_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ note: data });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/documents/[id]/notes/[noteId]">,
) {
  const { noteId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("document_notes").delete().eq("id", noteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
