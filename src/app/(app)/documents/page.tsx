import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DocumentCard, type DocumentRow } from "@/components/DocumentCard";
import { UploadButton } from "@/components/UploadButton";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, created_at, page_count, extraction_status, ocr_used")
    .order("created_at", { ascending: false });

  const docs = (data ?? []) as DocumentRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Documents</h1>
        <UploadButton />
      </div>
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No documents yet — click the button above to upload a PDF.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => (
            <DocumentCard key={d.id} doc={d} />
          ))}
        </div>
      )}
    </div>
  );
}
