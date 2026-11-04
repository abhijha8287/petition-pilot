/**
 * Eval 1: does the USCIS-officer agent predict the grounds the AAO actually relied on?
 *
 *   npm run eval:golden [-- --limit 5]
 *
 * For each golden case the officer sees ONLY the neutral facts (no outcome) in
 * a sandboxed workspace, and its AAO retrieval excludes the decision under test
 * (leave-one-out). An independent judge model then maps each gold ground to a
 * predicted objection or to "missed".
 *
 * Splits: dev_2023_2025, and holdout_2026, decisions published in 2026, which
 * are less likely to be in the models' training data.
 */
import { MODELS } from '../src/lib/ai/models';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { REQUIREMENTS } from '../src/lib/o1a/criteria';
import { callAgent, mapLimit, usageMeter } from '../src/mastra/runtime';
import { runOfficer } from '../src/mastra/pipeline/stages';
import { writeWorkspaceFile } from '../src/mastra/workspace';
import { MatchResult, objectionMatcher } from './lib/judges';
import { mean, wilson } from './lib/stats';

type Ground = { prong: string; criterion: string | null; reasonCode: string; summary: string; quote: string; dispositive: boolean; quoteVerified: boolean };
type Golden = { id: string; date: string; split: string; field: string; facts: string; grounds: Ground[]; reviewed: boolean; factsLeakage: string[] };

const REQUIREMENT_CODES = new Set(['NO_ADVISORY_OPINION', 'NO_CONTRACT_OR_ITINERARY', 'PETITIONER_NOT_QUALIFYING']);

