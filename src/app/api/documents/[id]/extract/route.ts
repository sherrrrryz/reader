import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/pdf/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]/extract">) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, user_id, storage_path, extraction_status")
    .eq("id", id)
    .single();
  if (docErr || !doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (doc.user_id !== auth.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await supabase.from("documents").update({ extraction_status: "processing" }).eq("id", id);

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from("pdfs")
      .download(doc.storage_path);
    if (dlErr || !blob) throw dlErr ?? new Error("download_failed");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const { pages, pageCount, needsOcr } = await extractPdfText(bytes);
    let finalPages: { pageNumber: number; text: string }[] = pages;
    let ocrUsed = false;
    let augmentedPath: string | null = null;

    if (needsOcr && process.env.ENABLE_OCR === "1") {
      try {
        const { ocrPdf } = await import("@/lib/pdf/ocr");
        const ocrPages = await ocrPdf(bytes);
        finalPages = ocrPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
        ocrUsed = true;

        // Stamp an invisible text layer onto the original PDF so the client
        // can select OCR'd words exactly where they appear on the scan.
        try {
          const { injectInvisibleTextLayer } = await import("@/lib/pdf/inject-text-layer");
          const augmented = await injectInvisibleTextLayer(bytes, ocrPages);
          const path = `${doc.storage_path}.augmented.pdf`;
          const up = await supabase.storage
            .from("pdfs")
            .upload(path, augmented, { contentType: "application/pdf", upsert: true });
          if (!up.error) augmentedPath = path;
          else console.warn("augmented upload failed", up.error);
        } catch (e) {
          console.warn("text-layer injection failed", e);
        }
      } catch (e) {
        console.warn("OCR fallback failed", e);
      }
    }

    if (finalPages.length > 0) {
      const rows = finalPages.map((p) => ({
        document_id: id,
        user_id: auth.user!.id,
        page_number: p.pageNumber,
        text_content: p.text,
      }));
      await supabase.from("document_pages").delete().eq("document_id", id);
      const { error: insErr } = await supabase.from("document_pages").insert(rows);
      if (insErr) throw insErr;
    }

    await supabase
      .from("documents")
      .update({
        page_count: pageCount,
        ocr_used: ocrUsed,
        augmented_storage_path: augmentedPath,
        extraction_status: "done",
        extraction_error: null,
      })
      .eq("id", id);
    return NextResponse.json({ ok: true, pageCount, ocrUsed, augmented: !!augmentedPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("documents")
      .update({ extraction_status: "error", extraction_error: msg })
      .eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
