import { describe, expect, it } from 'vitest';
import { cohensKappa, fleissKappa, jaccard, wilson } from './stats';

describe('stats', () => {
  it('wilson interval brackets the point estimate', () => {
    const w = wilson(20, 30);
    expect(w.p).toBeCloseTo(0.667, 2);
    expect(w.lo).toBeLessThan(w.p);
    expect(w.hi).toBeGreaterThan(w.p);
    expect(w.lo).toBeCloseTo(0.488, 2);
  });
  it("cohen's kappa: perfect agreement and a textbook example", () => {
    expect(cohensKappa(['y', 'n', 'y'], ['y', 'n', 'y'])).toBe(1);
    // 50 items: both yes 20, A yes/B no 5, A no/B yes 10, both no 15 -> kappa = 0.4
    const a = [...Array(25).fill('y'), ...Array(25).fill('n')];
    const b = [...Array(20).fill('y'), ...Array(5).fill('n'), ...Array(10).fill('y'), ...Array(15).fill('n')];
    expect(cohensKappa(a, b)).toBeCloseTo(0.4, 5);
  });
  it("fleiss' kappa is 1 for unanimous raters", () => {
    expect(fleissKappa([['a', 'a', 'a'], ['b', 'b', 'b']])).toBe(1);
  });
  it('jaccard', () => {
    expect(jaccard(new Set([1, 2]), new Set([2, 3]))).toBeCloseTo(1 / 3);
  });
});
