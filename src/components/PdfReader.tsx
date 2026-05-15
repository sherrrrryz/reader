"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  useHighlightContainerContext,
  usePdfHighlighterContext,
  type Highlight as LibHighlight,
  type PdfHighlighterUtils,
} from "react-pdf-highlighter-extended-extended";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Highlighter, Underline, Trash2, BookOpen } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WordCard, type VocabularyEntry } from "@/components/WordCard";

// Worker must match the pdfjs version pnpm hoisted into the lib (5.7.x).
// cmap/font assets are served same-origin from /public/.
const PDFJS_VERSION = "5.7.284";
const WORKER_SRC = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const CMAP_URL = "/cmaps/";
const STANDARD_FONT_DATA_URL = "/standard_fonts/";

export type StoredRange = {
  position: LibHighlight["position"];
  content: { text: string };
};

export type HighlightRow = {
  id: string;
  document_id: string;
  page_number: number;
  word: string;
  context_sentence: string | null;
  range_json: StoredRange;
};
export type UnderlineRow = {
  id: string;
  document_id: string;
  page_number: number;
  sentence: string;
  range_json: StoredRange;
};

type ReaderHighlight = LibHighlight & {
  kind: "word" | "sentence";
  word?: string;
  sentence?: string;
  context_sentence?: string | null;
  content: { text: string };
};

type ReaderActions = {
  deleteHighlight: (highlightId: string, word: string) => Promise<void>;
  deleteUnderline: (underlineId: string) => Promise<void>;
  getVocab: (word: string) => VocabularyEntry | null;
  ensureVocab: (word: string) => Promise<VocabularyEntry | null>;
};
const ActionsCtx = createContext<ReaderActions | null>(null);

function HighlightActionsTip({
  word,
  contextSentence,
  highlightId,
}: {
  word: string;
  contextSentence: string | null | undefined;
  highlightId: string;
}) {
  const utils = usePdfHighlighterContext();
  const actions = useContext(ActionsCtx);
  if (!actions) return null;

  async function showExplain() {
    let entry = actions!.getVocab(word);
    if (!entry || !entry.definition_zh) {
      entry = await actions!.ensureVocab(word);
    }
    if (!entry) {
      toast.error("Lookup failed");
      return;
    }
    const tipEntry: VocabularyEntry = {
      ...entry,
      context_sentence: contextSentence ?? null,
    };
    utils.setTip({
      position: utils.getTip()!.position,
      content: (
        <div
          className="w-80 max-w-[80vw] rounded-md border bg-popover shadow-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <WordCard entry={tipEntry} variant="reader" />
          <div className="border-t p-1 text-right">
            <Button size="sm" variant="ghost" onClick={() => utils.setTip(null)}>
              Close
            </Button>
          </div>
        </div>
      ),
    });
  }

  return (
    <div
      className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Button size="sm" variant="ghost" onClick={showExplain}>
        <BookOpen className="size-4" />
        Define
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await actions.deleteHighlight(highlightId, word);
          utils.setTip(null);
        }}
      >
        <Trash2 className="size-4 text-destructive" />
        Delete
      </Button>
    </div>
  );
}

function UnderlineActionsTip({ underlineId }: { underlineId: string }) {
  const utils = usePdfHighlighterContext();
  const actions = useContext(ActionsCtx);
  if (!actions) return null;
  return (
    <div
      className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          await actions.deleteUnderline(underlineId);
          utils.setTip(null);
        }}
      >
        <Trash2 className="size-4 text-destructive" />
        Remove underline
      </Button>
    </div>
  );
}

