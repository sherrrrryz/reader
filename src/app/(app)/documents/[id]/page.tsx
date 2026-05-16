import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReaderWorkspace } from "@/components/ReaderWorkspace";
import { ParsingPoller } from "@/components/ParsingPoller";
import type { VocabularyEntry } from "@/components/WordCard";

export const dynamic = "force-dynamic";

export default async function DocumentReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, extraction_status")
    .eq("id", id)
    .single();
  if (!doc) return notFound();

  // Try the v2 schema first; if the migration hasn't run yet, fall back to
  // the legacy columns so the page still loads.
  const fetchHighlights = async () => {
    const v2 = await supabase
      .from("highlights")
      .select("id, document_id, page_number, word, context_sentence, range_json, range_v2")
      .eq("document_id", id)
      .order("created_at", { ascending: true });
    if (!v2.error) return v2;
    return supabase
      .from("highlights")
      .select("id, document_id, page_number, word, context_sentence, range_json")
      .eq("document_id", id)
      .order("created_at", { ascending: true });
  };
  const fetchUnderlines = async () => {
    const v2 = await supabase
      .from("underlines")
      .select("id, document_id, page_number, sentence, range_json, range_v2")
      .eq("document_id", id)
      .order("created_at", { ascending: true });
    if (!v2.error) return v2;
    return supabase
      .from("underlines")
      .select("id, document_id, page_number, sentence, range_json")
      .eq("document_id", id)
      .order("created_at", { ascending: true });
  };
  const fetchFreetexts = async () => {
    const r = await supabase
      .from("freetext_annotations")
      .select("id, document_id, page_number, contents, range_v2")
      .eq("document_id", id)
      .order("created_at", { ascending: true });
    if (r.error) return { data: [] as unknown[] };
    return r;
  };
  const [{ data: hs }, { data: us }, { data: vocab }, { data: fts }] = await Promise.all([
    fetchHighlights(),
    fetchUnderlines(),
    supabase.from("vocabulary").select("*"),
    fetchFreetexts(),
  ]);

  const vocabMap: Record<string, VocabularyEntry> = {};
  for (const v of (vocab ?? []) as VocabularyEntry[]) vocabMap[v.word.toLowerCase()] = v;

  const isProcessing =
    doc.extraction_status === "processing" || doc.extraction_status === "pending";

  return (
    <div>
      <ParsingPoller active={isProcessing} />
      {isProcessing ? (
        <div className="mb-4 rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          Parsing the document. Search and sentence context will be available once it finishes.
        </div>
      ) : null}
      <ReaderWorkspace
        documentId={doc.id}
        title={doc.title}
        initialHighlights={(hs ?? []) as any}
        initialUnderlines={(us ?? []) as any}
        initialFreetexts={(fts ?? []) as any}
        initialVocab={vocabMap}
      />
    </div>
  );
}
