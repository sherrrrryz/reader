import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ documents: [], words: [], sentences: [] });

  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const [docsRes, wordsRes, pagesRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title")
      .eq("user_id", auth.user.id)
      .ilike("title", like)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("vocabulary")
      .select("id, word, definition_zh")
      .eq("user_id", auth.user.id)
      .ilike("word", like)
      .limit(6),
    supabase
      .from("document_pages")
      .select("document_id, page_number, text_content")
      .eq("user_id", auth.user.id)
      .ilike("text_content", like)
      .limit(8),
  ]);

  const sentences = (pagesRes.data ?? []).map((row) => {
    const text = row.text_content ?? "";
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, (idx >= 0 ? idx : 0) + q.length + 80);
    return {
      document_id: row.document_id,
      page_number: row.page_number,
      snippet: (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : ""),
    };
  });

  return NextResponse.json({
    documents: docsRes.data ?? [],
    words: wordsRes.data ?? [],
    sentences,
  });
}
