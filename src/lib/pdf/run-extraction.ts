import type { SupabaseClient } from "@supabase/supabase-js";
import { extractPdfText } from "./extract";

export type ExtractionResult = {
  pageCount: number;
  ocrUsed: boolean;
  augmented: boolean;
};

const EXTRACTION_TIMEOUT_MS = 55_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function runExtraction(
  supabase: SupabaseClient,
  docId: string,
  userId: string,
  storagePath: string,
): Promise<ExtractionResult> {
  await supabase.from("documents").update({ extraction_status: "processing" }).eq("id", docId);

  try {
    const result = await withTimeout(
      doExtract(supabase, docId, userId, storagePath),
      EXTRACTION_TIMEOUT_MS,
      "extraction",
    );
    await supabase
      .from("documents")
      .update({
        page_count: result.pageCount,
        ocr_used: result.ocrUsed,
        augmented_storage_path: result.augmented ? `${storagePath}.augmented.pdf` : null,
        extraction_status: "done",
        extraction_error: null,
      })
      .eq("id", docId);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("documents")
      .update({ extraction_status: "error", extraction_error: msg })
      .eq("id", docId);
    throw e;
  }
}

async function doExtract(
  supabase: SupabaseClient,
  docId: string,
  userId: string,
  storagePath: string,
): Promise<ExtractionResult> {
  const { data: blob, error: dlErr } = await supabase.storage.from("pdfs").download(storagePath);
  if (dlErr || !blob) throw dlErr ?? new Error("download_failed");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const { pages, pageCount, needsOcr } = await extractPdfText(bytes);
  let finalPages: { pageNumber: number; text: string }[] = pages;
  let ocrUsed = false;
  let augmented = false;

  if (needsOcr && process.env.ENABLE_OCR === "1") {
    try {
      const { ocrPdf } = await import("@/lib/pdf/ocr");
      const ocrPages = await ocrPdf(bytes);
      finalPages = ocrPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
      ocrUsed = true;

      try {
        const { injectInvisibleTextLayer } = await import("@/lib/pdf/inject-text-layer");
        const augmentedBytes = await injectInvisibleTextLayer(bytes, ocrPages);
        const path = `${storagePath}.augmented.pdf`;
        const up = await supabase.storage
          .from("pdfs")
          .upload(path, augmentedBytes, { contentType: "application/pdf", upsert: true });
        if (!up.error) augmented = true;
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
      document_id: docId,
      user_id: userId,
      page_number: p.pageNumber,
      text_content: p.text,
    }));
    await supabase.from("document_pages").delete().eq("document_id", docId);
    const { error: insErr } = await supabase.from("document_pages").insert(rows);
    if (insErr) throw insErr;
  }

  return { pageCount, ocrUsed, augmented };
}
