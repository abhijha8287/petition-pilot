/**
 * Builds the golden objection set from real, public AAO O-1A dismissals.
 *
 *   npx tsx --env-file=.env.local evals/golden/build.ts [--force]
 *
 * Output: evals/golden/cases/<decisionId>.json (committed). Each file records
 * `reviewed: false` until a human has checked the labels against the source;
 * the report shows how many golden cases are human-reviewed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyQuote } from '../../src/lib/citations/verify';
import { adminClient } from '../../src/lib/supabase/admin';
import { callAgent, mapLimit, usageMeter } from '../../src/mastra/runtime';
import { GoldenCase, goldenLabeler } from '../lib/judges';

const OUT = path.resolve('evals/golden/cases');

/** Words that would leak the outcome into the facts the officer agent sees. */
const LEAK = /\b(insufficient|deficien\w*|did not (establish|demonstrate|show|meet|submit|provide)|not (established|demonstrated|shown|sufficient)|fail(s|ed)? to|lack(s|ed|ing)?|missing|denied|denial|dismiss\w*|appeal|director|aao|rfe|request for evidence|unpersuasive|conclusory)\b/i;

export function leakage(facts: string): string[] {
  return [...facts.matchAll(new RegExp(LEAK, 'gi'))].map((m) => m[0].toLowerCase());
}

async function main() {
  const force = process.argv.includes('--force');
  await fs.mkdir(OUT, { recursive: true });
  const { data: decisions } = await adminClient().from('aao_decisions').select('id,decision_date,source_url,content').eq('split', 'golden').order('id');
  if (!decisions?.length) throw new Error('No golden decisions. Run npm run aao:ingest first.');

  await mapLimit(decisions, 3, async (d) => {
    const file = path.join(OUT, `${d.id}.json`);
    if (!force) {
      try {
        await fs.access(file);
        return;
      } catch {}
    }
    let label: GoldenCase | undefined;
    let leaks: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      label = await callAgent(null, 'golden', goldenLabeler, `Decision ${d.id} (${d.decision_date}):\n\n${d.content}${attempt ? `\n\nYour previous facts leaked the outcome via: ${leaks.join(', ')}. Rewrite them neutrally.` : ''}`, GoldenCase);
      leaks = leakage(label.facts);
      if (leaks.length === 0) break;
    }
    const grounds = label!.grounds.map((g) => ({ ...g, quoteVerified: verifyQuote(g.quote, d.content).verified }));
    const out = {
      id: d.id,
      date: d.decision_date,
      sourceUrl: d.source_url,
      split: d.decision_date >= '2026-01-01' ? 'holdout_2026' : 'dev_2023_2025',
      field: label!.field,
      facts: label!.facts,
      factsLeakage: leaks,
      grounds,
      reviewed: false,
      reviewNotes: '',
    };
    await fs.writeFile(file, JSON.stringify(out, null, 2));
    console.log(`${d.id}: ${grounds.length} grounds (${grounds.filter((g) => g.quoteVerified).length} quote-verified)${leaks.length ? ` LEAK: ${leaks.join(',')}` : ''}`);
  });
  console.log(`\nLabeler cost: $${usageMeter.costUsd.toFixed(2)} over ${usageMeter.calls} calls`);
}

// pathToFileURL encodes spaces etc., so this also works when the repo path has a space.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
