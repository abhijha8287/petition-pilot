/**
 * Eval 2: citation faithfulness of drafted petition sentences.
 *
 *   npm run eval:faithfulness
 *
 * Layer 1 (deterministic): every cited quote is re-verified on its page.
 * Layer 2 (LLM judge, a different model from the drafter): is the sentence
 *   fully supported by the cited passages? Implemented as a Mastra scorer.
 * Layer 3 (human calibration): a stratified sample is exported to
 *   evals/human/faithfulness-sample.csv. Fill in `human_label`
 *   (SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED) and re-run with --calibrate
 *   to compute judge-human agreement (Cohen's kappa).
 */
import fs from 'node:fs/promises';
import { verifyQuote, type CitedSentence } from '../src/lib/citations/verify';
import { adminClient } from '../src/lib/supabase/admin';
import { assertBudget, estTokens, recordSpend } from '../src/lib/ai/budget';
import { MODELS, costUsd } from '../src/lib/ai/models';
import { mapLimit } from '../src/mastra/runtime';
import { faithfulnessScorer } from './lib/judges';
import { cohensKappa, wilson } from './lib/stats';

const SAMPLE = 'evals/human/faithfulness-sample.csv';
const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function calibrate() {
  const rows = parseCsv(await fs.readFile(SAMPLE, 'utf8'));
  const [head, ...body] = rows;
  const j = head.indexOf('judge_label');
  const h = head.indexOf('human_label');
  const labeled = body.filter((r) => r[h]?.trim());
  if (!labeled.length) return null;
  const judge = labeled.map((r) => r[j].trim());
  const human = labeled.map((r) => r[h].trim().toUpperCase());
  const bin = (x: string) => (x === 'SUPPORTED' ? 'pass' : 'fail');
  return {
    n: labeled.length,
    agreementBinary: judge.filter((x, i) => bin(x) === bin(human[i])).length / labeled.length,
    kappaBinary: cohensKappa(judge.map(bin), human.map(bin)),
    kappa3way: cohensKappa(judge, human),
    humanSupportedRate: human.filter((x) => x === 'SUPPORTED').length / labeled.length,
  };
}

