/**
 * One-shot ETL: Kaikki English Wiktionary JSONL -> Supabase `dictionary` + `dictionary_forms` tables.
 *
 * Usage:
 *   1. Download:  curl -L -o data/en.jsonl https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl
 *   2. Set env:   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   3. Run:       pnpm dlx tsx scripts/import-wiktionary.ts [path-to-jsonl]
 *
 * Default input path: data/en.jsonl
 */

import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const ARGS = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const DRY_RUN = ARGS.has("--dry");
const TRUNCATE_FIRST = ARGS.has("--truncate");
const INPUT_ARG = process.argv.slice(2).find((a) => !a.startsWith("--"));
const INPUT = resolve(INPUT_ARG ?? "data/en.jsonl");
if (!existsSync(INPUT)) {
  console.error(`Input file not found: ${INPUT}`);
  console.error("Download with: curl -L -o data/en.jsonl https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const ALLOWED_POS = new Set(["noun", "verb", "adj", "adv", "prep", "conj", "pron", "intj"]);
const SKIP_SENSE_TAGS = new Set([
  "obsolete", "archaic", "rare", "dated", "nonstandard",
  "proper-noun", "abbreviation", "initialism", "acronym", "letter",
]);
const SKIP_FORM_TAGS = new Set(["table-tags", "class", "inflection-template"]);

// Senses whose gloss starts with one of these are "pointer" entries (e.g. "Plural of run")
// — they belong in dictionary_forms, not as standalone dictionary rows.
const FORM_OF_PATTERNS = [
  /^(Alternative|Obsolete|Misspelling|Archaic|Rare|Nonstandard|Dated|Eye dialect|Pronunciation spelling) (form|spelling) of /i,
  /^(Initialism|Abbreviation|Acronym|Synonym|Antonym|Plural|Singular|Comparative|Superlative|Diminutive|Feminine|Masculine|Gerund|Past tense|Past participle|Present participle|Inflection|Form|Romanization) of /i,
];

const ALLOWLIST = (() => {
  const path = resolve("data/common-words.txt");
  if (!existsSync(path)) return null;
  console.log(`Allowlist found: ${path}`);
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const text = readFileSync(path, "utf8");
  return new Set(text.split(/\r?\n/).map((s: string) => s.trim().toLowerCase()).filter(Boolean));
})();

type KaikkiSense = {
  glosses?: string[];
  tags?: string[];
  examples?: { text?: string }[];
  synonyms?: { word?: string }[];
};
type KaikkiSound = {
  ipa?: string;
  mp3_url?: string;
  ogg_url?: string;
  tags?: string[];
};
type KaikkiForm = { form?: string; tags?: string[] };
type KaikkiTranslation = { code?: string; lang?: string; word?: string };
type KaikkiEntry = {
  word?: string;
  pos?: string;
  lang_code?: string;
  senses?: KaikkiSense[];
  sounds?: KaikkiSound[];
  forms?: KaikkiForm[];
  synonyms?: { word?: string }[];
  translations?: KaikkiTranslation[];
};

type DictRow = {
  word: string;
  pos: string;
  phonetic: string | null;
  definition_en: string | null;
  definition_zh: string | null;
  synonyms: string[];
  examples: string[];
  sounds: { ipa?: string; audio_url?: string; accent?: string }[];
  forms: { form: string; tags: string[] }[];
  source: string;
};

function shouldSkipWord(w: string): boolean {
  if (!w) return true;
  if (w.length < 2 || w.length > 30) return true;
  if (/[\s_]/.test(w)) return true;          // multi-word phrases
  if (!/^[a-z][a-z'-]*[a-z]$/.test(w)) return true; // lowercase letters + apostrophe/hyphen, no leading/trailing dash
  if ((w.match(/-/g)?.length ?? 0) > 1) return true; // at most one hyphen
  return false;
}

function isFormOfEntry(senses: KaikkiSense[]): boolean {
  // Every kept sense is a "form of X" pointer → drop the standalone entry.
  if (senses.length === 0) return true;
  return senses.every((s) => {
    const g = s.glosses?.[0];
    if (!g) return true;
    return FORM_OF_PATTERNS.some((re) => re.test(g));
  });
}

function transform(entry: KaikkiEntry): DictRow | null {
  if (entry.lang_code !== "en") return null;
  const word = entry.word?.toLowerCase();
  if (!word || shouldSkipWord(word)) return null;
  if (ALLOWLIST && !ALLOWLIST.has(word)) return null;
  const pos = entry.pos ?? "";
  if (!ALLOWED_POS.has(pos)) return null;

  const senses = (entry.senses ?? []).filter((s) => {
    if (!s.glosses?.length) return false;
    if (s.tags?.some((t) => SKIP_SENSE_TAGS.has(t))) return false;
    return true;
  });
  if (senses.length === 0) return null;
  if (isFormOfEntry(senses)) return null;

  const definition_en = senses
    .slice(0, 3)
    .map((s) => s.glosses?.[0])
    .filter(Boolean)
    .join(" • ");

  const examples: string[] = [];
  for (const s of senses) {
    for (const ex of s.examples ?? []) {
      if (ex.text && !examples.includes(ex.text)) examples.push(ex.text);
      if (examples.length >= 3) break;
    }
    if (examples.length >= 3) break;
  }

  const synSet = new Set<string>();
  for (const s of entry.synonyms ?? []) if (s.word) synSet.add(s.word);
  for (const sense of senses) for (const s of sense.synonyms ?? []) if (s.word) synSet.add(s.word);
  const synonyms = Array.from(synSet).slice(0, 8);

  const sounds: DictRow["sounds"] = [];
  for (const s of entry.sounds ?? []) {
    const audio_url = s.mp3_url ?? s.ogg_url;
    if (!s.ipa && !audio_url) continue;
    const accent = s.tags?.find((t) => /^(US|UK|GA|RP|GenAm|Received Pronunciation|British|American)$/i.test(t));
    sounds.push({
      ...(s.ipa ? { ipa: s.ipa } : {}),
      ...(audio_url ? { audio_url } : {}),
      ...(accent ? { accent } : {}),
    });
    if (sounds.length >= 4) break;
  }
  const phonetic = sounds.find((s) => s.ipa)?.ipa ?? null;

  const forms: DictRow["forms"] = [];
  const seenForms = new Set<string>();
  for (const f of entry.forms ?? []) {
    const form = f.form?.toLowerCase();
    if (!form || form === word || seenForms.has(form)) continue;
    if (shouldSkipWord(form)) continue;
    if (!f.tags || f.tags.length === 0) continue;
    if (f.tags.some((t) => SKIP_FORM_TAGS.has(t))) continue;
    forms.push({ form, tags: f.tags });
    seenForms.add(form);
    if (forms.length >= 12) break;
  }

  // Wiktionary `cmn` translations sometimes carry romanization/other-language strings; require CJK.
  const zhCandidate = entry.translations?.find(
    (t) => (t.code === "cmn" || t.code === "zh") && t.word && /\p{Script=Han}/u.test(t.word),
  )?.word;
  const definition_zh = zhCandidate ?? null;

  return {
    word,
    pos,
    phonetic,
    definition_en: definition_en || null,
    definition_zh,
    synonyms,
    examples,
    sounds,
    forms,
    source: "wiktionary",
  };
}

const BATCH = 500;

async function flushDict(rows: DictRow[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("dictionary").upsert(rows, { onConflict: "word" });
  if (error) throw new Error(`dictionary upsert: ${error.message}`);
}

async function flushForms(rows: { form: string; lemma: string }[]) {
  if (rows.length === 0) return;
  // ignoreDuplicates: first lemma to claim a form wins
  const { error } = await supabase
    .from("dictionary_forms")
    .upsert(rows, { onConflict: "form", ignoreDuplicates: true });
  if (error) throw new Error(`dictionary_forms upsert: ${error.message}`);
}

function uniqMerge(a: string[], b: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...a, ...b]) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= cap) break;
  }
  return out;
}

function mergeRow(into: DictRow, from: DictRow) {
  if (!into.pos.split(",").includes(from.pos)) into.pos += `,${from.pos}`;
  if (!into.phonetic && from.phonetic) into.phonetic = from.phonetic;
  if (!into.definition_zh && from.definition_zh) into.definition_zh = from.definition_zh;
  if (from.definition_en) {
    const tagged = `(${from.pos}) ${from.definition_en}`;
    into.definition_en = into.definition_en
      ? `${into.definition_en} • ${tagged}`.split(" • ").slice(0, 5).join(" • ")
      : tagged;
  }
  into.synonyms = uniqMerge(into.synonyms, from.synonyms, 8);
  into.examples = uniqMerge(into.examples, from.examples, 5);

  // sounds: dedupe by ipa+audio_url
  const soundKey = (s: { ipa?: string; audio_url?: string }) => `${s.ipa ?? ""}|${s.audio_url ?? ""}`;
  const seenSounds = new Set(into.sounds.map(soundKey));
  for (const s of from.sounds) {
    const k = soundKey(s);
    if (seenSounds.has(k)) continue;
    seenSounds.add(k);
    into.sounds.push(s);
    if (into.sounds.length >= 4) break;
  }

  // forms: dedupe by form string
  const seenForms = new Set(into.forms.map((f) => f.form));
  for (const f of from.forms) {
    if (seenForms.has(f.form)) continue;
    seenForms.add(f.form);
    into.forms.push(f);
    if (into.forms.length >= 12) break;
  }
}

async function main() {
  console.log(`Reading ${INPUT}`);
  const stream = createReadStream(INPUT, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNo = 0;
  let kept = 0;
  const dictMap = new Map<string, DictRow>();
  const formsMap = new Map<string, string>(); // form -> lemma (first wins)

  for await (const line of rl) {
    lineNo++;
    if (!line) continue;
    let entry: KaikkiEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const row = transform(entry);
    if (!row) continue;

    const existing = dictMap.get(row.word);
    if (existing) {
      mergeRow(existing, row);
    } else {
      dictMap.set(row.word, row);
      kept++;
    }

    for (const f of row.forms) {
      if (!formsMap.has(f.form)) formsMap.set(f.form, row.word);
    }

    if (lineNo % 100000 === 0) {
      console.log(`  scanned=${lineNo}  unique=${dictMap.size}  forms=${formsMap.size}`);
    }
  }

  console.log(`Scan done. lines=${lineNo}  unique=${dictMap.size}  forms=${formsMap.size}`);

  if (DRY_RUN) {
    console.log("--dry: skipping upload. Sample rows:");
    const sample = Array.from(dictMap.values()).slice(0, 5);
    for (const r of sample) console.log(JSON.stringify(r));
    return;
  }

  if (TRUNCATE_FIRST) {
    console.log("Truncating dictionary_forms + dictionary...");
    // dictionary_forms has FK -> dictionary, must clear it first
    const { error: e1 } = await supabase.from("dictionary_forms").delete().not("form", "is", null);
    if (e1) throw new Error(`truncate dictionary_forms: ${e1.message}`);
    const { error: e2 } = await supabase.from("dictionary").delete().not("word", "is", null);
    if (e2) throw new Error(`truncate dictionary: ${e2.message}`);
  }

  console.log(`Uploading dictionary (${dictMap.size} rows)...`);

  const allRows = Array.from(dictMap.values());
  for (let i = 0; i < allRows.length; i += BATCH) {
    await flushDict(allRows.slice(i, i + BATCH));
    console.log(`  dict ${Math.min(i + BATCH, allRows.length)} / ${allRows.length}`);
  }

  console.log(`Uploading dictionary_forms (${formsMap.size} rows)...`);
  // Drop forms whose lemma was filtered out (rare but possible)
  const formRows: { form: string; lemma: string }[] = [];
  for (const [form, lemma] of formsMap) {
    if (dictMap.has(lemma) && form !== lemma) formRows.push({ form, lemma });
  }
  for (let i = 0; i < formRows.length; i += BATCH) {
    await flushForms(formRows.slice(i, i + BATCH));
    console.log(`  forms ${Math.min(i + BATCH, formRows.length)} / ${formRows.length}`);
  }

  console.log(`Done. kept=${kept}  forms=${formRows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
