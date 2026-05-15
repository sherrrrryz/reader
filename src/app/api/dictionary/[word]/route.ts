import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lookupWord } from "@/lib/dictionary";

export const runtime = "nodejs";

// Aggregates dictionary + translation. On the first lookup for a (user, word)
// pair the result is upserted into the `vocabulary` table.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/dictionary/[word]">) {
  const { word } = await ctx.params;
  const decoded = decodeURIComponent(word);
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await supabase
    .from("vocabulary")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("word", decoded)
    .maybeSingle();
  if (existing.data && existing.data.definition_en) {
    return NextResponse.json({ entry: existing.data, cached: true });
  }

  const looked = await lookupWord(decoded);
  const { data, error } = await supabase
    .from("vocabulary")
    .upsert(
      {
        user_id: auth.user.id,
        word: looked.word,
        phonetic: looked.phonetic,
        definition_en: looked.definition_en,
        definition_zh: looked.definition_zh,
        synonyms: looked.synonyms,
        examples: looked.examples,
      },
      { onConflict: "user_id,word" },
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data, cached: false });
}
