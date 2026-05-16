"use client";

import { useEffect, useState } from "react";
import {
  useZoomCapability,
  useZoom,
  ZoomMode,
} from "@embedpdf/plugin-zoom/react";
import { usePanCapability, usePan } from "@embedpdf/plugin-pan/react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { Button } from "@/components/ui/button";
import { Hand, Maximize2, Minus, MoveHorizontal, Plus, Type } from "lucide-react";

export function PdfToolbar({ documentId }: { documentId: string }) {
  const zoom = useZoomCapability().provides;
  const { state: zoomState } = useZoom(documentId);
  const pan = usePanCapability().provides;
  const { isPanning } = usePan(documentId);
  const annotation = useAnnotationCapability().provides;
  const [activeToolId, setActiveToolId] = useState<string | null>(null);

  useEffect(() => {
    if (!annotation) return;
    setActiveToolId(annotation.getActiveTool()?.id ?? null);
    const off = annotation.onActiveToolChange((evt) => {
      setActiveToolId(evt.tool?.id ?? null);
    });
    return () => off();
  }, [annotation]);

  const pct = Math.round((zoomState?.currentZoomLevel ?? 1) * 100);
  const textActive = activeToolId === "freeText";

  return (
    <div className="flex items-center gap-1 border-b bg-background/60 px-2 py-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => zoom?.zoomOut()}
        title="Zoom out"
      >
        <Minus className="size-4" />
      </Button>
      <span className="min-w-12 text-center text-xs tabular-nums">{pct}%</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => zoom?.zoomIn()}
        title="Zoom in"
      >
        <Plus className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => zoom?.requestZoom(ZoomMode.FitWidth)}
        title="Fit width"
      >
        <MoveHorizontal className="size-4" />
        Width
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => zoom?.requestZoom(ZoomMode.FitPage)}
        title="Fit page"
      >
        <Maximize2 className="size-4" />
        Page
      </Button>
      <Button
        size="sm"
        variant={isPanning ? "default" : "ghost"}
        onClick={() => pan?.togglePan()}
        title="Hand (drag to pan)"
      >
        <Hand className="size-4" />
      </Button>
      <Button
        size="sm"
        variant={textActive ? "default" : "ghost"}
        onClick={() => annotation?.setActiveTool(textActive ? null : "freeText")}
        title="Text box (click on PDF to create draggable text)"
      >
        <Type className="size-4" />
      </Button>
    </div>
  );
}
