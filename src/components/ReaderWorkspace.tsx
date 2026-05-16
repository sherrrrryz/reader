"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { WordCard, type VocabularyEntry } from "@/components/WordCard";
import { SentenceCard, type UnderlineEntry } from "@/components/SentenceCard";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { HighlightRow, UnderlineRow, FreetextRow } from "@/components/PdfReader";
import { Separator } from "@/components/ui/separator";

const PdfReader = dynamic(() => import("./PdfReader").then((m) => m.PdfReader), { ssr: false });

type Props = {
  documentId: string;
  title: string;
  initialHighlights: HighlightRow[];
  initialUnderlines: UnderlineRow[];
  initialFreetexts: FreetextRow[];
  initialVocab: Record<string, VocabularyEntry>; // word -> entry
};

export function ReaderWorkspace({
  documentId,
  title,
  initialHighlights,
  initialUnderlines,
  initialFreetexts,
  initialVocab,
}: Props) {
  const [highlights, setHighlights] = useState<HighlightRow[]>(initialHighlights);
  const [underlines, setUnderlines] = useState<UnderlineRow[]>(initialUnderlines);
  const [vocab, setVocab] = useState<Record<string, VocabularyEntry>>(initialVocab);

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
        status: (v?.status as "learned" | "unlearned") ?? "unlearned",
        context_sentence: h.context_sentence,
        highlight_id: h.id,
      };
    });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        <h1 className="mb-3 text-xl font-semibold">{title}</h1>
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
        />
      </div>
      <aside className="space-y-4">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Word cards ({wordEntries.length})</h2>
          <div className="space-y-3">
            {wordEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Select a word and click 🟡 Word — it will be added to your vocabulary.</p>
            ) : (
              wordEntries.map((e) => <WordCard key={e.highlight_id} entry={e} variant="reader" />)
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
      </aside>
    </div>
  );
}
