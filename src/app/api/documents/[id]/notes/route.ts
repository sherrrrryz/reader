import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]/notes">) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("document_notes")
    .select("id, document_id, body, created_at, updated_at")
    .eq("document_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/documents/[id]/notes">) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { body?: unknown };
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "empty_body" }, { status: 400 });

  const { data, error } = await supabase
    .from("document_notes")
    .insert({ user_id: auth.user.id, document_id: id, body: text })
    .select("id, document_id, body, created_at, updated_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  return NextResponse.json({ note: data });
}
