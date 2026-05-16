import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/writings/[id]/versions/[vid]/comments">,
) {
  const { vid } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    range_start?: unknown;
    range_end?: unknown;
    selected_text?: unknown;
    body?: unknown;
  };

  const range_start = typeof body.range_start === "number" ? body.range_start : null;
  const range_end = typeof body.range_end === "number" ? body.range_end : null;
  const selected_text = typeof body.selected_text === "string" ? body.selected_text : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";

  if (range_start === null || range_end === null || range_end < range_start) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "empty_body" }, { status: 400 });

  const { data, error } = await supabase
    .from("writing_comments")
    .insert({
      version_id: vid,
      user_id: auth.user.id,
      range_start,
      range_end,
      selected_text,
      body: text,
    })
    .select("id, version_id, range_start, range_end, selected_text, body, created_at, updated_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  return NextResponse.json({ comment: data });
}
