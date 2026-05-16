import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Attach a tag to a document. Body accepts { tagId } for an existing tag,
// or { name } to create-or-reuse a tag and attach it in one shot.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/documents/[id]/tags">) {
  const { id: documentId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tagId?: unknown; name?: unknown };

  // Confirm the document is visible to the user (RLS) before touching tags,
  // so we can return a clean 404 instead of a join-table foreign-key error.
  const { data: doc } = await supabase.from("documents").select("id").eq("id", documentId).single();
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let tagId: string | null = typeof body.tagId === "string" ? body.tagId : null;

  if (!tagId) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 32) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (existing) {
      tagId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("tags")
        .insert({ user_id: auth.user.id, name })
        .select("id")
        .single();
      if (createErr || !created) {
        return NextResponse.json({ error: createErr?.message ?? "tag_create_failed" }, { status: 500 });
      }
      tagId = created.id;
    }
  }

  const { error: linkErr } = await supabase
    .from("document_tags")
    .insert({ document_id: documentId, tag_id: tagId, user_id: auth.user.id });
  // 23505 = already attached. Treat as success for idempotency.
  if (linkErr && linkErr.code !== "23505") {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tagId });
}
