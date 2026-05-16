"use client";

import { useEffect, useRef, useState } from "react";
import {
  useSearch,
  useSearchCapability,
} from "@embedpdf/plugin-search/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, X } from "lucide-react";

export function PdfSearchBar({ documentId }: { documentId: string }) {
  const search = useSearchCapability().provides;
  const { state } = useSearch(documentId);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isF = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f";
      if (isF) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        search?.stopSearch(documentId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, search, documentId]);

  if (!open) return null;

  return (
    <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md">
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          if (v.trim()) {
            search?.searchAllPages(v, documentId);
          } else {
            search?.stopSearch(documentId);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) search?.previousResult(documentId);
            else search?.nextResult(documentId);
          }
        }}
        placeholder="在 PDF 中搜索…"
        className="h-7 w-56"
      />
      <span className="min-w-12 px-1 text-center text-xs tabular-nums text-muted-foreground">
        {state.loading
          ? "…"
          : state.total > 0
            ? `${state.activeResultIndex + 1}/${state.total}`
            : q
              ? "0"
              : ""}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => search?.previousResult(documentId)}
        title="上一个"
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => search?.nextResult(documentId)}
        title="下一个"
      >
        <ChevronDown className="size-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          search?.stopSearch(documentId);
        }}
        title="关闭"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
