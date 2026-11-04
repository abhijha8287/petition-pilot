/**
 * Eval 3: reliability.
 *
 *   npm run eval:reliability [-- --k 5]
 *
 * (a) Consistency: run evidence mapping (ingest → claims → criteria → gaps)
 *     k times per demo case and measure agreement across runs.
 * (b) Recovery: run the full durable workflow with injected failures in two
 *     steps and check that it still reaches the attorney checkpoint, reusing
 *     committed work instead of redoing it.
 */
import fs from 'node:fs/promises';
import { normalizeText } from '../src/lib/citations/verify';
import { CRITERIA, countLikelyMet, type Strength } from '../src/lib/o1a/criteria';
import { adminClient } from '../src/lib/supabase/admin';
import { executePipelineRun } from '../src/mastra/pipeline/control';
import { analyzeGaps, extractClaims, ingest, mapCriteria } from '../src/mastra/pipeline/stages';
import { remainingUsd, spentUsd } from '../src/lib/ai/budget';
import { checkpointed, usageMeter } from '../src/mastra/runtime';
import { fleissKappa, jaccard, mean } from './lib/stats';

const db = adminClient();

async function mappingRun(caseId: string) {
  const { data: run } = await db.from('pipeline_runs').insert({ case_id: caseId, config: { trigger: 'reliability-eval' } }).select('id').single();
  const ctx = { caseId, runId: run!.id };
  const before = usageMeter.costUsd;
  const t0 = Date.now();
  await checkpointed(ctx, 'ingest', () => ingest(ctx));
  await checkpointed(ctx, 'extract_claims', () => extractClaims(ctx));
  await checkpointed(ctx, 'map_criteria', () => mapCriteria(ctx));
  await checkpointed(ctx, 'gaps', () => analyzeGaps(ctx));
  await db.from('pipeline_runs').update({ status: 'succeeded', finished_at: new Date().toISOString() }).eq('id', ctx.runId);
  const [{ data: a }, { data: claims }, { data: ex }] = await Promise.all([
    db.from('criterion_assessments').select('criterion,strength').eq('run_id', ctx.runId),
    db.from('claims').select('exhibit_id,page_no,quote').eq('run_id', ctx.runId).eq('quote_verified', true),
    db.from('exhibits').select('id,label').eq('case_id', caseId),
  ]);
  const label = new Map((ex ?? []).map((e) => [e.id, e.label]));
  const strengths = Object.fromEntries((a ?? []).map((x) => [x.criterion, x.strength])) as Record<string, Strength>;
  return {
    runId: ctx.runId,
    strengths,
    likelyMet: countLikelyMet(Object.values(strengths).map((strength) => ({ strength }))),
    // Claims identified by exhibit + page + first 60 normalized chars of the quote
    claimKeys: new Set((claims ?? []).map((c) => `${label.get(c.exhibit_id)}:${c.page_no}:${normalizeText(c.quote).slice(0, 60)}`)),
    costUsd: usageMeter.costUsd - before,
    seconds: (Date.now() - t0) / 1000,
  };
}

async function recoveryTest(caseId: string) {
  const { data: run } = await db.from('pipeline_runs').insert({ case_id: caseId, config: { trigger: 'recovery-eval', chaos: 'extract_claims,draft' } }).select('id').single();
  const prev = process.env.EXHIBIT_CHAOS;
  process.env.EXHIBIT_CHAOS = 'extract_claims,draft';
  const t0 = Date.now();
  const res = await executePipelineRun(caseId, run!.id);
  process.env.EXHIBIT_CHAOS = prev ?? '';
  const { data: ev } = await db.from('agent_events').select('step,kind,meta').eq('run_id', run!.id);
  const injected = (ev ?? []).filter((e) => e.kind === 'error' && (e.meta as { injected?: boolean })?.injected).length;
  const reached = res.status === 'suspended';
  return {
    runId: run!.id,
    injectedFailures: injected,
    finalStatus: res.status,
    reachedAttorneyCheckpoint: reached,
    // In-process recovery: Mastra retries only the failed step, so success means every step
    // committed exactly once (no duplicated work). Cross-process recovery from checkpoints
    // after a kill -9 is shown by `npm run pipeline -- crash-demo`.
    stepsCommittedOnce: Object.values(
      (ev ?? []).filter((e) => e.kind === 'step_end').reduce<Record<string, number>>((m, e) => ({ ...m, [e.step]: (m[e.step] ?? 0) + 1 }), {}),
    ).every((n) => n === 1),
    reusedSteps: (ev ?? []).filter((e) => e.kind === 'step_skipped').length,
    seconds: (Date.now() - t0) / 1000,
  };
}

