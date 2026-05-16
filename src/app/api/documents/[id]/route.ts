import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // augmented_storage_path column may not exist if migration 0002 isn't
  // applied — read it defensively, mirroring src/app/api/documents/[id]/file/route.ts.
  let augmentedPath: string | null = null;
  try {
    const { data: aug } = await supabase
      .from("documents")
      .select("augmented_storage_path")
      .eq("id", id)
      .single();
    augmentedPath = (aug as { augmented_storage_path?: string | null } | null)?.augmented_storage_path ?? null;
  } catch {}

  const paths = [doc.storage_path, augmentedPath].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from("pdfs").remove(paths);
    if (rmErr) console.error("storage remove failed", { id, rmErr });
  }

  const { error: delErr } = await supabase.from("documents").delete().eq("id", id);
  if (delErr) {
    console.error("documents delete failed", { id, delErr });
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