/** Deterministic UUID per decision so the workspace path is stable. */
function evalCaseId(decisionId: string) {
  const h = crypto.createHash('sha1').update(`golden:${decisionId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const MATCH_CACHE = path.resolve('evals/.cache/match');

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  const dir = path.resolve('evals/golden/cases');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const golden: Golden[] = (await Promise.all(files.map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))))).slice(0, limit);
  if (!golden.length) throw new Error('No golden cases. Run evals/golden/build.ts first.');
  usageMeter.reset();

  // Phase 1: officer predictions (one model), cached so an interrupted eval resumes.
  // Phase 2: judging (another model). Phasing avoids swapping two local models per case.
  const cacheDir = path.resolve('evals/.cache/officer');
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(MATCH_CACHE, { recursive: true });
  type Pred = { objections: Awaited<ReturnType<typeof runOfficer>>['objections']; latencyMs: number; error?: string };
  const preds = new Map<string, Pred>();
  for (const g of golden) {
    const cacheFile = path.join(cacheDir, `${g.id}.json`);
    try {
      preds.set(g.id, JSON.parse(await fs.readFile(cacheFile, 'utf8')));
      continue;
    } catch {}
    const caseId = evalCaseId(g.id);
    const ws = { caseId, runId: 'golden' };
    await writeWorkspaceFile(caseId, 'golden', 'case_summary.md', `# O-1A petition under review\n\nField: ${g.field}\n\n## Record as submitted\n\n${g.facts}\n`);
    const t0 = Date.now();
    const pred: Pred = { objections: [], latencyMs: 0 };
    try {
      pred.objections = (await runOfficer({ ctx: null, workspace: ws, excludeDecisionIds: [g.id] })).objections;
    } catch (e) {
      pred.error = e instanceof Error ? e.message : String(e);
    }
    pred.latencyMs = Date.now() - t0;
    if (!pred.error) await fs.writeFile(cacheFile, JSON.stringify(pred));
    preds.set(g.id, pred);
    console.log(`officer ${g.id}: ${pred.objections.length} objections in ${(pred.latencyMs / 1000).toFixed(0)}s${pred.error ? ` ERROR ${pred.error.slice(0, 80)}` : ''}`);
  }

  const results = await mapLimit(golden, 1, async (g) => {
    const { objections, latencyMs, error } = preds.get(g.id)!;
    const gold = g.grounds.filter((x) => x.quoteVerified);

    // Lenient: same criterion (or same missing requirement) was flagged at all.
    const sameTarget = (x: Ground, o: (typeof objections)[number]) =>
      x.criterion
        ? o.criterion === x.criterion
        : x.prong === 'final_merits'
          ? o.prong === 'final_merits'
          : REQUIREMENT_CODES.has(x.reasonCode) && o.reasonCode === x.reasonCode;
    const lenient = gold.map((x) => objections.some((o) => sameTarget(x, o)));

    // Strict: an independent judge decides whether the same deficiency was raised,
    // and the matched objection must target the same criterion / prong. Judge
    // matches are cached so the scoring rule can change without re-calling it.
    const matchFile = path.join(MATCH_CACHE, `${g.id}.json`);
    let strict: (number | null)[] = gold.map(() => null);
    const cachedMatch = await fs.readFile(matchFile, 'utf8').then((t) => JSON.parse(t) as (number | null)[], () => null);
    if (cachedMatch && cachedMatch.length === gold.length) strict = cachedMatch;
    else if (gold.length && objections.length) {
      const m = await callAgent(
        null,
        'eval',
        objectionMatcher,
        `GOLD grounds:\n${gold.map((x, i) => `[${i}] (${x.prong}${x.criterion ? `/${x.criterion}` : ''}, ${x.reasonCode}) ${x.summary}`).join('\n')}\n\nPREDICTED objections:\n${objections
          .map((o, i) => `[${i}] (${o.prong}${o.criterion ? `/${o.criterion}` : ''}, ${o.reasonCode}) ${o.objection}`)
          .join('\n')}`,
        MatchResult,
      );
      strict = gold.map((_, i) => m.matches.find((x) => x.goldIndex === i)?.predictedIndex ?? null);
      await fs.writeFile(matchFile, JSON.stringify(strict));
    }
    const judgeMatches = strict.filter((x) => x !== null).length;
    strict = strict.map((idx, i) => (idx !== null && objections[idx] && sameTarget(gold[i], objections[idx]) ? idx : null));
    return {
      id: g.id,
      date: g.date,
      split: g.split,
      field: g.field,
      reviewed: g.reviewed,
      leakage: g.factsLeakage.length > 0,
      judgeMatchesRejectedAsOffTarget: judgeMatches - strict.filter((x) => x !== null).length,
      gold: gold.map((x, i) => ({ ...x, caughtStrict: strict[i] !== null, caughtLenient: lenient[i], matchedObjection: strict[i] })),
      predicted: objections.map((o) => ({ prong: o.prong, criterion: o.criterion, reasonCode: o.reasonCode, severity: o.severity, objection: o.objection, aaoRefs: o.aaoRefs.map((r) => r.decisionId) })),
      latencyMs,
      error,
    };
  });

  const summarize = (rows: typeof results) => {
    const grounds = rows.flatMap((r) => r.gold);
    const dispositive = grounds.filter((x) => x.dispositive);
    const strict = wilson(dispositive.filter((x) => x.caughtStrict).length, dispositive.length);
    const lenient = wilson(dispositive.filter((x) => x.caughtLenient).length, dispositive.length);
    const allCaught = rows.filter((r) => r.gold.filter((x) => x.dispositive).every((x) => x.caughtStrict) && r.gold.some((x) => x.dispositive)).length;
    const predicted = rows.reduce((s, r) => s + r.predicted.length, 0);
    const usedPred = rows.reduce((s, r) => s + new Set(r.gold.map((x) => x.matchedObjection).filter((x) => x !== null)).size, 0);
    return {
      cases: rows.length,
      dispositiveGrounds: dispositive.length,
      recallStrict: strict,
      recallLenient: lenient,
      casesFullyCaught: wilson(allCaught, rows.length),
      objectionsPerCase: mean(rows.map((r) => r.predicted.length)),
      /** Share of predictions that match an AAO ground. A lower bound on precision: the AAO often stops after the first dispositive ground. */
      matchedPredictionRate: predicted ? usedPred / predicted : 0,
      errors: rows.filter((r) => r.error).length,
    };
  };

  const byCriterion: Record<string, { n: number; caught: number }> = {};
  for (const r of results)
    for (const x of r.gold.filter((y) => y.dispositive)) {
      const k = x.criterion ?? (x.prong === 'final_merits' ? 'final_merits' : (REQUIREMENTS.find((q) => x.reasonCode.includes(q.key.split('_')[0].toUpperCase()))?.key ?? x.reasonCode));
      byCriterion[k] ??= { n: 0, caught: 0 };
      byCriterion[k].n++;
      if (x.caughtStrict) byCriterion[k].caught++;
    }

  const report = {
    eval: 'objection-recall',
    generatedAt: new Date().toISOString(),
    models: { officer: MODELS.officer, judge: MODELS.judge },
    method: 'Officer sees neutral facts only; AAO retrieval excludes the decision under test; independent judge maps each verified gold ground to a predicted objection.',
    overall: summarize(results),
    bySplit: Object.fromEntries(['dev_2023_2025', 'holdout_2026'].map((s) => [s, summarize(results.filter((r) => r.split === s))])),
    // Cases whose neutral facts still contained outcome words are excluded here, so a leak cannot inflate recall.
    noLeakage: summarize(results.filter((r) => !r.leakage)),
    leakedCases: results.filter((r) => r.leakage).map((r) => r.id),
    byCriterion,
    humanReviewedCases: results.filter((r) => r.reviewed).length,
    cost: { usd: usageMeter.costUsd, calls: usageMeter.calls, perCaseUsd: usageMeter.costUsd / results.length },
    latency: { meanSeconds: mean(results.map((r) => r.latencyMs)) / 1000 },
    cases: results,
  };
  await fs.mkdir('evals/reports', { recursive: true });
  await fs.writeFile('evals/reports/objection-recall.json', JSON.stringify(report, null, 2));
  const o = report.overall;
  console.log(`\nObjection recall (strict, dispositive grounds): ${(o.recallStrict.p * 100).toFixed(1)}% [${(o.recallStrict.lo * 100).toFixed(0)}-${(o.recallStrict.hi * 100).toFixed(0)}] over ${o.dispositiveGrounds} grounds / ${o.cases} cases`);
  console.log(`Leak-free subset (${report.noLeakage.cases} cases): strict ${(report.noLeakage.recallStrict.p * 100).toFixed(1)}%`);
  console.log(`Lenient (criterion-level): ${(o.recallLenient.p * 100).toFixed(1)}%   cases fully caught: ${(o.casesFullyCaught.p * 100).toFixed(1)}%`);
  console.log(`Cost $${report.cost.usd.toFixed(2)} ($${report.cost.perCaseUsd.toFixed(3)}/case), mean ${report.latency.meanSeconds.toFixed(1)}s/case`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