function HighlightContainer() {
  const { highlight } = useHighlightContainerContext<ReaderHighlight>();
  const utils = usePdfHighlighterContext();
  const isSentence = highlight.kind === "sentence";

  const onClick = () => {
    if (isSentence) {
      utils.setTip({
        position: highlight.position,
        content: <UnderlineActionsTip underlineId={highlight.id.slice(2)} />,
      });
    } else {
      utils.setTip({
        position: highlight.position,
        content: (
          <HighlightActionsTip
            word={highlight.word ?? ""}
            contextSentence={highlight.context_sentence}
            highlightId={highlight.id.slice(2)}
          />
        ),
      });
    }
  };

  return (
    <TextHighlight
      isScrolledTo={false}
      highlight={highlight}
      onClick={onClick}
      style={
        isSentence
          ? {
              background: "transparent",
              borderBottom: "2px solid #0a0a0a",
              borderRadius: 0,
              mixBlendMode: "normal",
              cursor: "pointer",
            }
          : {
              background: "rgba(253, 224, 71, 0.55)",
              mixBlendMode: "multiply",
              cursor: "pointer",
            }
      }
    />
  );
}

type Props = {
  documentId: string;
  initialHighlights: HighlightRow[];
  initialUnderlines: UnderlineRow[];
  vocab: Record<string, VocabularyEntry>;
  onHighlightAdded: (row: HighlightRow) => void;
  onUnderlineAdded: (row: UnderlineRow) => void;
  onHighlightRemoved: (highlightId: string, word: string) => void;
  onUnderlineRemoved: (underlineId: string) => void;
  onVocabUpserted: (entry: VocabularyEntry) => void;
};

