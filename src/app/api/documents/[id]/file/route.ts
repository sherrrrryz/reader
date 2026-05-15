import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Streams the PDF bytes for a document the current user owns.
// Used by the in-browser react-pdf reader.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: doc } = await supabase
    .from("documents")
    .select("user_id, storage_path")
    .eq("id", id)
    .single();
  if (!doc || doc.user_id !== auth.user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: blob, error } = await supabase.storage.from("pdfs").download(doc.storage_path);
  if (error || !blob) return NextResponse.json({ error: "download_failed" }, { status: 500 });

  return new Response(blob.stream(), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "private, max-age=300" },
  });
}
