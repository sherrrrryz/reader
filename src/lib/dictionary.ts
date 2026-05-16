import type { SupabaseClient } from "@supabase/supabase-js";

export type Sound = { ipa?: string; audio_url?: string; accent?: string };
export type WordForm = { form: string; tags: string[] };

export type DictionaryEntry = {
  word: string;
  phonetic: string | null;
  definition_en: string | null;
  definition_zh: string | null;
  synonyms: string[];
  examples: string[];
  sounds?: Sound[];
  forms?: WordForm[];
  source?: string;
};

type FreeDictMeaning = {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
  synonyms?: string[];
};
type FreeDictEntry = {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings: FreeDictMeaning[];
};

function emptyEntry(word: string): DictionaryEntry {
  return {
    word,
    phonetic: null,
    definition_en: null,
    definition_zh: null,
    synonyms: [],
    examples: [],
  };
}

export async function lookupWord(
  rawWord: string,
  supabase: SupabaseClient,
): Promise<DictionaryEntry> {
  const word = rawWord.trim().toLowerCase().replace(/[^a-z'-]/g, "");
  if (!word) return emptyEntry(rawWord);

  // 0. Lemmatize via dictionary_forms (running -> run). Falls back to the input.
  const formHit = await supabase
    .from("dictionary_forms")
    .select("lemma")
    .eq("form", word)
    .maybeSingle();
  const lemma = formHit.data?.lemma ?? word;

  // 1. Local dictionary (Wiktionary / cached fallback).
  const local = await supabase.from("dictionary").select("*").eq("word", lemma).maybeSingle();
  if (local.data && local.data.definition_en) {
    // Wiktionary's Chinese translations are sparse — fall back to MyMemory when missing,
    // and persist back to the global dictionary so all users benefit next time.
    let zh = local.data.definition_zh as string | null;
    if (!zh) {
      zh = await translateToZh(lemma);
      if (zh) {
        try {
          const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
          const svc = await createSupabaseServiceRoleClient();
          await svc
            .from("dictionary")
            .update({ definition_zh: zh, updated_at: new Date().toISOString() })
            .eq("word", local.data.word);
        } catch {
          // Best-effort cache update.
        }
      }
    }
    return {
      word, // keep the user's input as the vocab key; lemma only drives content lookup
      phonetic: local.data.phonetic ?? null,
      definition_en: local.data.definition_en ?? null,
      definition_zh: zh,
      synonyms: (local.data.synonyms as string[]) ?? [],
      examples: (local.data.examples as string[]) ?? [],
      sounds: (local.data.sounds as Sound[]) ?? [],
      forms: (local.data.forms as WordForm[]) ?? [],
      source: local.data.source ?? "wiktionary",
    };
  }

  // 2. External fallback for rare/new words.
  const [dict, zh] = await Promise.all([fetchFreeDictionary(word), translateToZh(word)]);
  const entry: DictionaryEntry = {
    word,
    phonetic: dict?.phonetic ?? null,
    definition_en: dict?.definition_en ?? null,
    definition_zh: zh,
    synonyms: dict?.synonyms ?? [],
    examples: dict?.examples ?? [],
    sounds: [],
    forms: [],
    source: "dictionaryapi.dev",
  };

  // 3. Backfill into the global dictionary so all users benefit next time.
  if (entry.definition_en) {
    try {
      const { createSupabaseServiceRoleClient } = await import("@/lib/supabase/server");
      const svc = await createSupabaseServiceRoleClient();
      await svc.from("dictionary").upsert(
        {
          word,
          phonetic: entry.phonetic,
          definition_en: entry.definition_en,
          definition_zh: entry.definition_zh,
          synonyms: entry.synonyms,
          examples: entry.examples,
          sounds: [],
          forms: [],
          source: "dictionaryapi.dev",
        },
        { onConflict: "word" },
      );
    } catch {
      // Best-effort cache write; ignore failures.
    }
  }

  return entry;
}

async function fetchFreeDictionary(word: string) {
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as FreeDictEntry[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const entry = data[0];
    const phonetic =
      entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || null;
    const defs: string[] = [];
    const examples: string[] = [];
    const synonyms = new Set<string>();
    for (const m of entry.meanings ?? []) {
      m.synonyms?.forEach((s) => synonyms.add(s));
      for (const d of m.definitions ?? []) {
        defs.push(`(${m.partOfSpeech}) ${d.definition}`);
        if (d.example) examples.push(d.example);
      }
    }
    return {
      phonetic,
      definition_en: defs.slice(0, 3).join(" • "),
      synonyms: Array.from(synonyms).slice(0, 8),
      examples: examples.slice(0, 3),
    };
  } catch {
    return null;
  }
}

export async function translateToZh(word: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh-CN`,
      { next: { revalidate: 60 * 60 * 24 * 30 } },
    );
    if (!r.ok) return null;
    const data = await r.json();
    const t = data?.responseData?.translatedText;
    if (typeof t === "string" && t.toLowerCase() !== word.toLowerCase()) return t;
    return null;
  } catch {
    return null;
  }
}
