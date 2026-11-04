import { createTool } from '@mastra/core/tools';
import { MCPServer } from '@mastra/mcp';
import { z } from 'zod';
import { searchAao } from '@/lib/aao/retrieval';
import { verifyQuote } from '@/lib/citations/verify';
import { CRITERIA, countLikelyMet, type Strength } from '@/lib/o1a/criteria';
import { adminClient } from '@/lib/supabase/admin';

/**
 * MCP server exposing PetitionPilot case tools to external agents (Claude Code,
 * Claude Desktop, IDE agents) over stdio, MCP revision 2026-07-28.
 *
 * Tools are read-only by design: an external agent can inspect evidence,
 * verify citations and search AAO precedent, but drafting decisions and
 * sign-off stay inside the app behind RLS and the attorney checkpoint.
 * This server runs locally with the service key; treat it as staff tooling.
 */
const db = () => adminClient();

const listCases = createTool({
  id: 'list_cases',
  title: 'List cases',
  description: 'List O-1A cases with status and how many of the 8 criteria are likely met.',
  inputSchema: z.object({}),
  outputSchema: z.object({ cases: z.array(z.object({ id: z.string(), beneficiary: z.string(), field: z.string(), status: z.string(), likelyMet: z.number().nullable() })) }),
  execute: async () => {
    const { data: cases } = await db().from('cases').select('id,beneficiary_name,field,status,active_run_id').order('created_at');
    const runIds = (cases ?? []).map((c) => c.active_run_id).filter((x): x is string => !!x);
    const { data: a } = runIds.length ? await db().from('criterion_assessments').select('run_id,strength').in('run_id', runIds) : { data: [] };
    return {
      cases: (cases ?? []).map((c) => {
        const rows = (a ?? []).filter((x) => x.run_id === c.active_run_id) as { strength: Strength }[];
        return { id: c.id, beneficiary: c.beneficiary_name, field: c.field, status: c.status, likelyMet: rows.length ? countLikelyMet(rows) : null };
      }),
    };
  },
});

const getEvidenceMap = createTool({
  id: 'get_evidence_map',
  title: 'Get evidence map',
  description: 'For one case: each O-1A criterion with strength, rationale and the cited evidence (exhibit, page, verbatim quote), plus gaps and open objections.',
  inputSchema: z.object({ caseId: z.string().uuid() }),
  execute: async ({ caseId }) => {
    const { data: c } = await db().from('cases').select('*').eq('id', caseId).single();
    if (!c?.active_run_id) return { error: 'Case has no completed run.' };
    const run = c.active_run_id;
    const [{ data: a }, { data: claims }, { data: ex }, { data: gaps }, { data: obj }] = await Promise.all([
      db().from('criterion_assessments').select('*').eq('run_id', run),
      db().from('claims').select('id,exhibit_id,page_no,quote').eq('run_id', run).eq('quote_verified', true),
      db().from('exhibits').select('id,label,title').eq('case_id', caseId),
      db().from('gaps').select('kind,title,detail,severity').eq('run_id', run),
      db().from('objections').select('severity,criterion,reason_code,objection,suggested_fix,status').eq('run_id', run).eq('status', 'open'),
    ]);
    const label = new Map((ex ?? []).map((e) => [e.id, e.label]));
    const byId = new Map((claims ?? []).map((x) => [x.id, x]));
    return {
      beneficiary: c.beneficiary_name,
      criteria: CRITERIA.map((k) => {
        const row = (a ?? []).find((x) => x.criterion === k.key);
        return {
          criterion: k.key,
          cfr: k.cfr,
          strength: row?.strength ?? 'none',
          rationale: row?.rationale ?? '',
          evidence: ((row?.claim_ids as string[]) ?? []).map((id) => byId.get(id)).filter(Boolean).map((cl) => ({ exhibit: label.get(cl!.exhibit_id), page: cl!.page_no, quote: cl!.quote })),
        };
      }),
      gaps,
      openObjections: obj,
    };
  },
});

const readExhibitPage = createTool({
  id: 'read_exhibit_page',
  title: 'Read exhibit page',
  description: 'Return the extracted text of one page of a case exhibit.',
  inputSchema: z.object({ caseId: z.string().uuid(), exhibitLabel: z.string().regex(/^[A-Z]$/), page: z.number().int().min(1) }),
  execute: async ({ caseId, exhibitLabel, page }) => {
    const { data: ex } = await db().from('exhibits').select('id,title').eq('case_id', caseId).eq('label', exhibitLabel).single();
    if (!ex) return { error: 'No such exhibit.' };
    const { data: p } = await db().from('exhibit_pages').select('content').eq('exhibit_id', ex.id).eq('page_no', page).single();
    return { exhibit: exhibitLabel, title: ex.title, page, text: p?.content ?? null };
  },
});

const verifyCitation = createTool({
  id: 'verify_citation',
  title: 'Verify citation',
  description: 'Check deterministically whether a quote appears on a given exhibit page (exact, normalized or near-exact match).',
  inputSchema: z.object({ caseId: z.string().uuid(), exhibitLabel: z.string(), page: z.number().int().min(1), quote: z.string() }),
  execute: async ({ caseId, exhibitLabel, page, quote }) => {
    const { data: ex } = await db().from('exhibits').select('id').eq('case_id', caseId).eq('label', exhibitLabel).single();
    const { data: p } = ex ? await db().from('exhibit_pages').select('content').eq('exhibit_id', ex.id).eq('page_no', page).single() : { data: null };
    return p ? verifyQuote(quote, p.content) : { verified: false, method: 'none', score: 0, error: 'page not found' };
  },
});

const searchDecisions = createTool({
  id: 'search_aao_decisions',
  title: 'Search AAO decisions',
  description: 'Hybrid semantic + keyword search over published USCIS AAO O-1 appeal decisions (2023-2026).',
  inputSchema: z.object({ query: z.string(), k: z.number().int().min(1).max(10).default(5) }),
  execute: async ({ query, k }) => ({
    results: (await searchAao(query, { k })).map((h) => ({ decisionId: h.decisionId, date: h.decisionDate, url: h.sourceUrl, excerpt: h.content.slice(0, 1200) })),
  }),
});

export const exhibitMcpServer = new MCPServer({
  id: 'petition-pilot',
  name: 'PetitionPilot',
  title: 'PetitionPilot: O-1A evidence tools',
  version: '1.0.0',
  description: 'Read-only access to O-1A evidence maps, exhibit pages, citation verification and AAO precedent search.',
  instructions: 'Use list_cases to find a case, get_evidence_map for the criteria analysis, read_exhibit_page to inspect sources, and verify_citation before relying on any quote. Nothing here is legal advice.',
  tools: { list_cases: listCases, get_evidence_map: getEvidenceMap, read_exhibit_page: readExhibitPage, verify_citation: verifyCitation, search_aao_decisions: searchDecisions },
});
