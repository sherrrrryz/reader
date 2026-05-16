import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

function err(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

// Step 1 of the upload flow: the client asks the server for an upload slot.
// We do NOT receive the file here (the Vercel serverless body limit caps it at
// ~4.5MB). The browser uploads the file directly to Supabase Storage using the
// returned `storagePath`, then calls /api/documents/finalize to create the DB
// row and trigger extraction.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return err("unauthorized", 401);

  const body = (await request.json().catch(() => null)) as
    | { filename?: unknown; size?: unknown }
    | null;
  if (!body) return err("bad_request", 400);

  const filename = typeof body.filename === "string" ? body.filename : "";
  const size = typeof body.size === "number" ? body.size : -1;
  if (!filename || !filename.toLowerCase().endsWith(".pdf")) return err("not_pdf", 400);
  if (size <= 0) return err("empty_file", 400);
  if (size > MAX_PDF_BYTES) return err("too_large", 400);

  const userId = auth.user.id;
  const id = crypto.randomUUID();
  const storagePath = `${userId}/${id}.pdf`;

  return NextResponse.json({ id, storagePath });
}
