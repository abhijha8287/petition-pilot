import { embedText } from '@/lib/ai/embeddings';
import { adminClient } from '@/lib/supabase/admin';

export type AaoHit = { decisionId: string; chunkIndex: number; content: string; score: number; sourceUrl?: string; decisionDate?: string };

/**
 * Hybrid (pgvector + Postgres full-text, fused with RRF) search over public
 * AAO O-1 decisions. `excludeIds` supports leave-one-out evaluation.
 */
export async function searchAao(query: string, opts: { k?: number; excludeIds?: string[] } = {}): Promise<AaoHit[]> {
  const db = adminClient();
  const embedding = await embedText(query);
  const { data, error } = await db.rpc('match_aao_chunks', {
    query_embedding: JSON.stringify(embedding),
    query_text: query,
    match_count: opts.k ?? 6,
    exclude_ids: opts.excludeIds ?? [],
  });
  if (error) throw new Error(`AAO search failed: ${error.message}`);
  const ids = [...new Set((data ?? []).map((r) => r.decision_id))];
  const { data: meta } = ids.length
    ? await db.from('aao_decisions').select('id, source_url, decision_date').in('id', ids)
    : { data: [] };
  const byId = new Map((meta ?? []).map((m) => [m.id, m]));
  return (data ?? []).map((r) => ({
    decisionId: r.decision_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    score: r.score,
    sourceUrl: byId.get(r.decision_id)?.source_url,
    decisionDate: byId.get(r.decision_id)?.decision_date,
  }));
}

/** Split decision text into overlapping chunks on paragraph boundaries. */
export function chunkDecision(text: string, target = 1200, overlap = 200): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 40);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length > target) {
      chunks.push(cur);
      cur = cur.slice(Math.max(0, cur.length - overlap)) + ' ' + p;
    } else {
      cur = cur ? `${cur} ${p}` : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
