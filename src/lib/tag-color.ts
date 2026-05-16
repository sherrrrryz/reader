// Stable hue per tag name — same input always yields the same color so a tag
// looks consistent everywhere it appears, without storing color in the DB.

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type TagColor = { bg: string; text: string; border: string };

export function tagColor(name: string): TagColor {
  const hue = hashString(name.toLowerCase()) % 360;
  return {
    bg: `hsl(${hue} 85% 92%)`,
    text: `hsl(${hue} 55% 28%)`,
    border: `hsl(${hue} 60% 70%)`,
  };
}

export function tagStyle(name: string): React.CSSProperties {
  const c = tagColor(name);
  return { backgroundColor: c.bg, color: c.text, borderColor: c.border };
}
