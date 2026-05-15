import { extractText, getDocumentProxy } from "unpdf";
import { cleanPdfText } from "./clean";

export type ExtractedPage = { pageNumber: number; text: string };
export type ExtractResult = {
  pages: ExtractedPage[];
  pageCount: number;
  needsOcr: boolean;
};

// Image-only pages can still expose ~50–150 chars of header/title text from a
// real text layer (handouts often hard-code their title), so a very low
// threshold misses them. 150 chars/page catches "title-only" scanned PDFs
// without false-positiving narrow real-text pages.
const OCR_THRESHOLD_CHARS_PER_PAGE = 150;

export async function extractPdfText(pdfBytes: ArrayBuffer | Uint8Array): Promise<ExtractResult> {
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const pdf = await getDocumentProxy(bytes);
  const { text: pageTexts } = await extractText(pdf, { mergePages: false });
  const pages: ExtractedPage[] = pageTexts.map((t, i) => ({
    pageNumber: i + 1,
    text: cleanPdfText(t),
  }));
  const total = pages.reduce((n, p) => n + p.text.length, 0);
  const needsOcr = pages.length > 0 && total / pages.length < OCR_THRESHOLD_CHARS_PER_PAGE;
  return { pages, pageCount: pages.length, needsOcr };
}
