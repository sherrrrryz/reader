// Server-side OCR fallback using tesseract.js.
// Called when extractPdfText reports needsOcr=true.
// Renders each PDF page to a canvas via pdfjs-dist (legacy build), then OCRs.

import type { ExtractedPage } from "./extract";
import { cleanPdfText } from "./clean";

export async function ocrPdf(pdfBytes: ArrayBuffer | Uint8Array): Promise<ExtractedPage[]> {
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
  const pages: ExtractedPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvas: canvas as any, canvasContext: ctx as any, viewport }).promise;
      const buf = canvas.toBuffer("image/png");
      const { data } = await worker.recognize(buf);
      pages.push({ pageNumber: i, text: cleanPdfText(data.text) });
    }
  } finally {
    await worker.terminate();
  }
  return pages;
}
