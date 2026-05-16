"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { tagStyle } from "@/lib/tag-color";

export type TagItem = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  documentTitle: string;
  attachedTagIds: string[];
  allTags: TagItem[];
};

export function TagEditorDialog({
  open,
  onOpenChange,
  documentId,
  documentTitle,
  attachedTagIds,
  allTags,
}: Props) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const attachedSet = useMemo(() => new Set(attachedTagIds), [attachedTagIds]);
  const sortedTags = useMemo(
    () => [...allTags].sort((a, b) => a.name.localeCompare(b.name)),
    [allTags],
  );

  async function refresh() {
    router.refresh();
  }

  async function handleToggle(tag: TagItem) {
    if (busy) return;
    setBusy(true);
    try {
      if (attachedSet.has(tag.id)) {
        const res = await fetch(`/api/documents/${documentId}/tags/${tag.id}`, { method: "DELETE" });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(b?.error ?? "Failed to remove");
          return;
        }
      } else {
        const res = await fetch(`/api/documents/${documentId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId: tag.id }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.error(b?.error ?? "Failed to add");
          return;
        }
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(b?.error ?? "Failed to create");
        return;
      }
      setNewName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function startRename(tag: TagItem) {
    setEditingId(tag.id);
    setEditingValue(tag.name);
  }

  async function commitRename() {
    if (!editingId) return;
    const next = editingValue.trim();
    const current = allTags.find((t) => t.id === editingId);
    if (!current || !next || next === current.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tags/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(b?.error === "name_taken" ? "Name already exists" : (b?.error ?? "Failed to rename"));
        return;
      }
      setEditingId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTag(tag: TagItem) {
    if (busy) return;
    const ok = window.confirm(`Delete tag "${tag.name}"? This tag will be removed from all documents (the documents themselves are kept).`);
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(b?.error ?? "Failed to delete");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[28rem] overflow-hidden sm:max-w-[28rem]">
        <DialogHeader className="min-w-0">
          <DialogTitle
            className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pr-8"
            title={documentTitle}
          >
            {documentTitle}
          </DialogTitle>
          <DialogDescription>Add, remove, or manage tags. Renaming a tag updates it across every document that uses it.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Create a new tag and add it to this document"
              maxLength={32}
              disabled={busy}
            />
            <Button onClick={handleCreate} disabled={busy || !newName.trim()}>
              Add
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">All tags</p>
            {sortedTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tags yet. Use the input above to create your first one.</p>
            ) : (
              <ul className="space-y-1">
                {sortedTags.map((tag) => {
                  const attached = attachedSet.has(tag.id);
                  const isEditing = editingId === tag.id;
                  return (
                    <li
                      key={tag.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50"
                    >
                      {isEditing ? (
                        <>
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitRename();
                              } else if (e.key === "Escape") {
                                setEditingId(null);
                              }
                            }}
                            maxLength={32}
                            disabled={busy}
                            autoFocus
                            className="h-7 flex-1"
                          />
                          <Button size="icon" variant="ghost" className="size-7" onClick={commitRename} disabled={busy}>
                            <Check className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingId(null)}>
                            <X className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggle(tag)}
                            disabled={busy}
                            className="flex flex-1 items-center gap-2 text-left"
                          >
                            <span
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                              style={tagStyle(tag.name)}
                            >
                              {tag.name}
                            </span>
                            {attached && <Check className="size-3.5 text-muted-foreground" />}
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-muted-foreground"
                            onClick={() => startRename(tag)}
                            aria-label="Rename"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteTag(tag)}
                            aria-label="Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
