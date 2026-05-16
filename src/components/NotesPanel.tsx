"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";

export type NoteEntry = {
  id: string;
  document_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function NoteItem({
  note,
  documentId,
  onUpdated,
  onDeleted,
}: {
  note: NoteEntry;
  documentId: string;
  onUpdated: (n: NoteEntry) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const text = draft.trim();
    if (!text) {
      toast.error("Note cannot be empty");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/documents/${documentId}/notes/${note.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Failed to update note");
      return;
    }
    const { note: updated } = (await res.json()) as { note: NoteEntry };
    onUpdated(updated);
    setEditing(false);
  };

  const remove = async () => {
    if (!confirm("Delete this note?")) return;
    setBusy(true);
    const res = await fetch(`/api/documents/${documentId}/notes/${note.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Failed to delete note");
      return;
    }
    onDeleted(note.id);
  };

  return (
    <Card>
      <CardContent className="py-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setDraft(note.body);
                  setEditing(false);
                }}
                disabled={busy}
              >
                <X className="size-3" />
                Cancel
              </Button>
              <Button size="xs" onClick={save} disabled={busy}>
                <Check className="size-3" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(note.updated_at)}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setEditing(true)}
                aria-label="Edit note"
              >
                <Pencil className="size-3" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={remove}
                disabled={busy}
                aria-label="Delete note"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function NotesPanel({
  documentId,
  initialNotes,
}: {
  documentId: string;
  initialNotes: NoteEntry[];
}) {
  const [notes, setNotes] = useState<NoteEntry[]>(initialNotes);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const text = draft.trim();
    if (!text) {
      toast.error("Note cannot be empty");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/documents/${documentId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error("Failed to add note");
      return;
    }
    const { note } = (await res.json()) as { note: NoteEntry };
    setNotes((arr) => [note, ...arr]);
    setDraft("");
    setAdding(false);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Notes ({notes.length})</h2>
        {!adding && (
          <Button size="xs" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="size-3" />
            Add
          </Button>
        )}
      </div>
      {adding && (
        <div className="mb-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="Write a note about this document…"
            className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setDraft("");
                setAdding(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button size="xs" onClick={create} disabled={busy}>
              Save
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {notes.length === 0 && !adding ? (
          <p className="text-xs text-muted-foreground">
            No notes yet. Click Add to write one.
          </p>
        ) : (
          notes.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              documentId={documentId}
              onUpdated={(u) =>
                setNotes((arr) => arr.map((x) => (x.id === u.id ? u : x)))
              }
              onDeleted={(id) => setNotes((arr) => arr.filter((x) => x.id !== id))}
            />
          ))
        )}
      </div>
    </section>
  );
}
