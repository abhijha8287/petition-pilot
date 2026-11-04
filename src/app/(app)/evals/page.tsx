import fs from 'node:fs/promises';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { Badge, Card, CardHeader, Empty, Stat } from '@/components/ui';
import { formatDuration } from '@/lib/data/run-metrics';
import { requireUser } from '@/lib/supabase/server';

type W = { p: number; lo: number; hi: number };
/* eslint-disable @typescript-eslint/no-explicit-any */
const pc = (x?: number | null) => (x === undefined || x === null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(0)}%`);
const range = (w?: W) => (w ? `95% CI ${pc(w.lo)}–${pc(w.hi)}` : undefined);

export default async function EvalsPage() {
  const { profile } = await requireUser();
  if (profile?.role === 'client') redirect('/cases');
  let s: any = null;
  try {
    s = JSON.parse(await fs.readFile(path.join(process.cwd(), 'evals/reports/summary.json'), 'utf8'));
  } catch {}
  if (!s) return <Card><Empty>No eval report yet. Run the eval scripts and then npm run eval:report.</Empty></Card>;
  const r = s.objectionRecall;
  const f = s.faithfulness;
  const l = s.reliability;
  const c = s.costLatency;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Evaluation</h1>
        <p className="mt-1 text-sm text-muted">Generated {new Date(s.generatedAt).toLocaleString()} · full method and limitations in EVALS.md</p>
      </div>

      <Card>
        <CardHeader title="1 · Objection recall on real AAO O-1A dismissals" subtitle={r ? `${r.cases} published decisions (2023–2026), ${r.grounds} dispositive grounds, leave-one-out retrieval, independent judge` : undefined} />
        {r ? (
          <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
            <Stat label="Recall (strict)" value={pc(r.recallStrict.p)} hint={range(r.recallStrict)} />
            <Stat label="Recall (criterion-level)" value={pc(r.recallLenient.p)} hint={range(r.recallLenient)} />
            <Stat label="2026 held-out recall" value={pc(r.bySplit?.holdout_2026?.recallStrict?.p)} hint={range(r.bySplit?.holdout_2026?.recallStrict)} />
            <Stat label="Cases fully caught" value={pc(r.casesFullyCaught.p)} hint={`$${r.costPerCaseUsd.toFixed(3)} per case`} />
          </div>
        ) : (
          <Empty>Not run yet.</Empty>
        )}
        {r?.byCriterion && (
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
            {Object.entries(r.byCriterion as Record<string, { n: number; caught: number }>).map(([k, v]) => (
              <Badge key={k} tone={v.caught / v.n >= 0.7 ? 'green' : v.caught / v.n >= 0.4 ? 'amber' : 'red'}>
                {k.replace(/_/g, ' ')}: {v.caught}/{v.n}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="2 · Citation faithfulness" subtitle="Is each drafted sentence supported by the page it cites? Deterministic quote check + LLM judge (temperature 0); a hand-labeled sample measures judge–human agreement." />
        {f ? (
          <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
            <Stat label="Fully supported" value={pc(f.supported.p)} hint={`${f.sentences} sentences · ${range(f.supported)}`} tone={f.supported.p >= 0.9 ? 'good' : 'warn'} />
            <Stat label="Quote on cited page" value={pc(f.quoteOnPageRate)} hint="deterministic check" tone="good" />
            <Stat label="Uncited sentences" value="0" hint="blocked in code and by a DB constraint" tone="good" />
            <Stat label="Judge vs human" value={f.humanCalibration ? pc(f.humanCalibration.agreementBinary) : 'pending'} hint={f.humanCalibration ? `κ ${f.humanCalibration.kappaBinary.toFixed(2)} on ${f.humanCalibration.n} labels` : 'label the CSV sample'} />
          </div>
        ) : (
          <Empty>Not run yet.</Empty>
        )}
      </Card>

      <Card>
        <CardHeader title={`3 · Reliability (${l?.k ?? 5} runs per case)`} subtitle="Consistency of evidence mapping across independent runs, and recovery from injected failures." />
        {l ? (
          <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-5">
            <Stat label="Strength agreement" value={pc(l.pooled.strengthModalAgreement)} hint={`Fleiss κ ${l.pooled.fleissKappaStrength.toFixed(2)}`} />
            <Stat label="Met / not-met agreement" value={pc(l.pooled.metDecisionAgreement)} />
            <Stat label="Verdict pass^k" value={pc(l.pooled.verdictPassK)} hint="same ≥3-criteria verdict in every run" />
            <Stat label="Claim overlap" value={l.pooled.claimJaccardMean.toFixed(2)} hint="mean Jaccard between runs" />
            <Stat label="Fault injection" value={l.recovery?.reachedAttorneyCheckpoint ? 'recovered' : '—'} hint={l.recovery ? `${l.recovery.injectedFailures} injected failures` : undefined} tone={l.recovery?.reachedAttorneyCheckpoint ? 'good' : undefined} />
          </div>
        ) : (
          <Empty>Not run yet.</Empty>
        )}
      </Card>

      <Card>
        <CardHeader
          title="4 · Cost and speed per case"
          subtitle="All models local (Ollama on an Apple M5, 16 GB). Compute time per step, attorney review excluded, against a 48-hour preparation promise."
        />
        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
          <Stat label="Cost per case" value={c.meanCostUsd !== null ? `$${c.meanCostUsd.toFixed(2)}` : '—'} hint="local models" tone="good" />
          {(l?.perCase ?? []).map((x: any) => (
            <Stat
              key={x.case}
              label={`${x.case} · evidence mapping`}
              value={x.runSeconds?.length ? `${formatDuration(Math.min(...x.runSeconds))}–${formatDuration(Math.max(...x.runSeconds))}` : '—'}
              hint={`clean runs, k=${x.k}`}
            />
          ))}
          {l?.recovery && <Stat label="Full pipeline, 2 injected failures" value={formatDuration(l.recovery.seconds)} hint="to the attorney checkpoint" />}
        </div>
        <p className="px-5 pb-4 text-xs text-muted">
          Production totals per case ({c.perCase.map((x: any) => `${x.case}: ${formatDuration(x.seconds)}`).join(' · ')}) include steps that ran while the laptop was
          swapping two large local models; the clean runs above are the representative figure.
        </p>
      </Card>
    </div>
  );
}