async function main() {
  const kArg = process.argv.indexOf('--k');
  const k = kArg > 0 ? Number(process.argv[kArg + 1]) : 5;
  const only = (process.env.RELIABILITY_CASES ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const { data: all } = await db.from('cases').select('id,beneficiary_name').like('title', 'O-1A · %').order('created_at');
  const cases = (all ?? []).filter((c) => !only.length || only.some((o) => c.beneficiary_name.includes(o)));
  usageMeter.reset();
  const perCase = [];
  for (const c of cases) {
    const runs: Awaited<ReturnType<typeof mappingRun>>[] = [];
    for (let i = 0; i < k; i++) {
      // Keep a reserve for the recovery test; stop early rather than overspend.
      const lastCost = runs.at(-1)?.costUsd ?? 0.05;
      if (remainingUsd() < lastCost * 1.5 + 0.08) {
        console.log(`  budget: stopping ${c.beneficiary_name} after ${runs.length} runs ($${spentUsd().toFixed(3)} spent)`);
        break;
      }
      process.stdout.write(`${c.beneficiary_name} run ${i + 1}/${k}… `);
      runs.push(await mappingRun(c.id));
      console.log(`${runs.at(-1)!.likelyMet}/8 likely met ($${runs.at(-1)!.costUsd.toFixed(3)})`);
    }
    if (runs.length < 2) continue;
    const matrix = CRITERIA.map((cr) => runs.map((r) => r.strengths[cr.key] ?? 'none'));
    const modal = matrix.map((row) => Math.max(...Object.values(row.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}))) / row.length);
    const metOrNot = matrix.map((row) => row.map((s) => (s === 'strong' || s === 'moderate' ? 'met' : 'not')));
    const verdicts = runs.map((r) => r.likelyMet >= 3);
    const majority = verdicts.filter(Boolean).length * 2 >= verdicts.length;
    const pairs: number[] = [];
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) pairs.push(jaccard(runs[i].claimKeys, runs[j].claimKeys));
    perCase.push({
      case: c.beneficiary_name,
      k: runs.length,
      runs: runs.map((r) => ({ runId: r.runId, likelyMet: r.likelyMet, strengths: r.strengths, claims: r.claimKeys.size, costUsd: r.costUsd, seconds: r.seconds })),
      strengthModalAgreement: mean(modal),
      metDecisionAgreement: mean(metOrNot.map((row) => Math.max(row.filter((x) => x === 'met').length, row.filter((x) => x === 'not').length) / row.length)),
      fleissKappaStrength: fleissKappa(matrix),
      verdictConsistentAllRuns: verdicts.every((v) => v === majority),
      likelyMetRange: [Math.min(...runs.map((r) => r.likelyMet)), Math.max(...runs.map((r) => r.likelyMet))],
      claimJaccardMean: mean(pairs),
      perCriterion: Object.fromEntries(CRITERIA.map((cr, i) => [cr.key, matrix[i]])),
    });
  }

  const pooledMatrix = perCase.flatMap((c) => Object.values(c.perCriterion));
  const mappingCost = usageMeter.costUsd;
  const okafor = cases.find((c) => c.beneficiary_name.includes('Okafor')) ?? cases[0];
  console.log('Recovery test (failures injected in extract_claims and draft)…');
  const recovery = await recoveryTest(okafor.id);

  const report = {
    eval: 'reliability',
    generatedAt: new Date().toISOString(),
    k,
    pooled: {
      fleissKappaStrength: fleissKappa(pooledMatrix),
      fleissKappaMet: fleissKappa(pooledMatrix.map((row) => row.map((s) => (s === 'strong' || s === 'moderate' ? 'met' : 'not')))),
      strengthModalAgreement: mean(perCase.map((c) => c.strengthModalAgreement)),
      metDecisionAgreement: mean(perCase.map((c) => c.metDecisionAgreement)),
      verdictPassK: perCase.filter((c) => c.verdictConsistentAllRuns).length / perCase.length,
      claimJaccardMean: mean(perCase.map((c) => c.claimJaccardMean)),
    },
    perCase,
    recovery,
    cost: { mappingRunsUsd: mappingCost, perMappingRunUsd: mappingCost / (perCase.length * k), recoveryRunUsd: usageMeter.costUsd - mappingCost },
    latency: { meanMappingRunSeconds: mean(perCase.flatMap((c) => c.runs.map((r) => r.seconds))) },
  };
  await fs.writeFile('evals/reports/reliability.json', JSON.stringify(report, null, 2));
  console.log(`\nStrength agreement ${(report.pooled.strengthModalAgreement * 100).toFixed(1)}%, met/not-met agreement ${(report.pooled.metDecisionAgreement * 100).toFixed(1)}%, Fleiss κ ${report.pooled.fleissKappaStrength.toFixed(2)}`);
  console.log(`Verdict (≥3 criteria) identical across all ${k} runs: ${(report.pooled.verdictPassK * 100).toFixed(0)}% of cases; claim-set Jaccard ${report.pooled.claimJaccardMean.toFixed(2)}`);
  console.log(`Recovery: ${recovery.injectedFailures} injected failures → ${recovery.finalStatus}; every step committed exactly once: ${recovery.stepsCommittedOnce}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