async function main() {
  if (process.argv.includes('--calibrate')) {
    const prev = JSON.parse(await fs.readFile('evals/reports/faithfulness.json', 'utf8'));
    prev.humanCalibration = await calibrate();
    await fs.writeFile('evals/reports/faithfulness.json', JSON.stringify(prev, null, 2));
    console.log(prev.humanCalibration ?? 'No human labels found in the sample CSV yet.');
    return;
  }

  const db = adminClient();
  const { data: cases } = await db.from('cases').select('id,beneficiary_name,active_run_id').not('active_run_id', 'is', null);
  const items: { caseName: string; paragraphId: string; sentence: CitedSentence; pages: Map<string, string>; titles: Map<string, string> }[] = [];
  for (const c of cases ?? []) {
    const [{ data: secs }, { data: ex }, { data: pages }] = await Promise.all([
      db.from('draft_sections').select('id').eq('run_id', c.active_run_id!),
      db.from('exhibits').select('id,label,title').eq('case_id', c.id),
      db.from('exhibit_pages').select('exhibit_id,page_no,content').eq('case_id', c.id),
    ]);
    const label = new Map((ex ?? []).map((e) => [e.id, e.label]));
    const titleOf = new Map((ex ?? []).map((e) => [e.label, e.title]));
    const pageMap = new Map((pages ?? []).map((p) => [`${label.get(p.exhibit_id)}:${p.page_no}`, p.content]));
    const { data: paras } = await db.from('paragraphs').select('id,sentences').in('section_id', (secs ?? []).map((s) => s.id));
    for (const p of paras ?? []) for (const s of p.sentences as unknown as CitedSentence[]) items.push({ caseName: c.beneficiary_name, paragraphId: p.id, sentence: s, pages: pageMap, titles: titleOf });
  }
  if (!items.length) throw new Error('No drafted sentences. Run the pipeline for the demo cases first.');

  const results = await mapLimit(items, 6, async (it) => {
    const quoteOk = it.sentence.citations.every((c) => verifyQuote(c.quote, it.pages.get(`${c.exhibitLabel}:${c.page}`) ?? '').verified);
    // The Mastra scorer does not expose token usage, so meter it with a conservative estimate.
    const promptTokens = estTokens(it.sentence.text + it.sentence.citations.map((c) => c.quote).join(' ')) + 400;
    const estimate = costUsd(MODELS.judge, { inputTokens: promptTokens * 3, outputTokens: 600 });
    assertBudget(estimate);
    const r = await faithfulnessScorer.run({ input: { sentence: it.sentence.text, passages: it.sentence.citations.map((c) => c.quote), beneficiary: it.caseName, sources: it.sentence.citations.map((c) => `Ex. ${c.exhibitLabel}, ${it.titles.get(c.exhibitLabel) ?? 'exhibit'}, p.${c.page}`) }, output: '' });
    recordSpend(estimate, { model: MODELS.judge, label: 'faithfulness-scorer (estimated)' });
    const a = r.analyzeStepResult as { label: string; unsupportedClaims: string[]; reason: string };
    return { case: it.caseName, sentence: it.sentence.text, citations: it.sentence.citations.map((c) => `Ex. ${c.exhibitLabel} p.${c.page}`), quotes: it.sentence.citations.map((c) => c.quote), quoteOnPage: quoteOk, label: a.label, unsupported: a.unsupportedClaims, reason: a.reason };
  });

  const n = results.length;
  const supported = results.filter((r) => r.label === 'SUPPORTED').length;
  const partial = results.filter((r) => r.label === 'PARTIALLY_SUPPORTED').length;
  const byCase = Object.fromEntries(
    [...new Set(results.map((r) => r.case))].map((c) => {
      const rows = results.filter((r) => r.case === c);
      return [c, { sentences: rows.length, supportedRate: rows.filter((r) => r.label === 'SUPPORTED').length / rows.length }];
    }),
  );

  // Stratified human-review sample: every non-supported sentence + random supported ones, up to 40.
  const flagged = results.filter((r) => r.label !== 'SUPPORTED');
  const ok = results.filter((r) => r.label === 'SUPPORTED').sort(() => Math.random() - 0.5);
  const sample = [...flagged, ...ok].slice(0, Math.max(40, flagged.length));
  await fs.mkdir('evals/human', { recursive: true });
  let keepHuman = new Map<string, string>();
  try {
    const old = parseCsv(await fs.readFile(SAMPLE, 'utf8'));
    const si = old[0].indexOf('sentence');
    const hi = old[0].indexOf('human_label');
    keepHuman = new Map(old.slice(1).filter((r) => r[hi]).map((r) => [r[si], r[hi]]));
  } catch {}
  await fs.writeFile(
    SAMPLE,
    ['case,sentence,citations,quotes,judge_label,judge_reason,human_label', ...sample.map((r) => [r.case, r.sentence, r.citations.join('; '), r.quotes.join(' || '), r.label, r.reason, keepHuman.get(r.sentence) ?? ''].map(csvCell).join(','))].join('\n') + '\n',
  );

  const report = {
    eval: 'citation-faithfulness',
    generatedAt: new Date().toISOString(),
    judgeModel: MODELS.judge,
    sentences: n,
    quoteOnPageRate: results.filter((r) => r.quoteOnPage).length / n,
    uncitedSentences: 0,
    supported: wilson(supported, n),
    partiallySupported: partial / n,
    unsupported: (n - supported - partial) / n,
    byCase,
    humanCalibration: await calibrate().catch(() => null),
    failures: flagged.map((r) => ({ case: r.case, sentence: r.sentence, label: r.label, unsupported: r.unsupported, reason: r.reason })),
  };
  await fs.writeFile('evals/reports/faithfulness.json', JSON.stringify(report, null, 2));
  console.log(`Faithfulness: ${(report.supported.p * 100).toFixed(1)}% fully supported (${supported}/${n}); quote-on-page ${(report.quoteOnPageRate * 100).toFixed(1)}%`);
  console.log(`Human-review sample written to ${SAMPLE} (${sample.length} rows)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
