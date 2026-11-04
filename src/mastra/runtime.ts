import type { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { z } from 'zod';
import { assertBudget, estTokens, recordSpend } from '@/lib/ai/budget';
import { costUsd, nativeStructuredOutput, priceOf } from '@/lib/ai/models';
import { adminClient } from '@/lib/supabase/admin';
import type { JsonValue } from '@/lib/supabase/json';

export type RunCtx = { caseId: string; runId: string };

type EventKind = 'step_start' | 'step_end' | 'step_skipped' | 'llm_call' | 'retry' | 'error' | 'checkpoint' | 'info';

export async function logEvent(
  ctx: RunCtx,
  step: string,
  kind: EventKind,
  message: string,
  extra: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    latencyMs?: number;
    meta?: Record<string, unknown>;
  } = {},
) {
  const { error } = await adminClient().from('agent_events').insert({
    case_id: ctx.caseId,
    run_id: ctx.runId,
    step,
    kind,
    message,
    model: extra.model,
    input_tokens: extra.inputTokens,
    output_tokens: extra.outputTokens,
    cost_usd: extra.costUsd,
    latency_ms: extra.latencyMs,
    meta: (extra.meta ?? {}) as JsonValue,
  });
  if (error) console.error('[agent_events] insert failed', error.message);
}

/**
 * Fault injection for the recovery demo and tests:
 *   EXHIBIT_CHAOS="draft"           fail the first attempt of the `draft` step in every run
 *   EXHIBIT_CHAOS="draft,objections"
 * A failure is injected at most once per (run, step), so a retry or a resumed
 * run gets through. The failure is recorded as an event, so the UI shows it.
 */
async function maybeInjectFailure(ctx: RunCtx, step: string) {
  const chaos = (process.env.EXHIBIT_CHAOS ?? '').split(',').map((s) => s.trim());
  if (!chaos.includes(step)) return;
  const { count } = await adminClient()
    .from('agent_events')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', ctx.runId)
    .eq('step', step)
    .eq('kind', 'error')
    .contains('meta', { injected: true });
  if ((count ?? 0) > 0) return;
  await logEvent(ctx, step, 'error', `Injected failure in "${step}" (EXHIBIT_CHAOS)`, { meta: { injected: true } });
  throw new Error(`Injected failure in step "${step}"`);
}

/**
 * Exactly-once step execution on top of an at-least-once runner.
 *
 * Workflow engines (Mastra included) may re-run a step after a crash, a retry
 * or a restart. Each step therefore (1) returns the stored output if this run
 * already committed it, and (2) otherwise runs, writes its rows, and commits a
 * checkpoint last. Steps clear their own partial rows before writing, so a
 * crash between "write rows" and "commit checkpoint" is also safe.
 */
export async function checkpointed<T>(ctx: RunCtx, step: string, fn: () => Promise<T>): Promise<T> {
  const db = adminClient();
  const { data: existing } = await db
    .from('step_checkpoints')
    .select('output')
    .eq('run_id', ctx.runId)
    .eq('step', step)
    .maybeSingle();
  if (existing) {
    await logEvent(ctx, step, 'step_skipped', `Reused checkpoint for "${step}"`);
    return existing.output as T;
  }

  await db.from('pipeline_runs').update({ current_step: step, status: 'running' }).eq('id', ctx.runId);
  await logEvent(ctx, step, 'step_start', `Started "${step}"`);
  const t0 = Date.now();
  try {
    await maybeInjectFailure(ctx, step);
    const output = await fn();
    const { error } = await db
      .from('step_checkpoints')
      .upsert({ run_id: ctx.runId, step, output: output as JsonValue });
    if (error) throw new Error(`checkpoint commit failed: ${error.message}`);
    await logEvent(ctx, step, 'step_end', `Finished "${step}"`, { latencyMs: Date.now() - t0 });
    return output;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.startsWith('Injected failure')) {
      await logEvent(ctx, step, 'error', message, { latencyMs: Date.now() - t0 });
    }
    throw err;
  }
}

/** Structured call to a Mastra agent with usage, cost and latency logged per call. */
const REPAIR_ATTEMPTS = 2;
const MAX_OUTPUT_TOKENS = 4096;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isValidationError = (e: unknown) => /validation|no structured output|JSON|parse|schema/i.test(errorMessage(e));

