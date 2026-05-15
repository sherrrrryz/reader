/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { ViewportPluginPackage, Viewport } from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage, Scroller } from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage, RenderLayer } from "@embedpdf/plugin-render/react";
import {
  DocumentManagerPluginPackage,
  DocumentContent,
  DocumentContext,
} from "@embedpdf/plugin-document-manager/react";
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import {
  SelectionPluginPackage,
  SelectionLayer,
  useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import {
  AnnotationPluginPackage,
  AnnotationLayer,
  useAnnotationCapability,
} from "@embedpdf/plugin-annotation/react";
import { PdfAnnotationSubtype, type Rect } from "@embedpdf/models";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Highlighter, Underline } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { repairText } from "@/lib/text/normalize";
import type { VocabularyEntry } from "@/components/WordCard";

// ---------------------------------------------------------------------------
// Public row types — kept compatible with the old shape so the rest of the
// app (ReaderWorkspace, server loader) works without changes. `range_json`
// is the legacy ScaledPosition payload (now nullable in the DB);
// `range_v2` carries the EmbedPDF/PDFium annotation object.
// ---------------------------------------------------------------------------
export type StoredRange = unknown; // legacy; ignored by the EmbedPDF reader

export type SavedAnnotation = {
  id: string;
  pageIndex: number;
  rect: Rect;
  segmentRects: Rect[];
  color: string;
  opacity: number;
  type: PdfAnnotationSubtype.HIGHLIGHT | PdfAnnotationSubtype.UNDERLINE;
};

export type HighlightRow = {
  id: string;
  document_id: string;
  page_number: number;
  word: string;
  context_sentence: string | null;
  range_json: StoredRange | null;
  range_v2: SavedAnnotation | null;
};
export type UnderlineRow = {
  id: string;
  document_id: string;
  page_number: number;
  sentence: string;
  range_json: StoredRange | null;
  range_v2: SavedAnnotation | null;
};

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

const HIGHLIGHT_COLOR = "#fde047"; // tailwind yellow-300
const UNDERLINE_COLOR = "#0a0a0a";

