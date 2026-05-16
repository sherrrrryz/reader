import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_NAME = 32;

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/tags/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const raw = typeof body.name === "string" ? body.name.trim() : "";
  if (!raw || raw.length > MAX_NAME) return NextResponse.json({ error: "invalid_name" }, { status: 400 });

  const { data, error } = await supabase
    .from("tags")
    .update({ name: raw })
    .eq("id", id)
    .select("id, name, created_at")
    .single();
  if (error) {
    // Unique-violation = name collides with another existing tag.
    if (error.code === "23505") return NextResponse.json({ error: "name_taken" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ tag: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/tags/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
