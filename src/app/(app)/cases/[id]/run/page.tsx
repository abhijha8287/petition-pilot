import { formatDuration } from '@/lib/data/run-metrics';
import { redirect } from 'next/navigation';
import { Badge, Card, CardHeader, Empty, Stat } from '@/components/ui';
import { runMetrics } from '@/lib/data/cases';
import { requireUser } from '@/lib/supabase/server';

const STEPS = ['ingest', 'extract_claims', 'map_criteria', 'gaps', 'draft', 'objections', 'attorney_review'];
const kindTone = { step_start: 'slate', step_end: 'green', step_skipped: 'violet', llm_call: 'blue', retry: 'amber', error: 'red', checkpoint: 'violet', info: 'slate' } as const;

export default async function RunPage({ params }: PageProps<'/cases/[id]/run'>) {
  const { id } = await params;
  const { supabase, profile } = await requireUser();
  if (profile?.role === 'client') redirect(`/cases/${id}`);
  const { data: runs } = await supabase.from('pipeline_runs').select('*').eq('case_id', id).order('started_at', { ascending: false });
  const run = runs?.[0];
  if (!run) return <Card><Empty>No agent runs yet.</Empty></Card>;
  const [{ data: events }, { data: checkpoints }] = await Promise.all([
    supabase.from('agent_events').select('*').eq('run_id', run.id).order('id'),
    supabase.from('step_checkpoints').select('step,completed_at').eq('run_id', run.id),
  ]);
  const m = runMetrics(events ?? []);
  const done = new Set((checkpoints ?? []).map((c) => c.step));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Run status" value={<span className="text-lg">{run.status}</span>} hint={run.error ?? undefined} tone={run.status === 'failed' ? 'bad' : run.status === 'succeeded' ? 'good' : undefined} />
        <Stat label="Model calls" value={m.llmCalls} />
        <Stat label="Tokens in / out" value={<span className="text-lg">{(m.inputTokens / 1000).toFixed(1)}k / {(m.outputTokens / 1000).toFixed(1)}k</span>} />
        <Stat label="Cost" value={`$${m.costUsd.toFixed(3)}`} />
        <Stat label="Agent compute time" value={formatDuration(m.activeSeconds)} hint={`${formatDuration(m.wallSeconds)} wall clock incl. waits · vs. a 48-hour promise`} />
        <Stat label="Recovered" value={m.retries} hint={`${m.reusedSteps} step(s) reused from checkpoint`} tone={m.retries ? 'warn' : undefined} />
      </div>

      <Card>
        <CardHeader title="Durable pipeline" subtitle="Each step commits a checkpoint. A retried or resumed run reuses committed steps instead of calling models again." />
        <ol className="flex flex-wrap gap-2 px-5 py-4">
          {STEPS.map((s, i) => {
            const state = done.has(s) ? 'done' : run.current_step === s ? (run.status === 'failed' ? 'failed' : run.status === 'suspended' ? 'waiting' : 'running') : 'todo';
            return (
              <li key={s} className="flex items-center gap-2">
                <span
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                    state === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : state === 'running' ? 'animate-pulse border-blue-200 bg-blue-50 text-blue-800' : state === 'failed' ? 'border-red-200 bg-red-50 text-red-800' : state === 'waiting' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-line text-muted'
                  }`}
                >
                  {s.replace('_', ' ')}
                  {state === 'waiting' && ' · human'}
                </span>
                {i < STEPS.length - 1 && <span className="text-slate-300">→</span>}
              </li>
            );
          })}
        </ol>
      </Card>

      <Card>
        <CardHeader title="Event log" subtitle={`Run ${run.id.slice(0, 8)} · workflow ${run.workflow_run_id?.slice(0, 8) ?? '—'} · started ${new Date(run.started_at).toLocaleString()}`} />
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="px-5 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Step</th>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 text-right font-medium">Tokens</th>
              <th className="px-3 py-2 text-right font-medium">Latency</th>
              <th className="px-5 py-2 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {(events ?? []).map((e) => (
              <tr key={e.id} className="border-b border-line last:border-0">
                <td className="px-5 py-1.5 font-mono text-xs text-muted">{new Date(e.created_at).toLocaleTimeString()}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{e.step}</td>
                <td className="px-3 py-1.5">
                  <Badge tone={kindTone[e.kind as keyof typeof kindTone]}>{e.kind.replace('_', ' ')}</Badge>
                </td>
                <td className="px-3 py-1.5 text-xs">
                  {e.message}
                  {e.model && <span className="ml-1 font-mono text-muted">({e.model})</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-muted">{e.input_tokens ? `${e.input_tokens}/${e.output_tokens}` : ''}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-muted">{e.latency_ms ? `${(e.latency_ms / 1000).toFixed(1)}s` : ''}</td>
                <td className="px-5 py-1.5 text-right font-mono text-xs tabular-nums text-muted">{e.cost_usd ? `$${Number(e.cost_usd).toFixed(4)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
