import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "not_pdf" }, { status: 400 });
  }

  const userId = auth.user.id;
  const id = crypto.randomUUID();
  const storagePath = `${userId}/${id}.pdf`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("pdfs")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const title = file.name.replace(/\.pdf$/i, "");
  const { error: insErr, data: doc } = await supabase
    .from("documents")
    .insert({ id, user_id: userId, title, storage_path: storagePath, extraction_status: "pending" })
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Kick off extraction (await — small/medium PDFs only for v1)
  const origin = request.nextUrl.origin;
  fetch(`${origin}/api/documents/${doc!.id}/extract`, {
    method: "POST",
    headers: { cookie: request.headers.get("cookie") ?? "" },
  }).catch(() => {});

  return NextResponse.json({ id: doc!.id });
}
