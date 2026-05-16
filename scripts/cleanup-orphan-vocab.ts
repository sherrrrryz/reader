/**
 * One-shot cleanup: remove vocab rows that were auto-created by the buggy
 * dictionary-upgrade backfill (lemma rows like "favor" / "telecommunication"
 * inserted alongside the user's real "favored" / "telecommunications" highlights).
 *
 * Heuristic: a vocab row is an orphan iff there is no highlight with the same
 * lower-cased word for the same user. (User-added highlights drive vocab,
 * so legit vocab rows always have a matching highlight.)
 *
 * Usage: pnpm tsx scripts/cleanup-orphan-vocab.ts          # dry-run, lists what would be deleted
 *        pnpm tsx scripts/cleanup-orphan-vocab.ts --apply  # actually delete
 */

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const APPLY = process.argv.includes("--apply");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  const { data: vocab, error: vErr } = await sb
    .from("vocabulary")
    .select("id, user_id, word");
  if (vErr) throw vErr;
  if (!vocab) return;

  const { data: highlights, error: hErr } = await sb
    .from("highlights")
    .select("user_id, word");
  if (hErr) throw hErr;

  // (user_id, word.toLowerCase()) -> exists
  const highlightKey = new Set(
    (highlights ?? []).map((h) => `${h.user_id}::${h.word.toLowerCase()}`),
  );

  const orphans = vocab.filter(
    (v) => !highlightKey.has(`${v.user_id}::${v.word.toLowerCase()}`),
  );

  console.log(`Found ${orphans.length} orphan vocab rows (no matching highlight):`);
  for (const o of orphans) console.log(`  ${o.word}  (id=${o.id})`);

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to delete.");
    return;
  }
  if (orphans.length === 0) return;

  const ids = orphans.map((o) => o.id);
  const { error: dErr } = await sb.from("vocabulary").delete().in("id", ids);
  if (dErr) throw dErr;
  console.log(`Deleted ${ids.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
