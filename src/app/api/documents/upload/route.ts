import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { runExtraction } from "@/lib/pdf/run-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 50 * 1024 * 1024;

function err(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return err("unauthorized", 401);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return err("no_file", 400);
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return err("not_pdf", 400);
  }
  if (file.size === 0) return err("empty_file", 400);
  if (file.size > MAX_PDF_BYTES) return err("too_large", 400);

  const userId = auth.user.id;
  const id = crypto.randomUUID();
  const storagePath = `${userId}/${id}.pdf`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("pdfs")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr) {
    console.error("storage upload failed", upErr);
    return err("storage_failed", 500);
  }

  const title = file.name.replace(/\.pdf$/i, "");
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
