import { createOpenAI } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { assertBudget, estTokens, recordSpend } from './budget';
import { EMBEDDING_DIMENSIONS, MODELS, costUsd, embeddingModelInstance } from './models';

/** Embeddings via the AI SDK: local Ollama by default, or a hosted OpenAI-compatible API. */
function model() {
  if (MODELS.provider === 'ollama') return embeddingModelInstance();
  const hosted =
    MODELS.provider === 'openrouter'
      ? createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY })
      : createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return hosted.embedding(MODELS.embedding);
}
const providerOptions = { openai: { dimensions: EMBEDDING_DIMENSIONS } };

function meter(values: string[], tokens: number | undefined) {
  const t = tokens ?? values.reduce((s, v) => s + estTokens(v), 0);
  recordSpend(costUsd(MODELS.embedding, { inputTokens: t }), { model: MODELS.embedding, label: 'embedding', inputTokens: t });
}

/** nomic-embed-text expects task prefixes; other models ignore them harmlessly. */
const prefix = (kind: 'query' | 'document', s: string) => (MODELS.embedding.startsWith('nomic') ? `search_${kind}: ${s}` : s);

export async function embedText(value: string): Promise<number[]> {
  assertBudget(costUsd(MODELS.embedding, { inputTokens: estTokens(value) }));
  const { embedding, usage } = await embed({ model: model(), value: prefix('query', value), providerOptions });
  meter([value], usage?.tokens);
  return embedding;
}

export async function embedTexts(values: string[]): Promise<number[][]> {
  assertBudget(costUsd(MODELS.embedding, { inputTokens: values.reduce((s, v) => s + estTokens(v), 0) }));
  const { embeddings, usage } = await embedMany({ model: model(), values: values.map((v) => prefix('document', v)), maxParallelCalls: 2, providerOptions });
  meter(values, usage?.tokens);
  return embeddings;
}