export function PdfReader(props: Props) {
  const { engine, isLoading, error } = usePdfiumEngine({
    wasmUrl: "/pdfium.wasm",
    worker: false,
  });

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [
          { documentId: props.documentId, url: `/api/documents/${props.documentId}/file` },
        ],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(AnnotationPluginPackage),
    ],
    [props.documentId],
  );

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load PDF engine: {error.message}
      </div>
    );
  }
  if (isLoading || !engine) {
    return (
      <div className="flex h-[78vh] items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
        Loading PDF engine…
      </div>
    );
  }

  return (
    <div className="h-[78vh] w-full overflow-hidden rounded-md border bg-muted/20">
      <EmbedPDF engine={engine} plugins={plugins}>
        <DocumentContext>
          {({ activeDocumentId }) => {
            if (!activeDocumentId) {
              return (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading document…
                </div>
              );
            }
            return (
              <DocumentContent documentId={activeDocumentId}>
                {({ isLoaded, isError }) => {
                  if (isError) {
                    return (
                      <div className="flex h-full items-center justify-center text-sm text-destructive">
                        Failed to load document.
                      </div>
                    );
                  }
                  if (!isLoaded) {
                    return (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Loading document…
                      </div>
                    );
                  }
                  return <DocumentSurface {...props} embedDocId={activeDocumentId} />;
                }}
              </DocumentContent>
            );
          }}
        </DocumentContext>
      </EmbedPDF>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inside the PDF document — wires selection + annotation persistence.
// ---------------------------------------------------------------------------
function DocumentSurface({ embedDocId, ...props }: Props & { embedDocId: string }) {
  const annotation = useAnnotationCapability().provides;
  const selection = useSelectionCapability().provides;

  // Replay previously saved highlights / underlines into the annotation layer
  // exactly once. Because we use the DB-row id as the annotation id, the
  // annotation plugin's 'create' event for these initial annotations is
  // self-evidently ours; tracking the set of "ours" ids prevents double-save.
  const ourIds = useRef<Set<string>>(new Set());
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (!annotation || restoredOnce.current) return;
    restoredOnce.current = true;
    for (const h of props.initialHighlights) {
      if (!h.range_v2) continue;
      ourIds.current.add(h.id);
      annotation.createAnnotation(h.range_v2.pageIndex, {
        ...h.range_v2,
        id: h.id,
        type: PdfAnnotationSubtype.HIGHLIGHT,
        contents: h.context_sentence ?? h.word,
      } as any);
    }
    for (const u of props.initialUnderlines) {
      if (!u.range_v2) continue;
      ourIds.current.add(u.id);
      annotation.createAnnotation(u.range_v2.pageIndex, {
        ...u.range_v2,
        id: u.id,
        type: PdfAnnotationSubtype.UNDERLINE,
        contents: u.sentence,
      } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotation]);

  // Listen for delete events — the annotation layer lets users right-click /
  // tap a highlight and remove it; mirror that to the DB.
  useEffect(() => {
    if (!annotation) return;
    const off = annotation.onAnnotationEvent(async (evt) => {
      if (evt.type !== "delete") return;
      const id = evt.annotation.id;
      const supabase = createSupabaseBrowserClient();
      // Try both tables; whichever owns the id wins.
      const [{ data: hRow }] = await Promise.all([
        supabase.from("highlights").select("id, word").eq("id", id).maybeSingle(),
      ]);
      if (hRow) {
        await supabase.from("highlights").delete().eq("id", id);
        props.onHighlightRemoved(id, hRow.word as string);
        return;
      }
      const { data: uRow } = await supabase
        .from("underlines")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (uRow) {
        await supabase.from("underlines").delete().eq("id", id);
        props.onUnderlineRemoved(id);
      }
    });
    return () => off();
  }, [annotation, props]);

  return (
    <Viewport documentId={embedDocId} style={{ height: "100%" }}>
      <Scroller
        documentId={embedDocId}
        renderPage={({ pageIndex, width, height }) => (
          <PagePointerProvider
            documentId={embedDocId}
            pageIndex={pageIndex}
            style={{ width, height, position: "relative" }}
          >
            <RenderLayer
              documentId={embedDocId}
              pageIndex={pageIndex}
              draggable={false}
              style={{ pointerEvents: "none", userSelect: "none" }}
            />
            <AnnotationLayer
              documentId={embedDocId}
              pageIndex={pageIndex}
            />
            <SelectionLayer
              documentId={embedDocId}
              pageIndex={pageIndex}
              textStyle={{ background: "rgba(33,150,243,0.35)" }}
              selectionMenu={({ selected, menuWrapperProps, placement, context }) => {
                if (!selected) return null;
                // wrapper is sized to the selection bbox; float our popover
                // outside that box so it doesn't get squeezed by narrow
                // selections and doesn't cover the highlighted text.
                const above = placement?.suggestTop ?? true;
                return (
                  <div {...menuWrapperProps} style={{ ...menuWrapperProps.style, pointerEvents: "none" }}>
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        transform: "translateX(-50%)",
                        ...(above
                          ? { bottom: "calc(100% + 6px)" }
                          : { top: "calc(100% + 6px)" }),
                        whiteSpace: "nowrap",
                        pointerEvents: "auto",
                      }}
                    >
                      <SelectionMenu pageIndex={context.pageIndex} {...props} />
                    </div>
                  </div>
                );
              }}
            />
          </PagePointerProvider>
        )}
      />
    </Viewport>
  );

  // captured by SelectionMenu via closure props above
  function SelectionMenu({
    pageIndex,
  }: {
    pageIndex: number;
  } & Props) {
    return (
      <div
        className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
        onMouseDown={(e) => e.preventDefault()}
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={() => saveAsHighlight(pageIndex)}
        >
          <Highlighter className="size-4 text-yellow-500" />
          Word
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => saveAsUnderline(pageIndex)}
        >
          <Underline className="size-4" />
          Sentence
        </Button>
      </div>
    );
  }

  async function saveAsHighlight(pageIndex: number) {
    if (!annotation || !selection) return;
    const sel = selection.getFormattedSelectionForPage(pageIndex, embedDocId);
    if (!sel) return;
    const textTask = selection.getSelectedText(embedDocId);
    const rawTextArr = await taskToPromise(textTask);
    const rawText = (rawTextArr ?? []).join(" ").trim();
    const cleanText = repairText(rawText);
    const wholeWords = cleanText.match(/\b[A-Za-z][A-Za-z'-]+\b/g) ?? [];
    let word = wholeWords[0] ?? "";
    if (!word) {
      const runs = cleanText.match(/[A-Za-z]{2,}/g) ?? [];
      word = runs.sort((a, b) => b.length - a.length)[0] ?? "";
    }
    word = word.toLowerCase();
    if (!word) {
      toast.error("Please select an English word");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not signed in");
      return;
    }

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

    const range_v2: SavedAnnotation = {
      id: "", // placeholder — will be replaced with the row id below
      pageIndex,
      rect: sel.rect,
      segmentRects: sel.segmentRects,
      color: HIGHLIGHT_COLOR,
      opacity: 0.5,
      type: PdfAnnotationSubtype.HIGHLIGHT,
    };

    const { data, error } = await supabase
      .from("highlights")
      .insert({
        user_id: user.id,
        document_id: props.documentId,
        vocabulary_id: vocabularyId,
        page_number: pageIndex + 1,
        word,
        context_sentence: cleanText,
        range_json: null,
        range_v2: { ...range_v2, id: "<row>" },
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Save failed");
      return;
    }

    // Persist the real row id into range_v2 so reload uses a stable id.
    const finalRange: SavedAnnotation = { ...range_v2, id: data.id };
    await supabase.from("highlights").update({ range_v2: finalRange }).eq("id", data.id);

    ourIds.current.add(data.id);
    annotation.createAnnotation(pageIndex, {
      id: data.id,
      type: PdfAnnotationSubtype.HIGHLIGHT,
      pageIndex,
      rect: sel.rect,
      segmentRects: sel.segmentRects,
      strokeColor: HIGHLIGHT_COLOR,
      opacity: 0.5,
      contents: cleanText,
    } as any);

    selection.clear(embedDocId);
    props.onHighlightAdded({ ...(data as HighlightRow), range_v2: finalRange });

    fetch(`/api/dictionary/${encodeURIComponent(word)}`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json();
        if (j.entry) props.onVocabUpserted(j.entry as VocabularyEntry);
      })
      .catch(() => {});
    toast.success(`Added to vocabulary: ${word}`);
  }

  async function saveAsUnderline(pageIndex: number) {
    if (!annotation || !selection) return;
    const sel = selection.getFormattedSelectionForPage(pageIndex, embedDocId);
    if (!sel) return;
    const textArr = await taskToPromise(selection.getSelectedText(embedDocId));
    const sentence = repairText((textArr ?? []).join(" ").trim());
    if (!sentence) return;

    const supabase = createSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not signed in");
      return;
    }

    const baseRange: SavedAnnotation = {
      id: "<row>",
      pageIndex,
      rect: sel.rect,
      segmentRects: sel.segmentRects,
      color: UNDERLINE_COLOR,
      opacity: 1,
      type: PdfAnnotationSubtype.UNDERLINE,
    };

    const { data, error } = await supabase
      .from("underlines")
      .insert({
        user_id: user.id,
        document_id: props.documentId,
        page_number: pageIndex + 1,
        sentence,
        range_json: null,
        range_v2: baseRange,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Save failed");
      return;
    }

    const finalRange: SavedAnnotation = { ...baseRange, id: data.id };
    await supabase.from("underlines").update({ range_v2: finalRange }).eq("id", data.id);

    ourIds.current.add(data.id);
    annotation.createAnnotation(pageIndex, {
      id: data.id,
      type: PdfAnnotationSubtype.UNDERLINE,
      pageIndex,
      rect: sel.rect,
      segmentRects: sel.segmentRects,
      strokeColor: UNDERLINE_COLOR,
      opacity: 1,
      contents: sentence,
    } as any);

    selection.clear(embedDocId);
    props.onUnderlineAdded({ ...(data as UnderlineRow), range_v2: finalRange });
    toast.success("Sentence saved");
  }
}

// EmbedPDF capabilities return PdfTask<T>; convert to a Promise.
function taskToPromise<T>(task: { wait?: (ok: (v: T) => void, err: (e: unknown) => void) => void } | T | undefined | null): Promise<T | null> {
  if (!task) return Promise.resolve(null);
  if (typeof (task as any).wait === "function") {
    return new Promise<T | null>((resolve) => {
      (task as any).wait(
        (v: T) => resolve(v),
        () => resolve(null),
      );
    });
  }
  return Promise.resolve(task as T);
}
