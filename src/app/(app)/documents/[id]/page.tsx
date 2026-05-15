import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReaderWorkspace } from "@/components/ReaderWorkspace";
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

  const [{ data: hs }, { data: us }, { data: vocab }] = await Promise.all([
    supabase
      .from("highlights")
      .select("id, document_id, page_number, word, context_sentence, range_json")
      .eq("document_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("underlines")
      .select("id, document_id, page_number, sentence, range_json")
      .eq("document_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("vocabulary").select("*"),
  ]);

  const vocabMap: Record<string, VocabularyEntry> = {};
  for (const v of (vocab ?? []) as VocabularyEntry[]) vocabMap[v.word.toLowerCase()] = v;

  return (
    <div>
      {doc.extraction_status === "processing" || doc.extraction_status === "pending" ? (
        <div className="mb-4 rounded-md border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          Parsing the document. Search and sentence context will be available once it finishes.
        </div>
      ) : null}
      <ReaderWorkspace
        documentId={doc.id}
        title={doc.title}
        initialHighlights={(hs ?? []) as any}
        initialUnderlines={(us ?? []) as any}
        initialVocab={vocabMap}
      />
    </div>
  );
}
