// Re-stamp OCR'd words back onto a PDF as an invisible text layer (PDF text
// rendering mode 3 = "no fill, no stroke") so PDFium-based viewers (EmbedPDF,
// Chrome's built-in viewer, Apple PDFKit) see the same selectable text and
// draw selection rectangles aligned to the underlying scan.
//
// We intentionally use a single standard font (Helvetica) and scale per-word
// font size so the glyph runs roughly match the OCR bbox width. The visual
// layer is invisible anyway — what matters is that each word's bounding box
// in PDFium's text index matches the scanned glyph it represents.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { OcrPage } from "./ocr";

export async function injectInvisibleTextLayer(
  pdfBytes: ArrayBuffer | Uint8Array,
  pages: OcrPage[],
): Promise<Uint8Array> {
  const src = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const doc = await PDFDocument.load(src, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const docPages = doc.getPages();
  for (const p of pages) {
    const idx = p.pageNumber - 1;
    if (idx < 0 || idx >= docPages.length) continue;
    const page = docPages[idx];
    const { width: pdfW, height: pdfH } = page.getSize();
    // OCR coordinates were captured against pdfjs' viewport (scale=1, points
    // matching PDF user-space). If the loaded page has a different size
    // (cropped/scaled), rescale linearly.
    const sx = pdfW / (p.pageWidth || pdfW);
    const sy = pdfH / (p.pageHeight || pdfH);

    for (const w of p.words) {
      if (!w.text) continue;
      const widthPt = Math.max(1, w.width * sx);
      // Pick a font size so this glyph run roughly fills the OCR width.
      const measure = font.widthOfTextAtSize(w.text, 12);
      if (measure <= 0) continue;
      const size = (widthPt / measure) * 12;
      page.drawText(w.text, {
        x: w.x * sx,
        y: w.y * sy,
        size: Number.isFinite(size) && size > 0 ? size : Math.max(1, w.height * sy),
        font,
        color: rgb(0, 0, 0),
        opacity: 0, // invisible: still indexed by PDFium for text/selection
      });
    }
  }
  return await doc.save({ useObjectStreams: false });
}
