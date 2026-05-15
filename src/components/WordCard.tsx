"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type VocabularyEntry = {
  id: string;
  word: string;
  phonetic: string | null;
  definition_en: string | null;
  definition_zh: string | null;
  synonyms: string[] | null;
  examples: string[] | null;
  status: "learned" | "unlearned" | string;
  // optional, present when shown in reader (linked highlight)
  context_sentence?: string | null;
  highlight_id?: string;
};

type Props = {
  entry: VocabularyEntry;
  variant: "reader" | "vocab";
  onStatusChange?: (id: string, status: "learned" | "unlearned") => void;
  onDelete?: (entry: VocabularyEntry) => void;
};

export function WordCard({ entry, variant, onStatusChange, onDelete }: Props) {
  const [status, setStatus] = useState(entry.status);
  const learned = status === "learned";
  const syns = entry.synonyms ?? [];
  const examples = entry.examples ?? [];

  return (
    <Card className={cn(learned && variant === "vocab" && "opacity-70")}>
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-lg font-semibold">{entry.word}</span>
            {entry.phonetic && (
              <span className="text-sm text-muted-foreground">{entry.phonetic}</span>
            )}
          </div>
          {entry.definition_zh && (
            <p className="mt-0.5 text-sm">{entry.definition_zh}</p>
          )}
        </div>
        {variant === "vocab" && (
          <div className="flex items-center gap-2">
            <Label htmlFor={`s-${entry.id}`} className="text-xs text-muted-foreground">
              {learned ? "Learned" : "Unlearned"}
            </Label>
            <Switch
              id={`s-${entry.id}`}
              checked={learned}
              onCheckedChange={(v) => {
                const next = v ? "learned" : "unlearned";
                setStatus(next);
                onStatusChange?.(entry.id, next);
              }}
            />
            {onDelete && (
              <Button variant="ghost" size="icon" onClick={() => onDelete(entry)} title="Delete">
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {entry.context_sentence && (
          <p className="rounded-md bg-yellow-100 px-2 py-1 text-foreground/80 dark:bg-yellow-900/40">
            “{entry.context_sentence}”
          </p>
        )}
        {entry.definition_en && (
          <p className="text-muted-foreground">{entry.definition_en}</p>
        )}
        {syns.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Synonyms:</span>
            {syns.slice(0, 6).map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
          </div>
        )}
        {examples.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Examples:</span>
            <ul className="list-disc space-y-0.5 pl-5 text-foreground/80">
              {examples.slice(0, 3).map((ex, i) => (
                <li key={i}>{ex}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
