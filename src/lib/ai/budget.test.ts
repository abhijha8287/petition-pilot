import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('budget guard', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.PILOT_BUDGET_LEDGER = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'budget-')), 'ledger.jsonl');
    process.env.PILOT_BUDGET_USD = '2';
  });

  it('stops at 90% of the budget, counting spend from every recorded call', async () => {
    const b = await import('./budget');
    expect(b.HARD_STOP_USD).toBeCloseTo(1.8);
    b.recordSpend(1.0, { model: 'm' });
    b.recordSpend(0.7, { model: 'm' });
    expect(b.spentUsd()).toBeCloseTo(1.7);
    expect(() => b.assertBudget(0.05)).not.toThrow();
    expect(() => b.assertBudget(0.2)).toThrow(b.BudgetExceededError);
  });

  it('prices unknown models pessimistically', async () => {
    const { costUsd } = await import('./models');
    expect(costUsd('openrouter/some/unknown-model', { inputTokens: 1_000_000 })).toBeGreaterThanOrEqual(5);
    expect(costUsd('openrouter/openai/gpt-5.4-nano', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(1.45);
  });
});
