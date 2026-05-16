"use client";

import {
  useZoomCapability,
  useZoom,
  ZoomMode,
} from "@embedpdf/plugin-zoom/react";
import { usePanCapability, usePan } from "@embedpdf/plugin-pan/react";
import { Button } from "@/components/ui/button";
import { Hand, Maximize2, Minus, MoveHorizontal, Plus } from "lucide-react";

export function PdfToolbar({ documentId }: { documentId: string }) {
  const zoom = useZoomCapability().provides;
  const { state: zoomState } = useZoom(documentId);
  const pan = usePanCapability().provides;
  const { isPanning } = usePan(documentId);

  const pct = Math.round((zoomState?.currentZoomLevel ?? 1) * 100);

  return (
    <div className="flex items-center gap-1 border-b bg-background/60 px-2 py-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => zoom?.zoomOut()}
        title="缩小"
      >
        <Minus className="size-4" />
      </Button>
      <span className="min-w-12 text-center text-xs tabular-nums">{pct}%</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => zoom?.zoomIn()}
        title="放大"
      >
        <Plus className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => zoom?.requestZoom(ZoomMode.FitWidth)}
        title="适合宽度"
      >
        <MoveHorizontal className="size-4" />
        宽
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => zoom?.requestZoom(ZoomMode.FitPage)}
        title="适合页面"
      >
        <Maximize2 className="size-4" />
        页
      </Button>
      <Button
        size="sm"
        variant={isPanning ? "default" : "ghost"}
        onClick={() => pan?.togglePan()}
        title="抓手（拖拽平移）"
      >
        <Hand className="size-4" />
      </Button>
    </div>
  );
}
