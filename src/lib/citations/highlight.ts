/**
 * Locate a quote inside page text for highlighting, tolerating whitespace,
 * case and smart-quote differences. Returns [start, end) in the original text.
 */
export function findQuoteRange(page: string, quote: string): [number, number] | null {
  const norm = (ch: string) =>
    ch
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[‐-―]/g, '-')
      .toLowerCase();
  const build = (s: string) => {
    let out = '';
    const map: number[] = [];
    let prevSpace = true;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (/\s/.test(ch)) {
        if (!prevSpace) {
          out += ' ';
          map.push(i);
        }
        prevSpace = true;
      } else {
        out += norm(ch);
        map.push(i);
        prevSpace = false;
      }
    }
    return { out: out.trimEnd(), map };
  };
  const p = build(page);
  const q = build(quote).out.trim();
  if (!q) return null;
  const at = p.out.indexOf(q);
  if (at < 0) return null;
  return [p.map[at], p.map[at + q.length - 1] + 1];
}
