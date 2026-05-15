export type DictionaryEntry = {
  word: string;
  phonetic: string | null;
  definition_en: string | null;
  definition_zh: string | null;
  synonyms: string[];
  examples: string[];
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

export async function lookupWord(rawWord: string): Promise<DictionaryEntry> {
  const word = rawWord.trim().toLowerCase().replace(/[^a-z'-]/g, "");
  if (!word) {
    return { word: rawWord, phonetic: null, definition_en: null, definition_zh: null, synonyms: [], examples: [] };
  }
  const [dict, zh] = await Promise.all([fetchFreeDictionary(word), translateToZh(word)]);
  return {
    word,
    phonetic: dict?.phonetic ?? null,
    definition_en: dict?.definition_en ?? null,
    definition_zh: zh,
    synonyms: dict?.synonyms ?? [],
    examples: dict?.examples ?? [],
  };
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

async function translateToZh(word: string): Promise<string | null> {
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
