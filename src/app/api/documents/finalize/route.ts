import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runExtraction } from "@/lib/pdf/run-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

function err(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

// Step 3 of the upload flow: the file is already in Supabase Storage (the
// browser uploaded it directly to bypass the Vercel 4.5MB body limit). Here we
// create the DB row and run extraction. If extraction throws, the row is left
// behind with extraction_status='error' so the user sees the failure state.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return err("unauthorized", 401);

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; filename?: unknown; storagePath?: unknown }
    | null;
  if (!body) return err("bad_request", 400);

  const id = typeof body.id === "string" ? body.id : "";
  const filename = typeof body.filename === "string" ? body.filename : "";
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  if (!id || !filename || !storagePath) return err("bad_request", 400);

  const userId = auth.user.id;
  // Path must live under the user's own folder. RLS would block cross-user
  // writes anyway, but checking here gives a clearer error.
  if (!storagePath.startsWith(`${userId}/`)) return err("forbidden", 403);

  const title = filename.replace(/\.pdf$/i, "");
  const { error: insErr, data: doc } = await supabase
    .from("documents")
    .insert({ id, user_id: userId, title, storage_path: storagePath, extraction_status: "pending" })
    .select("id")
    .single();
  if (insErr || !doc) {
    console.error("documents insert failed", insErr);
    // Roll back the orphan storage object so the bucket doesn't accumulate
    // unreferenced uploads.
    await supabase.storage.from("pdfs").remove([storagePath]).catch(() => {});
    return err("db_failed", 500);
  }

  try {
    await runExtraction(supabase, doc.id, userId, storagePath);
    return NextResponse.json({ id: doc.id, extraction: "done" });
  } catch (e) {
    // runExtraction already wrote extraction_status='error' to the row, so the
    // document is visible in the list with a failure state.
    console.error("inline extraction failed", { docId: doc.id, err: e });
    return NextResponse.json({ id: doc.id, extraction: "error" });
  }
}
