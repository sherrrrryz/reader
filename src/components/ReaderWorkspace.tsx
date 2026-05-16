"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { WordCard, type VocabularyEntry } from "@/components/WordCard";
import { SentenceCard, type UnderlineEntry } from "@/components/SentenceCard";
import { NotesPanel, type NoteEntry } from "@/components/NotesPanel";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { HighlightRow, UnderlineRow, FreetextRow } from "@/components/PdfReader";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const PdfReader = dynamic(() => import("./PdfReader").then((m) => m.PdfReader), { ssr: false });

type Props = {
  documentId: string;
  title: string;
  initialHighlights: HighlightRow[];
  initialUnderlines: UnderlineRow[];
  initialFreetexts: FreetextRow[];
  initialVocab: Record<string, VocabularyEntry>; // word -> entry
  initialNotes: NoteEntry[];
};

export function ReaderWorkspace({
  documentId,
  title,
  initialHighlights,
  initialUnderlines,
  initialFreetexts,
  initialVocab,
  initialNotes,
}: Props) {
  const [highlights, setHighlights] = useState<HighlightRow[]>(initialHighlights);
  const [underlines, setUnderlines] = useState<UnderlineRow[]>(initialUnderlines);
  const [vocab, setVocab] = useState<Record<string, VocabularyEntry>>(initialVocab);
  const refreshedStaleRef = useRef(new Set<string>());
  const annotationApiRef = useRef<{
    deleteHighlight: (id: string, pageIndex: number) => void;
  } | null>(null);

  async function handleStarChange(entry: VocabularyEntry, starred: boolean) {
    const lower = entry.word.toLowerCase();
    const vocabId = vocab[lower]?.id;
    if (!vocabId) return; // dictionary lookup hasn't created a row yet
    const prev = vocab[lower]?.starred ?? false;
    setVocab((v) =>
      v[lower] ? { ...v, [lower]: { ...v[lower], starred } } : v,
    );
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("vocabulary").update({ starred }).eq("id", vocabId);
    if (error) {
      setVocab((v) =>
        v[lower] ? { ...v, [lower]: { ...v[lower], starred: prev } } : v,
      );
      toast.error(error.message);
    }
  }

  async function handleWordDelete(entry: VocabularyEntry) {
    const highlightId = entry.highlight_id;
    if (!highlightId) return;
    const hl = highlights.find((h) => h.id === highlightId);
    if (!hl) return;
    const lower = entry.word.toLowerCase();
    // 1) Remove from the PDF — the plugin's 'delete' event handler in
    //    PdfReader cascades to deleting the highlights row + clearing the
    //    sidebar state via onHighlightRemoved.
    annotationApiRef.current?.deleteHighlight(highlightId, hl.page_number - 1);
    // 2) Also delete the vocabulary row so the word disappears from the
    //    vocab page too (user expects sidebar delete = full removal).
    const vocabId = vocab[lower]?.id;
    if (vocabId) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("vocabulary").delete().eq("id", vocabId);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success(`Deleted: ${entry.word}`);
  }

  // One-shot backfill for stale vocab rows:
  //  - source==null (pre-upgrade rows missing sounds/forms), or
  //  - definition_zh missing (route lazily fills via MyMemory).
  // Runs sequentially to stay friendly to MyMemory's rate limit.
  useEffect(() => {
    const stale = Object.values(vocab).filter(
      (v) =>
        v.definition_en &&
        (v.source == null || !v.definition_zh) &&
        !refreshedStaleRef.current.has(v.word.toLowerCase()),
    );
    if (stale.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const v of stale) refreshedStaleRef.current.add(v.word.toLowerCase());
      for (const v of stale) {
        if (cancelled) return;
        try {
          await fetch(`/api/dictionary/${encodeURIComponent(v.word)}`, { method: "POST" });
        } catch {}
      }
      if (cancelled) return;
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("vocabulary")
        .select("*")
        .in("word", stale.map((v) => v.word));
      if (cancelled || !data) return;
      setVocab((curr) => {
        const next = { ...curr };
        for (const e of data as VocabularyEntry[]) next[e.word.toLowerCase()] = e;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [vocab]);

  // Poll dictionary for newly added words that don't yet have definitions.
  useEffect(() => {
    const pending = highlights
      .map((h) => h.word.toLowerCase())
      .filter((w) => !vocab[w]?.definition_en && !vocab[w]?.definition_zh);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      // wait a beat, then re-fetch entries
      await new Promise((r) => setTimeout(r, 1500));
      const { data } = await supabase
        .from("vocabulary")
        .select("*")
        .in("word", pending);
      if (cancelled || !data) return;
      setVocab((v) => {
        const next = { ...v };
        for (const e of data as VocabularyEntry[]) next[e.word.toLowerCase()] = e;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [highlights, vocab]);

  const wordEntries: VocabularyEntry[] = highlights
    .slice()
    .sort((a, b) => b.page_number - a.page_number)
    .map((h) => {
      const v = vocab[h.word.toLowerCase()];
      return {
        id: v?.id ?? `pending-${h.id}`,
        word: h.word,
        phonetic: v?.phonetic ?? null,
        definition_en: v?.definition_en ?? null,
        definition_zh: v?.definition_zh ?? null,
        synonyms: v?.synonyms ?? [],
        examples: v?.examples ?? [],
        sounds: v?.sounds ?? [],
        forms: v?.forms ?? [],
        source: v?.source ?? null,
        status: (v?.status as "learned" | "unlearned") ?? "unlearned",
        starred: v?.starred ?? false,
        context_sentence: h.context_sentence,
        highlight_id: h.id,
      };
    });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back to documents">
            <Link href="/documents">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        <PdfReader
          documentId={documentId}
          initialHighlights={highlights}
          initialUnderlines={underlines}
          initialFreetexts={initialFreetexts}
          vocab={vocab}
          onHighlightAdded={(h) => setHighlights((arr) => [...arr, h])}
          onUnderlineAdded={(u) => setUnderlines((arr) => [...arr, u])}
          onHighlightRemoved={(_id, word) => {
            const lower = word.toLowerCase();
            setHighlights((arr) => arr.filter((h) => h.word.toLowerCase() !== lower));
            setVocab((v) => {
              const next = { ...v };
              delete next[lower];
              return next;
            });
          }}
          onUnderlineRemoved={(id) =>
            setUnderlines((arr) => arr.filter((u) => u.id !== id))
          }
          onVocabUpserted={(entry) =>
            setVocab((v) => ({ ...v, [entry.word.toLowerCase()]: entry }))
          }
          onAnnotationApiReady={(api) => {
            annotationApiRef.current = api;
          }}
        />
      </div>
      <aside className="space-y-4">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Word cards ({wordEntries.length})</h2>
          <div className="space-y-3">
            {wordEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Select a word and click 🟡 Word — it will be added to your vocabulary.</p>
            ) : (
              wordEntries.map((e) => (
                <WordCard
                  key={e.highlight_id}
                  entry={e}
                  variant="reader"
                  onStarChange={handleStarChange}
                  onDelete={handleWordDelete}
                />
              ))
            )}
          </div>
        </section>
        <Separator />
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Saved sentences ({underlines.length})</h2>
          <div className="space-y-2">
            {underlines.length === 0 ? (
              <p className="text-xs text-muted-foreground">Select a sentence and click Sentence — it will be saved here.</p>
            ) : (
              underlines
                .slice()
                .sort((a, b) => b.page_number - a.page_number)
                .map((u) => (
                  <SentenceCard
                    key={u.id}
                    entry={
                      {
                        id: u.id,
                        sentence: u.sentence,
                        page_number: u.page_number,
                        created_at: "",
                      } as UnderlineEntry
                    }
                  />
                ))
            )}
          </div>
        </section>
        <Separator />
        <NotesPanel documentId={documentId} initialNotes={initialNotes} />
      </aside>
    </div>
  );
}
