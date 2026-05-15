/* eslint-disable @typescript-eslint/no-explicit-any */
// Server-side OCR fallback using tesseract.js.
// Called when extractPdfText reports needsOcr=true.
// Renders each PDF page to a canvas via pdfjs-dist (legacy build), then OCRs.
// Outputs both cleaned page text and per-word bboxes (in PDF user-space) so
// the augmentation pipeline can stamp an invisible text layer back onto the
// original PDF.

import type { ExtractedPage } from "./extract";
import { cleanPdfText } from "./clean";
import { repairWord } from "@/lib/text/normalize";

export type OcrWord = {
  text: string;
  // PDF user-space (origin = bottom-left), units = points.
  x: number;
  y: number;
  width: number;
  height: number;
};
export type OcrPage = ExtractedPage & {
  pageWidth: number; // PDF user-space width (points)
  pageHeight: number; // PDF user-space height (points)
  words: OcrWord[];
};

const OCR_RENDER_SCALE = 2;

export async function ocrPdf(pdfBytes: ArrayBuffer | Uint8Array): Promise<OcrPage[]> {
  // Dynamic imports to keep tesseract / pdfjs out of the edge bundle.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas").catch(() => ({ createCanvas: null as any }));
  const { createWorker } = await import("tesseract.js");
  if (!createCanvas) {
    throw new Error("OCR requires @napi-rs/canvas (server canvas). Install it or disable OCR.");
  }
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const doc = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;
  const worker = await createWorker("eng");
  const pages: OcrPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvas: canvas as any, canvasContext: ctx as any, viewport }).promise;
      const buf = canvas.toBuffer("image/png");
      const { data } = await worker.recognize(buf, {}, { blocks: true });

      const pageH = baseViewport.height;
      const tesseractWords = (data as any).words ?? collectWords(data);
      const words: OcrWord[] = [];
      for (const w of tesseractWords) {
        const text = repairWord(String(w.text ?? "").trim());
        if (!text) continue;
        const bbox = w.bbox;
        if (!bbox) continue;
        // Tesseract bbox is in render-pixel coords with origin at top-left.
        // Convert to PDF user-space (origin bottom-left, points).
        const x = bbox.x0 / OCR_RENDER_SCALE;
        const yTop = bbox.y0 / OCR_RENDER_SCALE;
        const yBot = bbox.y1 / OCR_RENDER_SCALE;
        const widthPt = (bbox.x1 - bbox.x0) / OCR_RENDER_SCALE;
        const heightPt = yBot - yTop;
        words.push({
          text,
          x,
          y: pageH - yBot, // bottom-left in PDF space
          width: widthPt,
          height: heightPt,
        });
      }

      pages.push({
        pageNumber: i,
        text: cleanPdfText(data.text),
        pageWidth: baseViewport.width,
        pageHeight: pageH,
        words,
      });
    }
  } finally {
    await worker.terminate();
  }
  return pages;
}

// Older/newer tesseract.js shapes vary; recurse if needed.
function collectWords(data: any): any[] {
  if (Array.isArray(data?.words)) return data.words;
  const out: any[] = [];
  for (const block of data?.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) out.push(w);
      }
    }
  }
  return out;
}
