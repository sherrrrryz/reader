"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export type UnderlineEntry = {
  id: string;
  sentence: string;
  page_number: number;
  created_at: string;
};

export function SentenceCard({
  entry,
  onDelete,
}: {
  entry: UnderlineEntry;
  onDelete?: (e: UnderlineEntry) => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-3">
        <div className="flex-1">
          <p className="border-b-2 border-foreground/80 pb-0.5 leading-relaxed">
            {entry.sentence}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Page {entry.page_number}</p>
        </div>
        {onDelete && (
          <Button variant="ghost" size="icon" onClick={() => onDelete(entry)}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
