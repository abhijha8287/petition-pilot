import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { countLikelyMet, type Strength } from '@/lib/o1a/criteria';
import { activeSeconds } from '@/lib/data/run-metrics';

type DB = Awaited<ReturnType<typeof createClient>>;

/** All reads go through the caller's session: RLS decides what each role can see. */
export async function listCases(db: DB) {
  const { data: cases } = await db.from('cases').select('*').order('created_at', { ascending: true });
  const runIds = (cases ?? []).map((c) => c.active_run_id).filter((x): x is string => !!x);
  const [{ data: assessments }, { data: objections }, { data: events }] = await Promise.all([
    runIds.length ? db.from('criterion_assessments').select('run_id,strength').in('run_id', runIds) : Promise.resolve({ data: [] }),
    runIds.length ? db.from('objections').select('run_id,severity,status').in('run_id', runIds) : Promise.resolve({ data: [] }),
    runIds.length ? db.from('agent_events').select('run_id,cost_usd').in('run_id', runIds).eq('kind', 'llm_call') : Promise.resolve({ data: [] }),
  ]);
  return (cases ?? []).map((c) => {
    const a = (assessments ?? []).filter((x) => x.run_id === c.active_run_id) as { strength: Strength }[];
    const o = (objections ?? []).filter((x) => x.run_id === c.active_run_id);
    const runEvents = (events ?? []).filter((x) => x.run_id === c.active_run_id);
    const cost = runEvents.reduce((s, e) => s + Number(e.cost_usd ?? 0), 0);
    return {
      ...c,
      likelyMet: a.length ? countLikelyMet(a) : null,
      highObjections: o.filter((x) => x.severity === 'high' && x.status === 'open').length,
      objections: o.length,
      costUsd: cost,
      modelCalls: runEvents.length,
    };
  });
}

export async function getCase(db: DB, id: string) {
  const { data } = await db.from('cases').select('*').eq('id', id).maybeSingle();
  return data;
}

export async function getCaseBundle(db: DB, id: string) {
  const c = await getCase(db, id);
  if (!c) return null;
  const runId = c.active_run_id;
  const [exhibits, run, assessments, claims, gaps, questions, objections, events, signoff] = await Promise.all([
    db.from('exhibits').select('*').eq('case_id', id).order('label'),
    runId ? db.from('pipeline_runs').select('*').eq('id', runId).maybeSingle() : Promise.resolve({ data: null }),
    runId ? db.from('criterion_assessments').select('*').eq('run_id', runId) : Promise.resolve({ data: [] }),
    runId ? db.from('claims').select('*').eq('run_id', runId).eq('quote_verified', true) : Promise.resolve({ data: [] }),
    runId ? db.from('gaps').select('*').eq('run_id', runId) : Promise.resolve({ data: [] }),
    runId ? db.from('follow_up_questions').select('*').eq('run_id', runId) : Promise.resolve({ data: [] }),
    runId ? db.from('objections').select('*').eq('run_id', runId) : Promise.resolve({ data: [] }),
    runId ? db.from('agent_events').select('*').eq('run_id', runId).order('id') : Promise.resolve({ data: [] }),
    runId ? db.from('signoffs').select('*').eq('run_id', runId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    case: c,
    exhibits: exhibits.data ?? [],
    run: run.data,
    assessments: assessments.data ?? [],
    claims: claims.data ?? [],
    gaps: gaps.data ?? [],
    questions: questions.data ?? [],
    objections: objections.data ?? [],
    events: events.data ?? [],
    signoff: signoff.data,
  };
}

export type CaseBundle = NonNullable<Awaited<ReturnType<typeof getCaseBundle>>>;

export function runMetrics(events: CaseBundle['events']) {
  const llm = events.filter((e) => e.kind === 'llm_call');
  const first = events[0]?.created_at;
  const lastWork = [...events].reverse().find((e) => e.step !== 'attorney_review')?.created_at;
  return {
    llmCalls: llm.length,
    costUsd: llm.reduce((s, e) => s + Number(e.cost_usd ?? 0), 0),
    inputTokens: llm.reduce((s, e) => s + (e.input_tokens ?? 0), 0),
    outputTokens: llm.reduce((s, e) => s + (e.output_tokens ?? 0), 0),
    wallSeconds: first && lastWork ? (new Date(lastWork).getTime() - new Date(first).getTime()) / 1000 : 0,
    activeSeconds: activeSeconds(events),
    retries: events.filter((e) => e.kind === 'error').length,
    reusedSteps: events.filter((e) => e.kind === 'step_skipped').length,
  };
}