export function PdfReader({
  documentId,
  initialHighlights,
  initialUnderlines,
  vocab,
  onHighlightAdded,
  onUnderlineAdded,
  onHighlightRemoved,
  onUnderlineRemoved,
  onVocabUpserted,
}: Props) {
  const loaderDocument = useMemo(
    () => ({
      url: `/api/documents/${documentId}/file`,
      cMapUrl: CMAP_URL,
      cMapPacked: true,
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
    }),
    [documentId],
  );
  const utilsRef = useRef<PdfHighlighterUtils | null>(null);
  const [highlights, setHighlights] = useState<HighlightRow[]>(initialHighlights);
  const [underlines, setUnderlines] = useState<UnderlineRow[]>(initialUnderlines);

  const libHighlights: ReaderHighlight[] = useMemo(() => {
    const hs: ReaderHighlight[] = highlights.map((h) => ({
      id: `h:${h.id}`,
      type: "text",
      kind: "word",
      word: h.word,
      context_sentence: h.context_sentence,
      position: h.range_json.position,
      content: h.range_json.content,
    }));
    const us: ReaderHighlight[] = underlines.map((u) => ({
      id: `u:${u.id}`,
      type: "text",
      kind: "sentence",
      sentence: u.sentence,
      position: u.range_json.position,
      content: u.range_json.content,
    }));
    return [...hs, ...us];
  }, [highlights, underlines]);

  async function saveWord() {
    const sel = utilsRef.current?.getCurrentSelection();
    if (!sel) return;
    const text = (sel.content.text ?? "").trim();
    const wholeWords = text.match(/\b[A-Za-z][A-Za-z'-]+\b/g) ?? [];
    let word = wholeWords[0] ?? "";
    if (!word) {
      const runs = text.match(/[A-Za-z]{2,}/g) ?? [];
      word = runs.sort((a, b) => b.length - a.length)[0] ?? "";
    }
    word = word.toLowerCase();
    if (!word) {
      toast.error("Please select an English word");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Not signed in");

    let vocabularyId: string | undefined;
    const existing = await supabase
      .from("vocabulary")
      .select("id")
      .eq("user_id", user.id)
      .eq("word", word)
      .maybeSingle();
    vocabularyId = existing.data?.id;
    if (!vocabularyId) {
      const ins = await supabase
        .from("vocabulary")
        .insert({ user_id: user.id, word })
        .select("id")
        .single();
      vocabularyId = ins.data?.id;
    }

    const range_json: StoredRange = {
      position: sel.position,
      content: { text },
    };
    const pageNumber = sel.position.boundingRect.pageNumber;

    const { data, error } = await supabase
      .from("highlights")
      .insert({
        user_id: user.id,
        document_id: documentId,
        vocabulary_id: vocabularyId,
        page_number: pageNumber,
        word,
        context_sentence: text,
        range_json,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Save failed");
      return;
    }
    setHighlights((arr) => [...arr, data as HighlightRow]);
    onHighlightAdded(data as HighlightRow);
    fetch(`/api/dictionary/${encodeURIComponent(word)}`, { method: "POST" })
      .then(async (r) => {
        if (r.ok) {
          const j = await r.json();
          if (j.entry) onVocabUpserted(j.entry as VocabularyEntry);
        }
      })
      .catch(() => {});
    utilsRef.current?.removeGhostHighlight();
    window.getSelection()?.removeAllRanges();
    toast.success(`Added to vocabulary: ${word}`);
  }

  async function saveSentence() {
    const sel = utilsRef.current?.getCurrentSelection();
    if (!sel) return;
    const sentence = (sel.content.text ?? "").trim();
    if (!sentence) return;
    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Not signed in");

    const range_json: StoredRange = {
      position: sel.position,
      content: { text: sentence },
    };
    const pageNumber = sel.position.boundingRect.pageNumber;

    const { data, error } = await supabase
      .from("underlines")
      .insert({
        user_id: user.id,
        document_id: documentId,
        page_number: pageNumber,
        sentence,
        range_json,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Save failed");
      return;
    }
    setUnderlines((arr) => [...arr, data as UnderlineRow]);
    onUnderlineAdded(data as UnderlineRow);
    utilsRef.current?.removeGhostHighlight();
    window.getSelection()?.removeAllRanges();
    toast.success("Sentence saved");
  }

  async function deleteHighlight(highlightId: string, word: string) {
    const supabase = createSupabaseBrowserClient();
    // Delete this highlight + all sibling highlights of the same word + the
    // vocabulary entry, so the word disappears from every surface at once.
    const lower = word.toLowerCase();
    const [{ error: hErr }, { error: vErr }] = await Promise.all([
      supabase.from("highlights").delete().eq("word", lower),
      supabase.from("vocabulary").delete().eq("word", lower),
    ]);
    if (hErr || vErr) {
      toast.error(hErr?.message ?? vErr?.message ?? "Delete failed");
      return;
    }
    setHighlights((arr) => arr.filter((h) => h.word.toLowerCase() !== lower));
    onHighlightRemoved(highlightId, lower);
    toast.success(`Deleted: ${word}`);
  }

  async function deleteUnderline(underlineId: string) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("underlines").delete().eq("id", underlineId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setUnderlines((arr) => arr.filter((u) => u.id !== underlineId));
    onUnderlineRemoved(underlineId);
    toast.success("Underline removed");
  }

  const actions = useMemo<ReaderActions>(
    () => ({
      deleteHighlight,
      deleteUnderline,
      getVocab: (w) => vocab[w.toLowerCase()] ?? null,
      ensureVocab: async (w) => {
        try {
          const r = await fetch(`/api/dictionary/${encodeURIComponent(w)}`, { method: "POST" });
          if (!r.ok) return null;
          const j = await r.json();
          if (j.entry) {
            onVocabUpserted(j.entry as VocabularyEntry);
            return j.entry as VocabularyEntry;
          }
          return null;
        } catch {
          return null;
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vocab],
  );

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="relative h-[78vh] w-full overflow-hidden rounded-md border bg-muted/20">
        <PdfLoader document={loaderDocument} workerSrc={WORKER_SRC}>
          {(pdfDocument) => (
            <PdfHighlighter
              pdfDocument={pdfDocument}
              highlights={libHighlights}
              utilsRef={(u) => {
                utilsRef.current = u;
              }}
              selectionTip={
                <div
                  className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Button size="sm" variant="ghost" onClick={saveWord}>
                    <Highlighter className="size-4 text-yellow-500" />
                    Word
                  </Button>
                  <Button size="sm" variant="ghost" onClick={saveSentence}>
                    <Underline className="size-4" />
                    Sentence
                  </Button>
                </div>
              }
            >
              <HighlightContainer />
            </PdfHighlighter>
          )}
        </PdfLoader>
      </div>
    </ActionsCtx.Provider>
  );
}
