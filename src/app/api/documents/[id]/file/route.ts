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

  // Prefer the OCR-augmented copy when it exists so the client gets a PDF
  // with a real text layer (selectable / searchable). Column may not exist
  // yet if the 0002 migration hasn't been applied — fall back silently.
  let augmentedPath: string | null = null;
  try {
    const { data: aug } = await supabase
      .from("documents")
      .select("augmented_storage_path")
      .eq("id", id)
      .single();
    augmentedPath = (aug as { augmented_storage_path?: string | null } | null)?.augmented_storage_path ?? null;
  } catch {}
  const path = augmentedPath ?? doc.storage_path;
  const { data: blob, error } = await supabase.storage.from("pdfs").download(path);
  if (error || !blob) return NextResponse.json({ error: "download_failed" }, { status: 500 });

  return new Response(blob.stream(), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "private, max-age=300" },
  });
}
