/** Small, dependency-free statistics used by the eval reports. */

/** 95% Wilson score interval for a binomial proportion. */
export function wilson(successes: number, n: number, z = 1.96): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: 0, lo: 0, hi: 0 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/** Cohen's kappa for two raters over categorical labels. */
export function cohensKappa<T>(a: T[], b: T[]): number {
  if (a.length !== b.length || a.length === 0) return NaN;
  const cats = [...new Set([...a, ...b])];
  const n = a.length;
  const po = a.filter((x, i) => x === b[i]).length / n;
  const pe = cats.reduce((s, c) => s + (a.filter((x) => x === c).length / n) * (b.filter((x) => x === c).length / n), 0);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/** Fleiss' kappa: agreement among k runs (raters) over N items with categorical labels. */
export function fleissKappa<T>(ratings: T[][]): number {
  const N = ratings.length;
  if (N === 0) return NaN;
  const k = ratings[0].length;
  const cats = [...new Set(ratings.flat())];
  const counts = ratings.map((row) => cats.map((c) => row.filter((x) => x === c).length));
  const P = counts.map((row) => (row.reduce((s, n) => s + n * n, 0) - k) / (k * (k - 1)));
  const Pbar = P.reduce((a, b) => a + b, 0) / N;
  const pj = cats.map((_, j) => counts.reduce((s, row) => s + row[j], 0) / (N * k));
  const Pe = pj.reduce((s, p) => s + p * p, 0);
  return Pe === 1 ? 1 : (Pbar - Pe) / (1 - Pe);
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : inter / union;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
