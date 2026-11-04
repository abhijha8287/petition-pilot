import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Agent as HttpAgent, fetch as undiciFetch } from 'undici';
import { defaultSettingsMiddleware, wrapLanguageModel } from 'ai';

/**
 * Model routing. One switch, EXHIBIT_PROVIDER, picks where every model call goes:
 *
 *   ollama      (default) local models through Ollama's OpenAI-compatible API.
 *               $0, no API key, and client documents never leave the machine.
 *   openrouter  hosted models through one gateway (OPENROUTER_API_KEY).
 *   openai      OpenAI directly (OPENAI_API_KEY).
 *
 * Roles use different model families on purpose: the judge never grades
 * output from its own family (self-preference bias).
 */
export type Provider = 'ollama' | 'openrouter' | 'openai';
export const PROVIDER: Provider =
  (process.env.EXHIBIT_PROVIDER as Provider | undefined) ??
  (process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.OPENAI_API_KEY && process.env.EXHIBIT_USE_OPENAI ? 'openai' : 'ollama');

export const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434/v1';

const DEFAULTS: Record<Provider, { worker: string; drafter: string; officer: string; judge: string; embedding: string }> = {
  ollama: {
    worker: 'ollama/qwen3:8b',
    drafter: 'ollama/qwen3:8b',
    officer: 'ollama/qwen3:8b',
    judge: 'ollama/gemma4',
    embedding: 'nomic-embed-text',
  },
  openrouter: {
    worker: 'openrouter/openai/gpt-5.4-nano',
    drafter: 'openrouter/openai/gpt-5.4-nano',
    officer: 'openrouter/anthropic/claude-haiku-5.5',
    judge: 'openrouter/google/gemini-3.1-flash-lite',
    embedding: 'openai/text-embedding-3-small',
  },
  openai: {
    worker: 'openai/gpt-5.4-mini',
    drafter: 'openai/gpt-5.4-mini',
    officer: 'openai/gpt-5.5',
    judge: 'openai/gpt-5.5',
    embedding: 'text-embedding-3-small',
  },
};

export const MODELS = {
  worker: process.env.EXHIBIT_WORKER_MODEL ?? DEFAULTS[PROVIDER].worker,
  drafter: process.env.EXHIBIT_DRAFTER_MODEL ?? DEFAULTS[PROVIDER].drafter,
  officer: process.env.EXHIBIT_OFFICER_MODEL ?? DEFAULTS[PROVIDER].officer,
  judge: process.env.EXHIBIT_JUDGE_MODEL ?? DEFAULTS[PROVIDER].judge,
  embedding: process.env.EXHIBIT_EMBEDDING_MODEL ?? DEFAULTS[PROVIDER].embedding,
  provider: PROVIDER,
} as const;

/** All embeddings are 768-d: nomic-embed-text natively; OpenAI models are asked for 768 dimensions. */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * A local Ollama server generates one response at a time. Requests are queued
 * client-side (one in flight per process) and given a long timeout, so queued
 * work never trips Node's default 5-minute header timeout.
 */
const localHttp = new HttpAgent({ headersTimeout: 30 * 60_000, bodyTimeout: 30 * 60_000 });
let queue: Promise<unknown> = Promise.resolve();
const serialFetch = ((input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) => {
  const run = queue.then(() => undiciFetch(input, { ...init, dispatcher: localHttp }));
  queue = run.then(
    (r) => r.clone().arrayBuffer().catch(() => undefined),
    () => undefined,
  );
  return run;
}) as unknown as typeof fetch;

const ollama = createOpenAICompatible({ name: 'ollama', baseURL: OLLAMA_URL, supportsStructuredOutputs: true, includeUsage: true, fetch: serialFetch });

/**
 * Resolve a model id into what Mastra's Agent accepts: router strings
 * ("openrouter/x/y", "openai/x") pass through; "ollama/<tag>" becomes an AI SDK
 * model instance pointed at the local Ollama server.
 */
export function agentModel(id: string, settings?: { temperature?: number; seed?: number }) {
  if (!id.startsWith('ollama/')) return id;
  const model = ollama.chatModel(id.slice('ollama/'.length));
  return settings ? wrapLanguageModel({ model, middleware: defaultSettingsMiddleware({ settings }) }) : model;
}

/**
 * Ollama runs some models (e.g. gemma4) on its MLX engine, which rejects
 * JSON-schema response formats (HTTP 501). For those, the schema is injected
 * into the prompt instead; the answer is still validated against the schema.
 */
export function nativeStructuredOutput(model: string) {
  const list = process.env.EXHIBIT_PROMPT_JSON_MODELS ?? 'ollama/gemma';
  return !list.split(',').some((prefix) => prefix && model.startsWith(prefix.trim()));
}

/** LLM-as-judge calls are deterministic: temperature 0 and a fixed seed, so the same input gets the same grade. */
export const JUDGE_SETTINGS = { temperature: 0, seed: 7 } as const;

/**
 * Qwen3 "thinking" mode spends minutes on hidden reasoning before each
 * structured answer. For schema-bound extraction and drafting on a local 8B
 * model it costs time without improving accuracy, so it is switched off with
 * Qwen's documented /no_think soft switch.
 */
export function promptSuffix(model: string) {
  return /^ollama\/qwen3/.test(model) && !process.env.EXHIBIT_QWEN_THINK ? '/no_think\n' : '';
}

export function embeddingModelInstance() {
  return ollama.embeddingModel(MODELS.embedding);
}

/**
 * USD per 1M tokens. OpenRouter prices from its public /api/v1/models endpoint
 * (checked 2026-11-03). Local models cost nothing.
 */
const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  'openai/gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
  'anthropic/claude-haiku-5.5': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  'google/gemini-3.1-flash-lite': { input: 0.25, cachedInput: 0.025, output: 1.5 },
  'openai/text-embedding-3-small': { input: 0.02, cachedInput: 0.02, output: 0 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.5': { input: 5, cachedInput: 0.5, output: 30 },
  'text-embedding-3-small': { input: 0.02, cachedInput: 0.02, output: 0 },
};
const FREE = { input: 0, cachedInput: 0, output: 0 };
/** Unknown hosted models are priced pessimistically so the budget guard errs on the safe side. */
const UNKNOWN = { input: 5, cachedInput: 5, output: 30 };

export type Usage = { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };

export function priceOf(model: string) {
  if (model.startsWith('ollama') || model === 'nomic-embed-text') return FREE;
  const id = model.replace(/^openrouter\//, '');
  return PRICES[id] ?? PRICES[id.split('/').pop() ?? id] ?? UNKNOWN;
}

export function costUsd(model: string, usage: Usage): number {
  const p = priceOf(model);
  const cached = usage.cachedInputTokens ?? 0;
  const fresh = Math.max(0, (usage.inputTokens ?? 0) - cached);
  return (fresh * p.input + cached * p.cachedInput + (usage.outputTokens ?? 0) * p.output) / 1_000_000;
}
