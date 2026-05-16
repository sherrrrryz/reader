import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DocumentRow } from "@/components/DocumentCard";
import { DocumentsView } from "@/components/DocumentsView";
import { UploadButton } from "@/components/UploadButton";
import { ParsingPoller } from "@/components/ParsingPoller";

export const dynamic = "force-dynamic";

type DocRecord = {
  id: string;
  title: string;
  created_at: string;
  page_count: number | null;
  extraction_status: string;
  ocr_used: boolean | null;
  document_tags: { tags: { id: string; name: string } | { id: string; name: string }[] | null }[] | null;
};

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: docData, error: docError }, { data: tagData }] = await Promise.all([
    supabase
      .from("documents")
      .select(
        "id, title, created_at, page_count, extraction_status, ocr_used, document_tags(tags(id, name))",
      )
      .order("created_at", { ascending: false }),
    supabase.from("tags").select("id, name").order("name", { ascending: true }),
  ]);

  const raw = (docData ?? []) as DocRecord[];
  const docs: DocumentRow[] = raw.map((d) => ({
    id: d.id,
    title: d.title,
    created_at: d.created_at,
    page_count: d.page_count,
    extraction_status: d.extraction_status,
    ocr_used: d.ocr_used,
    tags: (d.document_tags ?? [])
      .flatMap((dt) => (Array.isArray(dt.tags) ? dt.tags : dt.tags ? [dt.tags] : [])),
  }));
  const allTags = (tagData ?? []) as { id: string; name: string }[];

  const anyProcessing = docs.some(
    (d) => d.extraction_status === "processing" || d.extraction_status === "pending",
  );

  return (
    <div className="space-y-6">
      <ParsingPoller active={anyProcessing} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Documents</h1>
        <UploadButton />
      </div>
      {docError && <p className="text-sm text-destructive">{docError.message}</p>}
      <DocumentsView docs={docs} allTags={allTags} />
    </div>
  );
}
