-- EmbedPDF annotation payloads (PDFium-native rect/segmentRects).
-- range_json (legacy ScaledPosition from react-pdf-highlighter) stays nullable
-- so existing rows keep working until they're migrated lazily on next load.
alter table public.highlights add column if not exists range_v2 jsonb;
alter table public.underlines add column if not exists range_v2 jsonb;
alter table public.highlights alter column range_json drop not null;
alter table public.underlines alter column range_json drop not null;

-- Track whether a document's PDF has been augmented with an OCR text layer
-- (so the file the client downloads is selectable). Augmented PDFs live next
-- to the original under the same prefix with a `.augmented.pdf` suffix.
alter table public.documents add column if not exists augmented_storage_path text;
