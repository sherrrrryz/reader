"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Search, FileText, BookText, Quote } from "lucide-react";

type Result = {
  documents: { id: string; title: string }[];
  words: { id: string; word: string; definition_zh: string | null }[];
  sentences: { document_id: string; page_number: number; snippet: string }[];
};

export function SearchBar() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) setData(await r.json());
      } catch {}
      setLoading(false);
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const empty =
    data && data.documents.length === 0 && data.words.length === 0 && data.sentences.length === 0;
  const showPopover = open && q.trim().length > 0;

  return (
    <Popover open={showPopover} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative w-72">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents / words / sentences"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-72 max-h-96 overflow-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {loading && <div className="p-3 text-xs text-muted-foreground">Searching…</div>}
        {empty && !loading && <div className="p-3 text-xs text-muted-foreground">No results</div>}
        {data && data.documents.length > 0 && (
          <Section title="Documents">
            {data.documents.map((d) => (
              <Link
                key={d.id}
                href={`/documents/${d.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <FileText className="size-4 text-muted-foreground" />
                <span className="truncate">{d.title}</span>
              </Link>
            ))}
          </Section>
        )}
        {data && data.words.length > 0 && (
          <Section title="Words">
            {data.words.map((w) => (
              <Link
                key={w.id}
                href={`/vocabulary?word=${encodeURIComponent(w.word)}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <BookText className="size-4 text-muted-foreground" />
                <span className="font-medium">{w.word}</span>
                {w.definition_zh && (
                  <span className="truncate text-xs text-muted-foreground">{w.definition_zh}</span>
                )}
              </Link>
            ))}
          </Section>
        )}
        {data && data.sentences.length > 0 && (
          <Section title="Sentences">
            {data.sentences.map((s, i) => (
              <Link
                key={i}
                href={`/documents/${s.document_id}?page=${s.page_number}`}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Quote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{s.snippet}</span>
              </Link>
            ))}
          </Section>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}
