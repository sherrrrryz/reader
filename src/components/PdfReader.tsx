/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF, useDocumentState } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import type { PdfEngine } from "@embedpdf/models";
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
  GlobalPointerProvider,
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
import {
  ZoomPluginPackage,
  ZoomGestureWrapper,
  ZoomMode,
} from "@embedpdf/plugin-zoom/react";
import { PanPluginPackage, usePan } from "@embedpdf/plugin-pan/react";
import {
  SearchPluginPackage,
  SearchLayer,
} from "@embedpdf/plugin-search/react";
import { PdfAnnotationSubtype, type Rect } from "@embedpdf/models";
import { PdfToolbar } from "./PdfToolbar";
import { PdfSearchBar } from "./PdfSearchBar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Highlighter, Trash2, Underline } from "lucide-react";
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
export type FreetextRow = {
  id: string;
  document_id: string;
  page_number: number;
  contents: string;
  range_v2: any;
};

type Props = {
  documentId: string;
  initialHighlights: HighlightRow[];
  initialUnderlines: UnderlineRow[];
  initialFreetexts: FreetextRow[];
  vocab: Record<string, VocabularyEntry>;
  onHighlightAdded: (row: HighlightRow) => void;
  onUnderlineAdded: (row: UnderlineRow) => void;
  onHighlightRemoved: (highlightId: string, word: string) => void;
  onUnderlineRemoved: (underlineId: string) => void;
  onVocabUpserted: (entry: VocabularyEntry) => void;
  onAnnotationApiReady?: (
    api: { deleteHighlight: (id: string, pageIndex: number) => void } | null,
  ) => void;
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
      createPluginRegistration(AnnotationPluginPackage, {
        tools: [{ id: "freeText", interaction: { exclusive: false, isRotatable: false } }],
      }),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitWidth,
      }),
      createPluginRegistration(PanPluginPackage, { defaultMode: "never" }),
      createPluginRegistration(SearchPluginPackage, { showAllResults: true }),
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
                  return (
                    <DocumentSurface
                      {...props}
                      embedDocId={activeDocumentId}
                      engine={engine}
                    />
                  );
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
function DocumentSurface({
  embedDocId,
  engine,
  ...props
}: Props & { embedDocId: string; engine: PdfEngine }) {
  const annotation = useAnnotationCapability().provides;
  const selection = useSelectionCapability().provides;
  const docState = useDocumentState(embedDocId);
  const pdfDoc = docState?.document ?? null;
  const { isPanning } = usePan(embedDocId);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  // Custom drag-to-scroll. The pan plugin manages the mode + cursor + state,
  // but its viewport.scrollTo emit doesn't propagate to the DOM in our setup,
  // so we attach our own pointerdown/move/up listeners directly to the
  // Viewport's overflow:auto container when pan mode is active.
  useEffect(() => {
    if (!isPanning) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    // Find the Viewport's scroll container (overflow:auto, padding from viewport-gap)
    const scroller = surface.querySelector<HTMLElement>(
      'div[style*="overflow: auto"]',
    );
    if (!scroller) return;
    let dragging = false;
    let startX = 0,
      startY = 0,
      startScrollLeft = 0,
      startScrollTop = 0;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = scroller.scrollLeft;
      startScrollTop = scroller.scrollTop;
      try {
        (e.target as Element).setPointerCapture?.(e.pointerId);
      } catch {}
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      scroller.scrollLeft = startScrollLeft - (e.clientX - startX);
      scroller.scrollTop = startScrollTop - (e.clientY - startY);
    };
    const onUp = () => {
      dragging = false;
    };
    scroller.addEventListener("pointerdown", onDown);
    scroller.addEventListener("pointermove", onMove);
    scroller.addEventListener("pointerup", onUp);
    scroller.addEventListener("pointercancel", onUp);
    return () => {
      scroller.removeEventListener("pointerdown", onDown);
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerup", onUp);
      scroller.removeEventListener("pointercancel", onUp);
    };
  }, [isPanning]);

  // Expose a small imperative API so the sidebar can delete a highlight by id.
  // Removing the annotation here fires the plugin's 'delete' event, which the
  // effect below catches → removes the highlights row → onHighlightRemoved.
  useEffect(() => {
    if (!annotation) return;
    props.onAnnotationApiReady?.({
      deleteHighlight: (id, pageIndex) => {
        annotation.deleteAnnotation(pageIndex, id);
      },
    });
    return () => props.onAnnotationApiReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotation]);

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
    for (const f of props.initialFreetexts) {
      if (!f.range_v2) continue;
      ourIds.current.add(f.id);
      annotation.createAnnotation(f.range_v2.pageIndex ?? f.page_number - 1, {
        ...f.range_v2,
        id: f.id,
        type: PdfAnnotationSubtype.FREETEXT,
        contents: f.contents,
      } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotation]);

  // After EmbedPDF has finished loading native annotations from the PDF file
  // itself, scan each page for HIGHLIGHT annotations we don't know about and
  // turn them into vocabulary cards + highlights rows. The annotation plugin
  // emits a "loaded" event once getAllAnnotations resolves, but DocumentSurface
  // only mounts after isLoaded is true, by which time we may have already
  // missed that event. So we run an active scan and also re-subscribe.
  const scanInFlight = useRef(false);
  useEffect(() => {
    if (!annotation) return;
    let cancelled = false;
    const runScan = async (evtTotal?: number) => {
      if (scanInFlight.current || cancelled) return;
      scanInFlight.current = true;
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        scanInFlight.current = false;
        return;
      }

      // Iterate every page; getPageAnnotations rejects when pageIndex exceeds
      // the doc, so taskToPromise returns null → break.
      const candidates: Array<{ pageIndex: number; ann: any }> = [];
      let allAnnotations = 0;
      let nativeHighlights = 0;
      let emptyStreak = 0;
      for (let p = 0; p < 2000; p++) {
        const task = annotation.getPageAnnotations({ pageIndex: p });
        const list = await taskToPromise<any[]>(task as any);
        if (!list) break;
        allAnnotations += list.length;
        if (list.length === 0) {
          emptyStreak++;
          if (emptyStreak > Math.max((evtTotal ?? 0) + 5, 50)) break;
        } else {
          emptyStreak = 0;
        }
        for (const a of list) {
          if (a?.type === PdfAnnotationSubtype.HIGHLIGHT) {
            nativeHighlights++;
            if (!ourIds.current.has(a.id)) candidates.push({ pageIndex: p, ann: a });
          }
        }
      }
      console.info(
        `[highlight-import] page-scan: ${allAnnotations} annotations, ${nativeHighlights} highlights, ${candidates.length} new candidates`,
      );
      if (candidates.length === 0) {
        scanInFlight.current = false;
        return;
      }

      // De-dupe against existing rows. EmbedPDF generates a fresh UUID per
      // session for PDF-native highlights (the file lacks a stable NM), so
      // ann.id is not stable across reloads. Match by content: page + first
      // segmentRect (x,y,w,h rounded). This is unique enough for our needs.
      const fingerprint = (pageIndex: number, ann: any) => {
        const seg = ann.segmentRects?.[0];
        if (!seg) return `${pageIndex}::nofp`;
        const x = Math.round(seg.origin.x);
        const y = Math.round(seg.origin.y);
        const w = Math.round(seg.size.width);
        const h = Math.round(seg.size.height);
        return `${pageIndex}:${x}:${y}:${w}:${h}`;
      };
      const { data: existingRows } = await supabase
        .from("highlights")
        .select("id, page_number, range_v2")
        .eq("document_id", props.documentId);
      const existingFingerprints = new Set<string>();
      for (const r of (existingRows ?? []) as any[]) {
        const seg = r.range_v2?.segmentRects?.[0];
        if (seg) {
          existingFingerprints.add(
            `${r.page_number - 1}:${Math.round(seg.origin.x)}:${Math.round(seg.origin.y)}:${Math.round(seg.size.width)}:${Math.round(seg.size.height)}`,
          );
        }
      }

      // Cache page text runs so we only fetch each page once.
      const runsByPage = new Map<number, any[]>();
      const getRuns = async (pageIndex: number): Promise<any[]> => {
        if (runsByPage.has(pageIndex)) return runsByPage.get(pageIndex)!;
        if (!pdfDoc) return [];
        const page = pdfDoc.pages.find((p: any) => p.index === pageIndex);
        if (!page) return [];
        const res = await taskToPromise<{ runs: any[] }>(
          engine.getPageTextRuns(pdfDoc, page) as any,
        );
        const runs = res?.runs ?? [];
        runsByPage.set(pageIndex, runs);
        return runs;
      };

      for (const { pageIndex, ann } of candidates) {
        if (cancelled) return;
        if (existingFingerprints.has(fingerprint(pageIndex, ann))) continue;
        let rawText: string = typeof ann.contents === "string" ? ann.contents : "";
        if (!rawText.trim() && Array.isArray(ann.segmentRects) && ann.segmentRects.length) {
          // Fall back: pick text runs whose bbox *overlaps* any segmentRect
          // (not just whose center falls inside — runs can span many glyphs
          // and their centers drift outside tight highlight rects, which is
          // why many native highlights produced no card). Shrink the run
          // rect slightly so adjacent non-highlighted runs touching the edge
          // don't get pulled in.
          const runs = await getRuns(pageIndex);
          const matched: any[] = [];
          for (const run of runs) {
            const rx = run.rect.origin.x;
            const ry = run.rect.origin.y;
            const rw = run.rect.size.width;
            const rh = run.rect.size.height;
            // A run can span an entire line in some PDFs. Require both:
            //   (a) at least 50% of the run's width sits inside the seg
            //       horizontally — rejects whole-line runs when the
            //       highlight only covers one word.
            //   (b) the run's vertical center is inside the seg's y-band
            //       (with a small slack) — rejects adjacent lines.
            const cy = ry + rh / 2;
            for (const seg of ann.segmentRects) {
              const sx = seg.origin.x;
              const sy = seg.origin.y;
              const sw = seg.size.width;
              const sh = seg.size.height;
              const overlapX = Math.max(
                0,
                Math.min(rx + rw, sx + sw) - Math.max(rx, sx),
              );
              const inXEnough = rw === 0 ? false : overlapX / rw >= 0.5;
              const slackY = rh * 0.25;
              const inY = cy >= sy - slackY && cy <= sy + sh + slackY;
              if (inXEnough && inY) {
                matched.push(run);
                break;
              }
            }
          }
          matched.sort((a, b) => a.charIndex - b.charIndex);
          // Many PDFs emit one glyph per text run; joining with a separator
          // would shatter words. Join raw and let repairText collapse any
          // residual whitespace from intentional spaces inside run text.
          rawText = matched.map((r) => r.text).join("");
        }
        const cleanText = repairText(rawText).trim();
        if (!cleanText) continue;
        const wholeWords = cleanText.match(/\b[A-Za-z][A-Za-z'-]+\b/g) ?? [];
        let word = wholeWords[0] ?? "";
        if (!word) {
          const runs = cleanText.match(/[A-Za-z]{2,}/g) ?? [];
          word = runs.sort((a, b) => b.length - a.length)[0] ?? "";
        }
        word = word.toLowerCase();
        if (!word) continue; // user said: skip non-English

        // upsert vocabulary
        let vocabularyId: string | undefined;
        let createdVocab = false;
        const existingVocab = await supabase
          .from("vocabulary")
          .select("id")
          .eq("user_id", user.id)
          .eq("word", word)
          .maybeSingle();
        vocabularyId = existingVocab.data?.id;
        if (!vocabularyId) {
          const ins = await supabase
            .from("vocabulary")
            .insert({ user_id: user.id, word })
            .select("id")
            .single();
          vocabularyId = ins.data?.id;
          if (vocabularyId) createdVocab = true;
        }

        // Reuse the EmbedPDF native annotation id as the highlights row id so
        // the delete-event handler (which surfaces evt.annotation.id) can
        // resolve to the row, and range_v2 has a stable id on the first
        // insert — no second UPDATE needed.
        const highlightId: string = ann.id;
        const range_v2: SavedAnnotation = {
          id: highlightId,
          pageIndex,
          rect: ann.rect,
          segmentRects: ann.segmentRects ?? [],
          color: ann.color ?? HIGHLIGHT_COLOR,
          opacity: ann.opacity ?? 0.5,
          type: PdfAnnotationSubtype.HIGHLIGHT,
        };

        const { data, error: insErr } = await supabase
          .from("highlights")
          .insert({
            id: highlightId,
            user_id: user.id,
            document_id: props.documentId,
            vocabulary_id: vocabularyId,
            page_number: pageIndex + 1,
            word,
            context_sentence: cleanText,
            range_json: null,
            range_v2,
          })
          .select("*")
          .single();
        if (insErr || !data) {
          if (createdVocab && vocabularyId) {
            await supabase.from("vocabulary").delete().eq("id", vocabularyId);
          }
          console.warn("Native highlight import failed for", word, insErr?.message);
          continue;
        }
        ourIds.current.add((data as any).id);
        existingFingerprints.add(fingerprint(pageIndex, ann));
        props.onHighlightAdded(data as HighlightRow);

        void postDictionaryWithRetry(word, props.onVocabUpserted);
      }
      scanInFlight.current = false;
    };

    // 1) Subscribe in case we attach before the loaded event fires.
    const off = annotation.onAnnotationEvent((evt: any) => {
      if (evt.type === "loaded") runScan(evt.total);
    });
    // 2) Also kick a scan now — getPageAnnotations works after the engine
    //    has loaded annotations. If the loaded event already fired before we
    //    mounted, this is what catches them. The flag guards against double
    //    runs if both paths fire.
    const t = setTimeout(() => runScan(undefined), 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotation]);

  // Listen for delete / create / update events — the annotation layer lets
  // users right-click / tap a highlight and remove it, draw a new free-text
  // box, drag it, or edit its contents. Mirror everything to the DB.
  useEffect(() => {
    if (!annotation) return;
    const off = annotation.onAnnotationEvent(async (evt: any) => {
      const supabase = createSupabaseBrowserClient();

      if (evt.type === "delete") {
        const id = evt.annotation.id;
        // Try highlights, underlines, then freetexts.
        const { data: hRow } = await supabase
          .from("highlights")
          .select("id, word")
          .eq("id", id)
          .maybeSingle();
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
          return;
        }
        await supabase.from("freetext_annotations").delete().eq("id", id);
        ourIds.current.delete(id);
        return;
      }

      if (evt.type === "create") {
        const ann = evt.annotation;
        if (ann.type !== PdfAnnotationSubtype.FREETEXT) return;
        if (ourIds.current.has(ann.id)) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const pageIndex = evt.pageIndex ?? ann.pageIndex ?? 0;
        ourIds.current.add(ann.id);
        await supabase.from("freetext_annotations").insert({
          id: ann.id,
          user_id: user.id,
          document_id: props.documentId,
          page_number: pageIndex + 1,
          contents: ann.contents ?? "",
          range_v2: { ...ann, pageIndex },
        });
        return;
      }

      if (evt.type === "update") {
        const ann = evt.annotation;
        if (ann.type !== PdfAnnotationSubtype.FREETEXT) return;
        if (!ourIds.current.has(ann.id)) return;
        const merged = { ...ann, ...(evt.patch ?? {}) };
        await supabase
          .from("freetext_annotations")
          .update({
            contents: merged.contents ?? "",
            range_v2: merged,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ann.id);
        return;
      }
    });
    return () => off();
  }, [annotation, props]);

  return (
    <div className="flex h-full flex-col" ref={surfaceRef}>
      <PdfToolbar documentId={embedDocId} />
      <div className="relative min-h-0 flex-1">
        <PdfSearchBar documentId={embedDocId} />
        <Viewport documentId={embedDocId} style={{ height: "100%" }}>
          <GlobalPointerProvider documentId={embedDocId}>
          <ZoomGestureWrapper
            documentId={embedDocId}
            enablePinch
            enableWheel
          >
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
            <SearchLayer
              documentId={embedDocId}
              pageIndex={pageIndex}
              highlightColor="rgba(255, 213, 0, 0.35)"
              activeHighlightColor="rgba(255, 140, 0, 0.55)"
            />
            <AnnotationLayer
              documentId={embedDocId}
              pageIndex={pageIndex}
              selectionMenu={({ selected, menuWrapperProps, placement, context }) => {
                if (!selected || context.structurallyLocked) return null;
                const annType = context.annotation.object.type;
                if (
                  annType !== PdfAnnotationSubtype.HIGHLIGHT &&
                  annType !== PdfAnnotationSubtype.UNDERLINE &&
                  annType !== PdfAnnotationSubtype.FREETEXT
                ) {
                  return null;
                }
                const above = placement?.suggestTop ?? true;
                const label =
                  annType === PdfAnnotationSubtype.HIGHLIGHT
                    ? "Remove highlight"
                    : annType === PdfAnnotationSubtype.UNDERLINE
                      ? "Remove underline"
                      : "Delete text";
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
                      <div
                        className="flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            annotation?.deleteAnnotation(
                              context.pageIndex,
                              context.annotation.object.id,
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                          {label}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }}
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
          </ZoomGestureWrapper>
          </GlobalPointerProvider>
        </Viewport>
      </div>
    </div>
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
    let createdVocab = false;
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
      if (vocabularyId) createdVocab = true;
    }

    // Pre-generate the row id so range_v2.id is correct on first insert — no
    // more placeholder + follow-up UPDATE (which had no error handling and
    // could leave range_v2.id stuck at "<row>").
    const highlightId = crypto.randomUUID();
    const range_v2: SavedAnnotation = {
      id: highlightId,
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
        id: highlightId,
        user_id: user.id,
        document_id: props.documentId,
        vocabulary_id: vocabularyId,
        page_number: pageIndex + 1,
        word,
        context_sentence: cleanText,
        range_json: null,
        range_v2,
      })
      .select("*")
      .single();
    if (error || !data) {
      // Roll back the vocabulary row we just created so we don't leave an
      // orphan that the unique(user_id, word) constraint would later block.
      if (createdVocab && vocabularyId) {
        await supabase.from("vocabulary").delete().eq("id", vocabularyId);
      }
      toast.error(error?.message ?? "Save failed");
      return;
    }

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
    props.onHighlightAdded(data as HighlightRow);

    void postDictionaryWithRetry(word, props.onVocabUpserted);
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

// Fire dictionary lookup with bounded retries. Prior implementation was
// fire-and-forget with a swallowed catch — transient upstream failures left
// vocabulary rows permanently without definitions and the ReaderWorkspace
// polling loop only SELECTs, never re-POSTs.
async function postDictionaryWithRetry(
  word: string,
  onEntry: (entry: VocabularyEntry) => void,
): Promise<void> {
  const delays = [1000, 3000, 8000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const r = await fetch(`/api/dictionary/${encodeURIComponent(word)}`, { method: "POST" });
      if (r.ok) {
        const j = await r.json();
        if (j.entry) onEntry(j.entry as VocabularyEntry);
        return;
      }
    } catch {
      // network failure — fall through to retry
    }
    if (attempt < delays.length) {
      await new Promise((res) => setTimeout(res, delays[attempt]));
    }
  }
  console.warn(`Definition lookup failed for ${word}`);
  toast.error(`Definition lookup failed for ${word}`);
}
