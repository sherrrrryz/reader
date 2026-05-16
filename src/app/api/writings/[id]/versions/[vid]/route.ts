import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// In-place content update — only safe when the version has no comments.
export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/writings/[id]/versions/[vid]">,
) {
  const { id, vid } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { content?: unknown };
  const content = typeof body.content === "string" ? body.content : null;
  if (content === null) return NextResponse.json({ error: "invalid_content" }, { status: 400 });

  // Refuse if comments exist — caller should POST a new version instead.
  const { count, error: countErr } = await supabase
    .from("writing_comments")
    .select("id", { count: "exact", head: true })
    .eq("version_id", vid);
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "has_comments" }, { status: 409 });
  }

  const { error } = await supabase
    .from("writing_versions")
    .update({ content })
    .eq("id", vid)
    .eq("writing_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("writings")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
