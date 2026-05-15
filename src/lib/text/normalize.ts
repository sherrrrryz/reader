// Repair words mangled by broken PDF ToUnicode mappings (common from MS Word
// exports). The visible glyphs are correct, but Copy / select / search returns
// stray symbols where ligatures (ti, ft, tt, sti...) should be. We try the
// known character substitutions and accept whichever variant looks like a real
// English word, falling back to the original.

const SUBSTITUTIONS: Record<string, string[]> = {
  "8": ["ti"],
  "%": ["sti"],
  "J": ["ti", "tu"],
  "M": ["ft"],
  "K": ["tt"],
  "1": ["ti"],
  "*": ["ti"],
};

function looksLikeRealWord(w: string): boolean {
  // No mojibake symbols left and at least one vowel — good-enough heuristic
  // for English without shipping a dictionary into the bundle.
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(w)) return false;
  return /[aeiouy]/i.test(w);
}

export function repairWord(word: string): string {
  if (!word) return word;
  if (looksLikeRealWord(word) && !/[8%JMK1*]/.test(word)) return word;

  // Generate candidates by expanding each suspicious char.
  let candidates: string[] = [word];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const subs = SUBSTITUTIONS[ch];
    if (!subs) continue;
    const next: string[] = [];
    for (const c of candidates) {
      for (const s of subs) next.push(c.slice(0, i) + s + c.slice(i + 1));
    }
    candidates = next;
    if (candidates.length > 32) break; // cap blowup
  }

  for (const c of candidates) if (looksLikeRealWord(c)) return c;
  return word;
}

export function repairText(text: string): string {
  if (!text) return text;
  // Repair token-by-token so we don't touch punctuation/whitespace.
  return text.replace(/[A-Za-z][A-Za-z'8%JMK1*-]*/g, (m) => repairWord(m));
}
