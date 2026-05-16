import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { lookupWord, translateToZh } from "@/lib/dictionary";

export const runtime = "nodejs";

// Aggregates dictionary + translation. On the first lookup for a (user, word)
// pair the result is upserted into the `vocabulary` table.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/dictionary/[word]">) {
  const { word } = await ctx.params;
  const decoded = decodeURIComponent(word);
  // The vocabulary row's key is always derived from the request input, never from
  // lookupWord's return value. This prevents an inadvertent lemma swap inside
  // lookupWord from creating ghost duplicate rows under a different word key.
  const normalized = decoded.trim().toLowerCase().replace(/[^a-z'-]/g, "");
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await supabase
    .from("vocabulary")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("word", normalized)
    .maybeSingle();
  // Cache is valid only if it carries the new fields (source is set).
  // Pre-upgrade rows have source=null and are missing sounds/forms — re-fetch them.
  const cachedFresh =
    existing.data &&
    existing.data.definition_en &&
    existing.data.source != null;
  if (cachedFresh) {
    let entry = existing.data;
    // Lazy enrichment: if Chinese is missing, try MyMemory and persist back so
    // future lookups (and other users hitting the global dictionary) skip it.
    if (!entry.definition_zh) {
      const zh = await translateToZh(decoded);
      if (zh) {
        const { data: updated } = await supabase
          .from("vocabulary")
          .update({ definition_zh: zh })
          .eq("id", entry.id)
          .select("*")
          .single();
        if (updated) entry = updated;
        try {
          const svc = await createSupabaseServiceRoleClient();
          await svc.from("dictionary").update({ definition_zh: zh, updated_at: new Date().toISOString() }).eq("word", normalized);
        } catch {
          // best-effort
        }
      }
    }
    return NextResponse.json({ entry, cached: true });
  }

  const looked = await lookupWord(decoded, supabase);
  const { data, error } = await supabase
    .from("vocabulary")
    .upsert(
      {
        user_id: auth.user.id,
        word: normalized,
        phonetic: looked.phonetic,
        definition_en: looked.definition_en,
        definition_zh: looked.definition_zh,
        synonyms: looked.synonyms,
        examples: looked.examples,
        sounds: looked.sounds ?? [],
        forms: looked.forms ?? [],
        source: looked.source ?? null,
      },
      { onConflict: "user_id,word" },
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data, cached: false });
}
