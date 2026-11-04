import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchAao } from '@/lib/aao/retrieval';

/**
 * Retrieval over public AAO O-1 decisions. The request context may carry
 * `excludeDecisionIds` so a golden-set case can never retrieve its own
 * decision (leave-one-out evaluation).
 */
export const searchAaoTool = createTool({
  id: 'search_aao_decisions',
  description:
    'Search published USCIS Administrative Appeals Office (AAO) O-1 decisions for how officers ruled on similar evidence. Returns short excerpts with decision IDs.',
  inputSchema: z.object({
    query: z.string().describe('Focused description of the evidentiary issue, e.g. "judging invitation without proof review was completed"'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({ decisionId: z.string(), decisionDate: z.string().optional(), excerpt: z.string() })),
  }),
  execute: async ({ query }, ctx) => {
    const exclude = (ctx?.requestContext?.get('excludeDecisionIds') as string[] | undefined) ?? [];
    const hits = await searchAao(query, { k: 5, excludeIds: exclude });
    return {
      results: hits.map((h) => ({ decisionId: h.decisionId, decisionDate: h.decisionDate, excerpt: h.content.slice(0, 1400) })),
    };
  },
});
