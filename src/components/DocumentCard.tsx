"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FileText, Tag as TagIcon, Trash2 } from "lucide-react";
import { tagStyle } from "@/lib/tag-color";
import { TagEditorDialog, type TagItem } from "@/components/TagEditorDialog";

export type DocumentRow = {
  id: string;
  title: string;
  created_at: string;
  page_count: number | null;
  extraction_status: string;
  ocr_used: boolean | null;
  tags: TagItem[];
};

function fmt(d: string) {
  return new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DocumentCard({ doc, allTags }: { doc: DocumentRow; allTags: TagItem[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const status = doc.extraction_status;
  const isProcessing = status === "pending" || status === "processing";

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Delete failed");
        setDeleting(false);
        return;
      }
      toast.success("Document deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  function openTagEditor(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setTagOpen(true);
  }

  return (
    <>
      <Card className={`relative h-full transition-shadow hover:shadow-md ${deleting ? "opacity-50" : ""}`}>
        <Link href={`/documents/${doc.id}`} className="absolute inset-0 z-0" aria-label={doc.title} />
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={deleting}
              aria-label="Delete document"
              className="absolute right-2 top-2 z-10 size-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{doc.title}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                Highlights and underlines in this document will be removed. Your saved vocabulary words are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <CardHeader className="flex flex-row items-start gap-3 pr-12">
          <div className="rounded-md bg-secondary p-2 text-secondary-foreground">
            <FileText className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate text-base">{doc.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{fmt(doc.created_at)}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {doc.page_count ? (
              <Badge variant="secondary">
                {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
              </Badge>
            ) : null}
            {doc.ocr_used ? <Badge variant="outline">OCR</Badge> : null}
            {isProcessing && <Badge>Parsing…</Badge>}
            {status === "error" && <Badge variant="destructive">Parse failed</Badge>}
          </div>
          <div className="relative z-10 flex flex-wrap items-center gap-1.5">
            {doc.tags.map((t) => (
              <Badge key={t.id} variant="outline" style={tagStyle(t.name)}>
                {t.name}
              </Badge>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={openTagEditor}
              className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            >
              <TagIcon className="size-3" />
              {doc.tags.length === 0 ? "Add tag" : "Edit"}
            </Button>
          </div>
        </CardContent>
      </Card>
      <TagEditorDialog
        open={tagOpen}
        onOpenChange={setTagOpen}
        documentId={doc.id}
        documentTitle={doc.title}
        attachedTagIds={doc.tags.map((t) => t.id)}
        allTags={allTags}
      />
    </>
  );
}
