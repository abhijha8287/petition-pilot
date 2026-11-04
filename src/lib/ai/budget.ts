import fs from 'node:fs';
import path from 'node:path';

/**
 * Hard spend cap across every process (Next.js server, scripts, evals).
 *
 * Each model call appends its cost to an append-only JSONL ledger. Before a
 * call we check the running total plus a conservative estimate against
 * PILOT_BUDGET_USD minus a 10% safety margin, and refuse if it would cross.
 */
const LEDGER = path.resolve(/*turbopackIgnore: true*/ process.env.PILOT_BUDGET_LEDGER ?? '.budget/ledger.jsonl');
export const BUDGET_USD = Number(process.env.PILOT_BUDGET_USD ?? 2);
export const HARD_STOP_USD = BUDGET_USD * 0.9;

export class BudgetExceededError extends Error {
  constructor(spent: number, estimate: number) {
    super(`Budget guard: $${spent.toFixed(4)} spent + ~$${estimate.toFixed(4)} estimated would exceed the $${HARD_STOP_USD.toFixed(2)} hard stop (budget $${BUDGET_USD.toFixed(2)}).`);
    this.name = 'BudgetExceededError';
  }
}

export function spentUsd(): number {
  try {
    return fs
      .readFileSync(/*turbopackIgnore: true*/ LEDGER, 'utf8')
      .split('\n')
      .filter(Boolean)
      .reduce((s, line) => s + (JSON.parse(line).usd ?? 0), 0);
  } catch {
    return 0;
  }
}

export function remainingUsd(): number {
  return Math.max(0, HARD_STOP_USD - spentUsd());
}

export function assertBudget(estimateUsd: number) {
  const spent = spentUsd();
  if (spent + estimateUsd > HARD_STOP_USD) throw new BudgetExceededError(spent, estimateUsd);
}

export function recordSpend(usd: number, meta: { model: string; label?: string; inputTokens?: number; outputTokens?: number }) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), usd, ...meta }) + '\n');
}

/** Rough token estimate for pre-call checks (4 chars per token). */
export const estTokens = (s: string) => Math.ceil(s.length / 4);
