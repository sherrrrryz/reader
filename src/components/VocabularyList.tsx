"use client";

import { useEffect, useMemo, useState } from "react";
import { WordCard, type VocabularyEntry } from "./WordCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type Filter = "all" | "unlearned" | "learned";

export function VocabularyList({
  initial,
  focusWord,
}: {
  initial: VocabularyEntry[];
  focusWord: string | null;
}) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState(focusWord ?? "");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && it.status !== filter) return false;
      if (ql && !it.word.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [items, filter, q]);

  useEffect(() => {
    if (focusWord) {
      const el = document.getElementById(`vocab-${focusWord.toLowerCase()}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusWord]);

  async function updateStatus(id: string, status: "learned" | "unlearned") {
    const supabase = createSupabaseBrowserClient();
    setItems((arr) => arr.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("vocabulary").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function remove(entry: VocabularyEntry) {
    const supabase = createSupabaseBrowserClient();
    setItems((arr) => arr.filter((x) => x.id !== entry.id));
    const { error } = await supabase.from("vocabulary").delete().eq("id", entry.id);
    if (error) toast.error(error.message);
    else toast.success(`Deleted: ${entry.word}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter words…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        {(["all", "unlearned", "learned"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "unlearned" ? "Unlearned" : "Learned"}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} {filtered.length === 1 ? "word" : "words"}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "No words yet — highlight a word in a document to add it." : "No matching words."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((e) => (
            <div key={e.id} id={`vocab-${e.word.toLowerCase()}`}>
              <WordCard entry={e} variant="vocab" onStatusChange={updateStatus} onDelete={remove} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
