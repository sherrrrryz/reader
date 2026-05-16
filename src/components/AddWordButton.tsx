"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import type { VocabularyEntry } from "./WordCard";

type Props = {
  onAdded: (entry: VocabularyEntry) => void;
  label?: string;
  size?: "sm" | "default";
};

export function AddWordButton({ onAdded, label = "Add word", size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = word.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase().replace(/[^a-z'-]/g, "");
    if (!normalized) {
      toast.error("Please enter a valid English word.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/dictionary/${encodeURIComponent(normalized)}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json?.error ?? "Failed to add word");
        return;
      }
      onAdded(json.entry as VocabularyEntry);
      toast.success(`Added: ${normalized}`);
      setWord("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add word");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size}>
          <Plus className="size-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Enter a word to add to your vocabulary.</p>
          <Input
            autoFocus
            placeholder="e.g. serendipity"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!busy) submit();
              }
            }}
            disabled={busy}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={busy || !word.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
