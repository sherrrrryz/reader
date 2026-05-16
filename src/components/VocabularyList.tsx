"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WordCard, type VocabularyEntry } from "./WordCard";
import { AddWordButton } from "./AddWordButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type Filter = "all" | "unlearned" | "learned" | "starred";

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
      if (filter === "starred") {
        if (!it.starred) return false;
      } else if (filter !== "all" && it.status !== filter) {
        return false;
      }
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

  // One-shot backfill for stale vocab rows:
  //  - source==null (pre-upgrade rows missing sounds/forms), or
  //  - definition_zh missing (Wiktionary lacks zh; route lazily enriches via MyMemory).
  // Runs sequentially to stay friendly to MyMemory's rate limit.
  const refreshedStaleRef = useRef(new Set<string>());
  useEffect(() => {
    const stale = items.filter(
      (v) =>
        v.definition_en &&
        (v.source == null || !v.definition_zh) &&
        !refreshedStaleRef.current.has(v.word.toLowerCase()),
    );
    if (stale.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const v of stale) refreshedStaleRef.current.add(v.word.toLowerCase());
      for (const v of stale) {
        if (cancelled) return;
        try {
          await fetch(`/api/dictionary/${encodeURIComponent(v.word)}`, { method: "POST" });
        } catch {}
      }
      if (cancelled) return;
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("vocabulary")
        .select("*")
        .in("word", stale.map((v) => v.word));
      if (cancelled || !data) return;
      const byWord = new Map((data as VocabularyEntry[]).map((e) => [e.word.toLowerCase(), e]));
      setItems((arr) => arr.map((it) => byWord.get(it.word.toLowerCase()) ?? it));
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  async function updateStatus(id: string, status: "learned" | "unlearned") {
    const supabase = createSupabaseBrowserClient();
    const prevStatus = items.find((x) => x.id === id)?.status;
    setItems((arr) => arr.map((x) => (x.id === id ? { ...x, status } : x)));
    const { error } = await supabase.from("vocabulary").update({ status }).eq("id", id);
    if (error) {
      if (prevStatus !== undefined) {
        setItems((arr) => arr.map((x) => (x.id === id ? { ...x, status: prevStatus } : x)));
      }
      toast.error(error.message);
    }
  }

  async function toggleStar(entry: VocabularyEntry, starred: boolean) {
    const supabase = createSupabaseBrowserClient();
    const prev = items.find((x) => x.id === entry.id)?.starred ?? false;
    setItems((arr) => arr.map((x) => (x.id === entry.id ? { ...x, starred } : x)));
    const { error } = await supabase.from("vocabulary").update({ starred }).eq("id", entry.id);
    if (error) {
      setItems((arr) => arr.map((x) => (x.id === entry.id ? { ...x, starred: prev } : x)));
      toast.error(error.message);
    }
  }

  async function remove(entry: VocabularyEntry) {
    const supabase = createSupabaseBrowserClient();
    const prev = items;
    setItems((arr) => arr.filter((x) => x.id !== entry.id));
    const { error } = await supabase.from("vocabulary").delete().eq("id", entry.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(`Deleted: ${entry.word}`);
    }
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
        <AddWordButton
          onAdded={(entry) =>
            setItems((arr) => {
              const i = arr.findIndex((x) => x.word.toLowerCase() === entry.word.toLowerCase());
              if (i >= 0) {
                const next = arr.slice();
                next[i] = { ...next[i], ...entry };
                return next;
              }
              return [entry, ...arr];
            })
          }
        />
        {(["all", "unlearned", "learned", "starred"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all"
              ? "All"
              : f === "unlearned"
                ? "Unlearned"
                : f === "learned"
                  ? "Learned"
                  : "Starred"}
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
              <WordCard
                entry={e}
                variant="vocab"
                onStatusChange={updateStatus}
                onStarChange={toggleStar}
                onDelete={remove}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
