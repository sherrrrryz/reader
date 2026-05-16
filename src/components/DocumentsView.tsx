"use client";

import { useMemo, useState } from "react";
import { DocumentCard, type DocumentRow } from "@/components/DocumentCard";
import type { TagItem } from "@/components/TagEditorDialog";
import { tagStyle } from "@/lib/tag-color";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  docs: DocumentRow[];
  allTags: TagItem[];
};

export function DocumentsView({ docs, allTags }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    if (selected.size === 0) return docs;
    return docs.filter((d) => d.tags.some((t) => selected.has(t.id)));
  }, [docs, selected]);

  return (
    <div className="space-y-4">
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filter by tag:</span>
          {allTags.map((t) => {
            const active = selected.has(t.id);
            return (
              <Badge
                key={t.id}
                asChild
                variant="outline"
                className={`cursor-pointer transition ${
                  active ? "ring-2 ring-offset-1 ring-primary" : "opacity-70 hover:opacity-100"
                }`}
                style={tagStyle(t.name)}
              >
                <button type="button" onClick={() => toggle(t.id)}>
                  {t.name}
                </button>
              </Badge>
            );
          })}
          {selected.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="h-6 px-2 text-xs text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {docs.length === 0
            ? "No documents yet — click the button above to upload a PDF."
            : "No documents match the selected tags."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => (
            <DocumentCard key={d.id} doc={d} allTags={allTags} />
          ))}
        </div>
      )}
    </div>
  );
}
