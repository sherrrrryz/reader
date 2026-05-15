import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

export type DocumentRow = {
  id: string;
  title: string;
  created_at: string;
  page_count: number | null;
  extraction_status: string;
  ocr_used: boolean | null;
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

export function DocumentCard({ doc }: { doc: DocumentRow }) {
  const status = doc.extraction_status;
  const isProcessing = status === "pending" || status === "processing";
  return (
    <Link href={`/documents/${doc.id}`} className="block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="rounded-md bg-secondary p-2 text-secondary-foreground">
            <FileText className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate text-base">{doc.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{fmt(doc.created_at)}</p>
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
          {doc.page_count ? (
            <Badge variant="secondary">
              {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
            </Badge>
          ) : null}
          {doc.ocr_used ? <Badge variant="outline">OCR</Badge> : null}
          {isProcessing && <Badge>Parsing…</Badge>}
          {status === "error" && <Badge variant="destructive">Parse failed</Badge>}
        </CardContent>
      </Card>
    </Link>
  );
}
