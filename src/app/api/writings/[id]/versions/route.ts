import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Create a new version (used when saving an edit that would clobber existing comments).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/writings/[id]/versions">) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { content?: unknown };
  const content = typeof body.content === "string" ? body.content : null;
  if (content === null) return NextResponse.json({ error: "invalid_content" }, { status: 400 });

  const { data: latest, error: latestErr } = await supabase
    .from("writing_versions")
    .select("version_number")
    .eq("writing_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) return NextResponse.json({ error: latestErr.message }, { status: 500 });

  const nextNumber = (latest?.version_number ?? 0) + 1;

  const { data: version, error: insertErr } = await supabase
    .from("writing_versions")
    .insert({
      writing_id: id,
      user_id: auth.user.id,
      content,
      version_number: nextNumber,
    })
    .select("id, writing_id, content, version_number, created_at")
    .single();
  if (insertErr || !version) {
    return NextResponse.json({ error: insertErr?.message ?? "insert_failed" }, { status: 500 });
  }

  await supabase
    .from("writings")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ version });
}
