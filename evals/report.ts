/**
 * Combines eval outputs into evals/reports/summary.json and EVALS.md.
 *
 *   npm run eval:report
 */
import fs from 'node:fs/promises';
import { adminClient } from '../src/lib/supabase/admin';
import { activeSeconds } from '../src/lib/data/run-metrics';

const read = async <T>(f: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.readFile(f, 'utf8')) as T;
  } catch {
    return null;
  }
};
const p = (x?: number) => (x === undefined || Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const ci = (w?: { p: number; lo: number; hi: number }) => (w ? `${p(w.p)} (95% CI ${p(w.lo)} to ${p(w.hi)})` : 'n/a');

/* eslint-disable @typescript-eslint/no-explicit-any */
async function main() {
  const recall = await read<any>('evals/reports/objection-recall.json');
  // Earlier judge configurations, kept for transparency (see "Judge revisions" below).
  const recallV1 = await read<any>('evals/reports/objection-recall.v1-unconstrained-judge.json');
  const faithV1 = await read<any>('evals/reports/faithfulness.v1-quote-only-judge.json');
  const faith = await read<any>('evals/reports/faithfulness.json');
  const rel = await read<any>('evals/reports/reliability.json');

  // Production-path cost and time per case, from the demo cases' latest runs.
  const db = adminClient();
  const { data: cases } = await db.from('cases').select('beneficiary_name,active_run_id').not('active_run_id', 'is', null);
  const perCase = [];
  for (const c of cases ?? []) {
    const { data: ev } = await db.from('agent_events').select('kind,step,cost_usd,created_at,latency_ms').eq('run_id', c.active_run_id!).order('id');
    const work = (ev ?? []).filter((e) => e.step !== 'attorney_review');
    perCase.push({
      case: c.beneficiary_name,
      costUsd: work.filter((e) => e.kind === 'llm_call').reduce((s, e) => s + Number(e.cost_usd ?? 0), 0),
      seconds: activeSeconds(work),
      modelCalls: work.filter((e) => e.kind === 'llm_call').length,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    objectionRecall: recall && {
      cases: recall.overall.cases,
      grounds: recall.overall.dispositiveGrounds,
      recallStrict: recall.overall.recallStrict,
      recallLenient: recall.overall.recallLenient,
      casesFullyCaught: recall.overall.casesFullyCaught,
      matchedPredictionRate: recall.overall.matchedPredictionRate,
      bySplit: recall.bySplit,
      noLeakage: recall.noLeakage,
      leakedCases: recall.leakedCases,
      byCriterion: recall.byCriterion,
      models: recall.models,
      humanReviewedCases: recall.humanReviewedCases,
      costPerCaseUsd: recall.cost.perCaseUsd,
    },
    faithfulness: faith && {
      sentences: faith.sentences,
      supported: faith.supported,
      partiallySupported: faith.partiallySupported,
      unsupported: faith.unsupported,
      quoteOnPageRate: faith.quoteOnPageRate,
      humanCalibration: faith.humanCalibration,
      judgeModel: faith.judgeModel,
      failures: faith.failures?.slice(0, 10),
    },
    reliability: rel && { k: rel.k, pooled: rel.pooled, perCase: rel.perCase.map((c: any) => ({ case: c.case, k: c.k, runSeconds: (c.runs ?? []).map((x: any) => x.seconds), likelyMetRange: c.likelyMetRange, verdictConsistentAllRuns: c.verdictConsistentAllRuns, strengthModalAgreement: c.strengthModalAgreement, claimJaccardMean: c.claimJaccardMean })), recovery: rel.recovery },
    costLatency: { perCase, meanCostUsd: perCase.length ? perCase.reduce((s, x) => s + x.costUsd, 0) / perCase.length : null, meanSeconds: perCase.length ? perCase.reduce((s, x) => s + x.seconds, 0) / perCase.length : null },
  };
  await fs.writeFile('evals/reports/summary.json', JSON.stringify(summary, null, 2));

  const r = summary.objectionRecall;
  const f = summary.faithfulness;
  const l = summary.reliability;
  const md = `# Evaluation report

_Generated ${summary.generatedAt}. Reproduce with \`npm run eval:golden && npm run eval:faithfulness && npm run eval:reliability && npm run eval:report\`._

## 1. Objection recall on real AAO dismissals

Golden set: **${r?.cases ?? 'n/a'} published AAO O-1A appeal dismissals (2023-2026)** from the USCIS non-precedent decision library, with **${r?.grounds ?? 'n/a'} dispositive grounds**. The officer agent sees only a neutral summary of the record (outcome language is stripped and checked by a leakage filter), and its AAO retrieval excludes the decision under test (leave-one-out). An independent judge model maps each gold ground to a predicted objection.

| Metric | Value |
|---|---|
| Recall, strict (same deficiency raised) | ${ci(r?.recallStrict)} |
| Recall, lenient (same criterion/requirement flagged) | ${ci(r?.recallLenient)} |
| Cases where every dispositive ground was caught | ${ci(r?.casesFullyCaught)} |
| Predictions matching an AAO ground (lower bound on precision) | ${p(r?.matchedPredictionRate)} |
| 2023-2025 split, strict recall | ${ci(r?.bySplit?.dev_2023_2025?.recallStrict)} |
| 2026 held-out split, strict recall | ${ci(r?.bySplit?.holdout_2026?.recallStrict)} |
| Golden cases human-reviewed | ${r?.humanReviewedCases ?? 0} of ${r?.cases ?? 'n/a'} |
| Cost per case | ${r ? `$${r.costPerCaseUsd.toFixed(3)}` : 'n/a'} |
| Leak-free subset (${r?.noLeakage?.cases ?? 'n/a'} cases), strict recall | ${ci(r?.noLeakage?.recallStrict)} |

Models: officer \`${r?.models?.officer ?? 'n/a'}\`, judge \`${r?.models?.judge ?? 'n/a'}\` (different model families), both local via Ollama.

**By criterion (strict, dispositive grounds):**

| Ground | Caught / total |
|---|---|
${Object.entries((r?.byCriterion ?? {}) as Record<string, { n: number; caught: number }>)
  .sort((a, b) => b[1].n - a[1].n)
  .map(([k, v]) => `| ${k} | ${v.caught} / ${v.n} |`)
  .join('\n')}

Grounds labeled \`CRITERION_NOT_MET\` (no specific criterion) and \`PROCEDURAL\` cannot be predicted from the facts summary; they are kept in the denominator rather than excluded.

## 2. Citation faithfulness of drafted sentences

| Metric | Value |
|---|---|
| Sentences evaluated | ${f?.sentences ?? 'n/a'} |
| Uncited sentences | 0 (rejected by code and by a database constraint) |
| Cited quote found on the cited page | ${p(f?.quoteOnPageRate)} |
| Fully supported by cited passage (LLM judge) | ${ci(f?.supported)} |
| Partially supported | ${p(f?.partiallySupported)} |
| Unsupported | ${p(f?.unsupported)} |
| Judge vs. human agreement | ${f?.humanCalibration ? `${p(f.humanCalibration.agreementBinary)} on ${f.humanCalibration.n} hand-labeled sentences (Cohen's κ ${f.humanCalibration.kappaBinary.toFixed(2)})` : 'pending: label evals/human/faithfulness-sample.csv, then run `npm run eval:faithfulness -- --calibrate`'} |

## 3. Reliability (${l?.k ?? 5} independent runs per case)

| Metric | Value |
|---|---|
| Criterion strength identical to the modal rating | ${p(l?.pooled?.strengthModalAgreement)} |
| Met / not-met decision agreement | ${p(l?.pooled?.metDecisionAgreement)} |
| Fleiss' κ, strength (pooled) | ${l?.pooled?.fleissKappaStrength?.toFixed(2) ?? 'n/a'} |
| "≥3 criteria" verdict identical in all runs (pass^k) | ${p(l?.pooled?.verdictPassK)} of cases |
| Claim-set overlap between runs (mean Jaccard) | ${l?.pooled?.claimJaccardMean?.toFixed(2) ?? 'n/a'} |
| Fault injection | ${l?.recovery ? `${l.recovery.injectedFailures} injected failures → ${l.recovery.reachedAttorneyCheckpoint ? 'reached the attorney checkpoint' : l.recovery.finalStatus}${l.recovery.stepsCommittedOnce ? ', every step committed exactly once' : ''}` : 'n/a'} |

${l?.perCase?.map((c: any) => `- **${c.case}**: likely-met range ${c.likelyMetRange.join('–')}, verdict stable: ${c.verdictConsistentAllRuns ? 'yes' : 'no'}, strength agreement ${p(c.strengthModalAgreement)}`).join('\n') ?? ''}

## 4. Cost and speed per case (production path)

${summary.costLatency.perCase.map((c) => `- **${c.case}**: $${c.costUsd.toFixed(3)}, ${Math.round(c.seconds)}s compute time, ${c.modelCalls} model calls`).join('\n') || '- n/a'}

Mean: ${summary.costLatency.meanCostUsd !== null ? `$${summary.costLatency.meanCostUsd.toFixed(3)} and ${Math.round(summary.costLatency.meanSeconds!)}s per case` : 'n/a'}, set against a 48-hour preparation promise. Attorney review time is not included.

Clean timings on the reference machine (Apple M5, 16 GB RAM, all models local via Ollama, one request at a time):

${l?.perCase?.map((c: any) => `- **${c.case}**: evidence mapping (ingest → claims → criteria → gaps) ${c.runSeconds?.length ? `${Math.round(Math.min(...c.runSeconds) / 60)}–${Math.round(Math.max(...c.runSeconds) / 60)} min` : 'n/a'} over ${c.k} runs`).join('\n') ?? ''}
${l?.recovery ? `- Full pipeline to the attorney checkpoint with 2 injected failures (Okafor): ${Math.round(l.recovery.seconds / 60)} min` : ''}

Production-path figures above sum the latest successful duration of each step. Where a step ran while the machine was swapping heavily (Raman's extraction and mapping ran overnight with two 6-9 GB models competing for 16 GB), the figure reflects that, not the pipeline. A hosted model would cut all of these to minutes.

## Judge revisions (disclosed)

Both LLM judges were revised once after inspecting their output. Earlier results are kept in \`evals/reports/*.v1-*.json\`.

- **Objection matcher**: v1 accepted matches where the predicted objection targeted a different criterion, which made strict recall (${recallV1 ? p(recallV1.overall.recallStrict.p) : 'n/a'}) exceed lenient recall. v2 requires the matched objection to target the same criterion or prong; the judge's raw matches are cached and re-scored, with no new model calls.
- **Faithfulness judge**: v1 saw only the quoted text and rejected, for example, a CV line "Lindqvist Prize, 2025" as support for "Dr. Raman received the Lindqvist Prize" because the line does not repeat her name (v1: ${faithV1 ? p(faithV1.supported.p) : 'n/a'} supported). v2 also sees which exhibit each passage comes from and whose case it is, and is still told to reject added facts and evaluative words.
- Neither revision has yet been checked against human labels; the human-calibration sample above is the safeguard.

## Known limitations

- The golden labels were extracted by a model and verified mechanically (every ground carries a verbatim quote found in the decision); human review status is tracked per case in \`evals/golden/cases/*.json\`.
- AAO decisions describe the record only in summary, so the officer works from a reconstruction of the evidence, not the original exhibits.
- The AAO often stops after the first dispositive ground, so objections that do not match a gold ground are not necessarily wrong. The matched-prediction rate is a lower bound on precision.
- The drafter (an 8B local model) still adds evaluative phrases ("indicating high selectivity", "confirming its status as a major media publication") that the evidence does not state. These sentences carry citations and reach the attorney review screen, but are not yet flagged there automatically.
- Demo applicants are fictional and few (3), so reliability numbers describe this pipeline on these profiles, not a population.
`;
  await fs.writeFile('EVALS.md', md);
  console.log('Wrote evals/reports/summary.json and EVALS.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
