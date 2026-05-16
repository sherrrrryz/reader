"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Check, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";

export type WritingComment = {
  id: string;
  version_id: string;
  range_start: number;
  range_end: number;
  selected_text: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type WritingVersion = {
  id: string;
  writing_id: string;
  content: string;
  version_number: number;
  created_at: string;
};

export type WritingDetailData = {
  writing: { id: string; title: string; created_at: string; updated_at: string };
  versions: WritingVersion[];
  comments: WritingComment[];
};

type Mode = "read" | "edit" | "annotate";

function fmt(d: string) {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WritingDetail({ data }: { data: WritingDetailData }) {
  const router = useRouter();
  const { writing, versions, comments } = data;

  const latest = versions[0];
  const older = versions.slice(1);

  const [title, setTitle] = useState(writing.title);
  const [savingTitle, setSavingTitle] = useState(false);

  async function commitTitle(next: string) {
    const trimmed = next.trim();
    if (trimmed === writing.title) return;
    setSavingTitle(true);
    try {
      const res = await fetch(`/api/writings/${writing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Save failed");
        return;
      }
      router.refresh();
    } finally {
      setSavingTitle(false);
    }
  }

  const commentsByVersion = useMemo(() => {
    const map = new Map<string, WritingComment[]>();
    for (const c of comments) {
      const arr = map.get(c.version_id) ?? [];
      arr.push(c);
      map.set(c.version_id, arr);
    }
    return map;
  }, [comments]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild aria-label="Back">
          <Link href="/writing">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => commitTitle(title)}
          placeholder="Untitled"
          className="text-lg font-semibold border-0 shadow-none focus-visible:ring-0 px-2"
          disabled={savingTitle}
        />
      </div>

      {latest && (
        <VersionCard
          writingId={writing.id}
          version={latest}
          comments={commentsByVersion.get(latest.id) ?? []}
          editable
          onChanged={() => router.refresh()}
        />
      )}

      {older.map((v) => (
        <VersionCard
          key={v.id}
          writingId={writing.id}
          version={v}
          comments={commentsByVersion.get(v.id) ?? []}
          editable={false}
          onChanged={() => router.refresh()}
        />
      ))}
    </div>
  );
}

/* ─────────────── VersionCard ─────────────── */

function VersionCard({
  writingId,
  version,
  comments,
  editable,
  onChanged,
}: {
  writingId: string;
  version: WritingVersion;
  comments: WritingComment[];
  editable: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("read");
  const [draft, setDraft] = useState(version.content);
  const [saving, setSaving] = useState(false);
  const [confirmBranchOpen, setConfirmBranchOpen] = useState(false);

  useEffect(() => {
    setDraft(version.content);
  }, [version.content]);

  async function performSaveInPlace() {
    const res = await fetch(`/api/writings/${writingId}/versions/${version.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "save_failed");
    }
  }

  async function performSaveAsNewVersion() {
    const res = await fetch(`/api/writings/${writingId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "save_failed");
    }
  }

  async function handleSave() {
    if (saving) return;
    if (draft === version.content) {
      setMode("read");
      return;
    }
    if (comments.length > 0) {
      setConfirmBranchOpen(true);
      return;
    }
    setSaving(true);
    try {
      await performSaveInPlace();
      toast.success("Saved");
      setMode("read");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmBranch() {
    setConfirmBranchOpen(false);
    setSaving(true);
    try {
      await performSaveAsNewVersion();
      toast.success("New version saved");
      setMode("read");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(version.content);
    setMode("read");
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="text-xs text-muted-foreground">
          v{version.version_number} · {fmt(version.created_at)}
          {comments.length > 0 && (
            <span className="ml-2">
              · {comments.length} comment{comments.length === 1 ? "" : "s"}
            </span>
          )}
          {!editable && <span className="ml-2 italic">(read-only)</span>}
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            {mode === "read" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button size="sm" onClick={() => setMode("annotate")}>
                  <MessageSquarePlus className="size-3.5" /> Start review
                </Button>
              </>
            )}
            {mode === "edit" && (
              <>
                <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                  <X className="size-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Check className="size-3.5" /> {saving ? "Saving…" : "Save"}
                </Button>
              </>
            )}
            {mode === "annotate" && (
              <Button size="sm" variant="outline" onClick={() => setMode("read")}>
                Done
              </Button>
            )}
          </div>
        )}
      </div>

      {mode === "edit" ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Start writing…"
          className="w-full min-h-[200px] resize-y border-0 bg-transparent p-0 text-base leading-7 focus:outline-none whitespace-pre-wrap"
          autoFocus
        />
      ) : (
        <ReadableContent
          writingId={writingId}
          versionId={version.id}
          content={version.content}
          comments={comments}
          annotating={mode === "annotate"}
          onChanged={onChanged}
        />
      )}

      <AlertDialog open={confirmBranchOpen} onOpenChange={setConfirmBranchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save as a new version?</AlertDialogTitle>
            <AlertDialogDescription>
              This version has {comments.length} comment{comments.length === 1 ? "" : "s"}. Saving
              your edits will create a new version on top; the current version and its comments
              will be frozen as read-only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBranch}>Create new version</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─────────────── ReadableContent ─────────────── */

type Segment = { start: number; end: number; commentIds: string[] };

function buildSegments(content: string, comments: WritingComment[]): Segment[] {
  if (content.length === 0) return [];
  const points = new Set<number>([0, content.length]);
  for (const c of comments) {
    const s = Math.max(0, Math.min(content.length, c.range_start));
    const e = Math.max(0, Math.min(content.length, c.range_end));
    points.add(s);
    points.add(e);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const segs: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    const ids = comments
      .filter((c) => c.range_start <= start && c.range_end >= end && c.range_end > c.range_start)
      .map((c) => c.id);
    segs.push({ start, end, commentIds: ids });
  }
  return segs;
}

function ReadableContent({
  writingId,
  versionId,
  content,
  comments,
  annotating,
  onChanged,
}: {
  writingId: string;
  versionId: string;
  content: string;
  comments: WritingComment[];
  annotating: boolean;
  onChanged: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; rect: DOMRect } | null>(
    null,
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [activeCommentIds, setActiveCommentIds] = useState<string[] | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);

  const segments = useMemo(() => buildSegments(content, comments), [content, comments]);

  const handleSelectionEnd = useCallback(() => {
    if (!annotating) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const root = containerRef.current;
    if (!root || !root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      setSelection(null);
      return;
    }
    const start = offsetWithinRoot(root, range.startContainer, range.startOffset);
    const end = offsetWithinRoot(root, range.endContainer, range.endOffset);
    if (start === null || end === null || start === end) {
      setSelection(null);
      return;
    }
    const [s, e] = start < end ? [start, end] : [end, start];
    const rect = range.getBoundingClientRect();
    setSelection({ start: s, end: e, rect });
  }, [annotating]);

  useEffect(() => {
    if (!annotating) {
      setSelection(null);
      setComposerOpen(false);
    }
  }, [annotating]);

  function onHighlightClick(ids: string[], target: HTMLElement) {
    if (ids.length === 0) return;
    setActiveCommentIds(ids);
    setPopoverRect(target.getBoundingClientRect());
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="text-base leading-7 whitespace-pre-wrap"
        onMouseUp={handleSelectionEnd}
      >
        {content.length === 0 ? (
          <span className="text-muted-foreground italic">
            Empty — click Edit to start writing.
          </span>
        ) : (
          segments.map((seg, i) => {
            const text = content.slice(seg.start, seg.end);
            if (seg.commentIds.length === 0) {
              return <span key={i}>{text}</span>;
            }
            const depth = Math.min(seg.commentIds.length, 3);
            const bg =
              depth === 1
                ? "rgba(250, 204, 21, 0.35)"
                : depth === 2
                  ? "rgba(250, 204, 21, 0.55)"
                  : "rgba(250, 204, 21, 0.75)";
            return (
              <mark
                key={i}
                data-comment-ids={seg.commentIds.join(",")}
                style={{
                  backgroundColor: bg,
                  cursor: "pointer",
                  padding: "0 1px",
                  borderRadius: 2,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onHighlightClick(seg.commentIds, e.currentTarget);
                }}
              >
                {text}
              </mark>
            );
          })
        )}
      </div>

      {annotating && selection && !composerOpen && (
        <FloatingToolbar
          rect={selection.rect}
          containerRef={containerRef}
          onComment={() => setComposerOpen(true)}
        />
      )}

      {annotating && selection && composerOpen && (
        <CommentComposer
          rect={selection.rect}
          containerRef={containerRef}
          writingId={writingId}
          versionId={versionId}
          range={{ start: selection.start, end: selection.end }}
          selectedText={content.slice(selection.start, selection.end)}
          onClose={() => {
            setComposerOpen(false);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
          onCreated={() => {
            setComposerOpen(false);
            setSelection(null);
            window.getSelection()?.removeAllRanges();
            onChanged();
          }}
        />
      )}

      {activeCommentIds && popoverRect && (
        <CommentPopover
          comments={comments.filter((c) => activeCommentIds.includes(c.id))}
          rect={popoverRect}
          containerRef={containerRef}
          onClose={() => setActiveCommentIds(null)}
          onChanged={() => {
            setActiveCommentIds(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function offsetWithinRoot(root: Node, target: Node, offsetInTarget: number): number | null {
  // Text-node case: walk text nodes in order; sum lengths until target matches.
  if (target.nodeType === Node.TEXT_NODE) {
    let total = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      if (node === target) return total + offsetInTarget;
      total += (node.textContent ?? "").length;
      node = walker.nextNode();
    }
    return null;
  }
  // Element case: offsetInTarget indexes child nodes; sum text from preceding root
  // text nodes plus length of children[0..offset-1] inside this element.
  if (target.nodeType === Node.ELEMENT_NODE) {
    const el = target as Element;
    let inside = 0;
    for (let i = 0; i < Math.min(offsetInTarget, el.childNodes.length); i++) {
      inside += (el.childNodes[i].textContent ?? "").length;
    }
    let before = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      if (el.contains(node)) break;
      before += (node.textContent ?? "").length;
      node = walker.nextNode();
    }
    return before + inside;
  }
  return null;
}

/* ─────────────── Floating toolbar ─────────────── */

function FloatingToolbar({
  rect,
  containerRef,
  onComment,
}: {
  rect: DOMRect;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onComment: () => void;
}) {
  const style = positionAbove(rect, containerRef);
  return (
    <div
      style={style}
      className="absolute z-20 flex items-center gap-1 rounded-md border bg-popover px-1 py-1 shadow-md"
    >
      <Button
        size="sm"
        variant="ghost"
        onMouseDown={(e) => {
          // Prevent the mousedown from collapsing the selection before we capture it.
          e.preventDefault();
        }}
        onClick={onComment}
        className="h-7 gap-1 px-2 text-xs"
      >
        <MessageSquarePlus className="size-3.5" /> Comment
      </Button>
    </div>
  );
}

function positionAbove(
  rect: DOMRect,
  containerRef: React.RefObject<HTMLDivElement | null>,
): React.CSSProperties {
  const container = containerRef.current;
  if (!container) return { display: "none" };
  const parentRect = container.getBoundingClientRect();
  return {
    position: "absolute",
    top: rect.top - parentRect.top - 36,
    left: rect.left - parentRect.left + rect.width / 2,
    transform: "translateX(-50%)",
  };
}

function positionBelow(
  rect: DOMRect,
  containerRef: React.RefObject<HTMLDivElement | null>,
): React.CSSProperties {
  const container = containerRef.current;
  if (!container) return { display: "none" };
  const parentRect = container.getBoundingClientRect();
  return {
    position: "absolute",
    top: rect.bottom - parentRect.top + 6,
    left: Math.max(0, rect.left - parentRect.left),
  };
}

/* ─────────────── Comment composer ─────────────── */

function CommentComposer({
  rect,
  containerRef,
  writingId,
  versionId,
  range,
  selectedText,
  onClose,
  onCreated,
}: {
  rect: DOMRect;
  containerRef: React.RefObject<HTMLDivElement | null>;
  writingId: string;
  versionId: string;
  range: { start: number; end: number };
  selectedText: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const style = positionBelow(rect, containerRef);

  async function submit() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/writings/${writingId}/versions/${versionId}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            range_start: range.start,
            range_end: range.end,
            selected_text: selectedText,
            body: text.trim(),
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Save failed");
        setSaving(false);
        return;
      }
      toast.success("Comment added");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div
      style={style}
      className="absolute z-20 w-72 rounded-md border bg-popover p-3 shadow-md space-y-2"
    >
      <div className="text-xs text-muted-foreground line-clamp-2">“{selectedText}”</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment…"
        className="w-full min-h-[80px] resize-y rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-1"
        autoFocus
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={saving || !text.trim()}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

/* ─────────────── Comment popover ─────────────── */

function CommentPopover({
  comments,
  rect,
  containerRef,
  onClose,
  onChanged,
}: {
  comments: WritingComment[];
  rect: DOMRect;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const style = positionBelow(rect, containerRef);
  return (
    <div
      style={style}
      className="absolute z-20 w-80 rounded-md border bg-popover p-3 shadow-md space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">
          {comments.length} comment{comments.length === 1 ? "" : "s"}
        </div>
        <Button size="icon" variant="ghost" className="size-6" onClick={onClose} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="max-h-64 overflow-auto space-y-2">
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  onChanged,
}: {
  comment: WritingComment;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/writings/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text.trim() }),
      });
      if (!res.ok) {
        toast.error("Save failed");
        return;
      }
      toast.success("Updated");
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/writings/comments/${comment.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Delete failed");
        return;
      }
      toast.success("Deleted");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border bg-background p-2 space-y-2">
      <div className="text-[11px] text-muted-foreground line-clamp-1">
        “{comment.selected_text}”
      </div>
      {editing ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full min-h-[60px] rounded-md border bg-background p-2 text-sm focus:outline-none focus:ring-1"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setText(comment.body);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy || !text.trim()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm whitespace-pre-wrap">{comment.body}</div>
          <div className="flex items-center justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              <Pencil className="size-3" /> Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
              onClick={remove}
              disabled={busy}
            >
              <Trash2 className="size-3" /> Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