export async function callAgent<S extends z.ZodType>(
  ctx: RunCtx | null,
  step: string,
  agent: Agent,
  prompt: string,
  schema: S,
  opts: { label?: string; requestContext?: RequestContext; maxSteps?: number; maxOutputTokens?: number } = {},
): Promise<z.infer<S>> {
  const model = await resolveModelId(agent);
  // Conservative pre-flight estimate: prompt + tool round-trips + a full output budget.
  const steps = opts.maxSteps ?? 1;
  const p = priceOf(model);
  assertBudget(((estTokens(prompt) + 1500) * Math.max(1, steps * 0.6) * p.input + 3000 * p.output) / 1_000_000);
  const t0 = Date.now();
  const generate = (p: string) =>
    agent.generate(p, {
      structuredOutput: { schema, ...(nativeStructuredOutput(model) ? {} : { jsonPromptInjection: 'system' as const }) },
      ...(opts.requestContext ? { requestContext: opts.requestContext } : {}),
      ...(opts.maxSteps ? { maxSteps: opts.maxSteps } : {}),
      // Hard cap on output. Small local models occasionally fall into a repetition
      // loop and would otherwise generate until the context window is full.
      modelSettings: { maxOutputTokens: opts.maxOutputTokens ?? MAX_OUTPUT_TOKENS },
    });
  // Repair loop: small local models occasionally emit output that fails the
  // schema (e.g. an empty array). Re-prompt with the validation error rather
  // than failing the whole step; give up after REPAIR_ATTEMPTS.
  let res: Awaited<ReturnType<typeof generate>> | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt <= REPAIR_ATTEMPTS && !res; attempt++) {
    try {
      const out = await generate(
        attempt === 0
          ? prompt
          : `${prompt}\n\nYour previous answer was rejected: ${errorMessage(lastError).slice(0, 400)}\nReturn a complete answer that satisfies the schema.`,
      );
      if (out.object === undefined || out.object === null) throw new Error(`no structured output${out.error ? `: ${out.error.message}` : ''}`);
      res = out;
    } catch (e) {
      lastError = e;
      if (!isValidationError(e) || attempt === REPAIR_ATTEMPTS) throw e;
      if (ctx) await logEvent(ctx, step, 'retry', `${agent.name}: output failed validation, re-prompting (${attempt + 1}/${REPAIR_ATTEMPTS})`, {});
    }
  }
  if (!res) throw lastError;
  const latencyMs = Date.now() - t0;
  const usage = res.totalUsage ?? res.usage;
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const cachedInputTokens = (usage as { cachedInputTokens?: number } | undefined)?.cachedInputTokens ?? 0;
  if (ctx) {
    await logEvent(ctx, step, 'llm_call', `${agent.name}${opts.label ? ` · ${opts.label}` : ''}`, {
      model,
      inputTokens,
      outputTokens,
      costUsd: costUsd(model, { inputTokens, outputTokens, cachedInputTokens }),
      latencyMs,
      meta: { traceId: res.traceId, toolCalls: res.toolCalls?.length ?? 0 },
    });
  }
  usageMeter.add(model, { inputTokens, outputTokens, cachedInputTokens }, latencyMs);
  recordSpend(costUsd(model, { inputTokens, outputTokens, cachedInputTokens }), { model, label: `${agent.id}:${step}`, inputTokens, outputTokens });
  return res.object as z.infer<S>;
}

async function resolveModelId(agent: Agent): Promise<string> {
  try {
    const m = await agent.getModel();
    const provider = (m as { provider?: string }).provider?.split('.')[0] ?? 'openai';
    return `${provider}/${(m as { modelId?: string }).modelId}`;
  } catch {
    return 'unknown';
  }
}

/** Process-wide meter so eval scripts can report cost without a database. */
export const usageMeter = {
  calls: 0,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
  add(model: string, u: { inputTokens: number; outputTokens: number; cachedInputTokens: number }, latencyMs: number) {
    this.calls++;
    this.inputTokens += u.inputTokens;
    this.outputTokens += u.outputTokens;
    this.latencyMs += latencyMs;
    this.costUsd += costUsd(model, u);
  },
  reset() {
    this.calls = 0;
    this.costUsd = 0;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.latencyMs = 0;
  },
};

/** Run async work with bounded concurrency, preserving input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
