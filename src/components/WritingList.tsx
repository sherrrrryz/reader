"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PenLine, Plus, Trash2 } from "lucide-react";

export type WritingRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
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

export function WritingList({ writings }: { writings: WritingRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return writings;
    return writings.filter((w) => (w.title || "Untitled").toLowerCase().includes(q));
  }, [writings, query]);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/writings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      });
      const json = (await res.json().catch(() => ({}))) as { writing?: { id: string }; error?: string };
      if (!res.ok || !json.writing) {
        toast.error(json.error ?? "Failed to create");
        setCreating(false);
        return;
      }
      router.push(`/writing/${json.writing.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by title"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto">
          <Button onClick={handleCreate} disabled={creating}>
            <Plus className="size-4" />
            {creating ? "Creating…" : "New Writing"}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {writings.length === 0
            ? "No writing yet — click New Writing to start."
            : "No matches."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => (
            <WritingCard key={w.id} writing={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WritingCard({ writing }: { writing: WritingRow }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const title = writing.title.trim() || "Untitled";

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/writings/${writing.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Delete failed");
        setDeleting(false);
        return;
      }
      toast.success("Writing deleted");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <Card className={`relative h-full transition-shadow hover:shadow-md ${deleting ? "opacity-50" : ""}`}>
      <Link href={`/writing/${writing.id}`} className="absolute inset-0 z-0" aria-label={title} />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={deleting}
            aria-label="Delete writing"
            className="absolute right-2 top-2 z-10 size-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              All versions and comments will be permanently removed.
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
          <PenLine className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <CardTitle className="truncate text-base">{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Updated {fmt(writing.updated_at)}</p>
        </div>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
