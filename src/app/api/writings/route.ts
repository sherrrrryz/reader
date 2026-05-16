import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("writings")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ writings: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";

  const { data: writing, error: writingErr } = await supabase
    .from("writings")
    .insert({ user_id: auth.user.id, title })
    .select("id, title, created_at, updated_at")
    .single();
  if (writingErr || !writing) {
    return NextResponse.json({ error: writingErr?.message ?? "insert_failed" }, { status: 500 });
  }

  const { error: versionErr } = await supabase
    .from("writing_versions")
    .insert({ writing_id: writing.id, user_id: auth.user.id, content: "", version_number: 1 });
  if (versionErr) {
    await supabase.from("writings").delete().eq("id", writing.id);
    return NextResponse.json({ error: versionErr.message }, { status: 500 });
  }

  return NextResponse.json({ writing });
}
