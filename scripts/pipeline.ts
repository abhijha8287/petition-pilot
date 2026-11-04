/**
 * Pipeline CLI.
 *
 *   npm run pipeline -- run <persona|caseId>          run the agents for a case (stops at attorney review)
 *   npm run pipeline -- resume <runId>                resume a failed or interrupted run from its checkpoints
 *   npm run pipeline -- redo-from <runId> <step>      discard <step> and every later checkpoint, then resume
 *   npm run pipeline -- crash-demo <persona|caseId>   kill -9 the worker mid-run, then resume in a new process
 *
 * persona = raman | alvarez | okafor
 */
import { spawn } from 'node:child_process';
import { adminClient } from '../src/lib/supabase/admin';
import { createPipelineRun, executePipelineRun } from '../src/mastra/pipeline/control';
import { objectionCheck } from '../src/mastra/pipeline/stages';
import { checkpointed } from '../src/mastra/runtime';
import { PERSONAS } from './fixtures/personas';

const db = adminClient();

async function resolveCase(arg: string) {
  const persona = PERSONAS.find((p) => p.key === arg);
  const q = persona ? db.from('cases').select('id,title').eq('title', `O-1A · ${persona.beneficiary}`) : db.from('cases').select('id,title').eq('id', arg);
  const { data } = await q.single();
  if (!data) throw new Error(`No case for "${arg}". Run npm run seed first.`);
  return data;
}

async function summarize(runId: string) {
  const { data: run } = await db.from('pipeline_runs').select('status,error').eq('id', runId).single();
  const { data: ev } = await db.from('agent_events').select('kind,cost_usd,created_at').eq('run_id', runId).order('id');
  const cost = (ev ?? []).filter((e) => e.kind === 'llm_call').reduce((s, e) => s + Number(e.cost_usd ?? 0), 0);
  const secs = ev?.length ? (new Date(ev.at(-1)!.created_at).getTime() - new Date(ev[0].created_at).getTime()) / 1000 : 0;
  const { data: a } = await db.from('criterion_assessments').select('criterion,strength').eq('run_id', runId);
  console.log(`\nrun ${runId}: ${run?.status}${run?.error ? ` (${run.error})` : ''}`);
  console.log(`  cost $${cost.toFixed(3)} · ${secs.toFixed(0)}s · ${(ev ?? []).filter((e) => e.kind === 'llm_call').length} model calls · ${(ev ?? []).filter((e) => e.kind === 'step_skipped').length} steps reused`);
  if (a?.length) console.log(`  criteria: ${a.map((x) => `${x.criterion}=${x.strength}`).join(', ')}`);
}

async function waitForCheckpoint(runId: string, step: string, timeoutMs = 600_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { data } = await db.from('step_checkpoints').select('step').eq('run_id', runId).eq('step', step).maybeSingle();
    if (data) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${step}`);
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'run') {
  const c = await resolveCase(arg);
  const runId = await createPipelineRun(c.id, { trigger: 'cli' });
  console.log(`${c.title}: run ${runId}`);
  const res = await executePipelineRun(c.id, runId);
  console.log(`workflow status: ${res.status}`);
  await summarize(runId);
} else if (cmd === 'resume' || cmd === '__worker') {
  const { data: run } = await db.from('pipeline_runs').select('case_id').eq('id', arg).single();
  if (!run) throw new Error('run not found');
  const res = await executePipelineRun(run.case_id, arg);
  if (cmd === 'resume') {
    console.log(`workflow status: ${res.status}`);
    await summarize(arg);
  }
} else if (cmd === 'redo-objections') {
  // Re-run only the officer review for a run (e.g. after improving the officer).
  const { data: run } = await db.from('pipeline_runs').select('case_id').eq('id', arg).single();
  if (!run) throw new Error('run not found');
  await db.from('step_checkpoints').delete().eq('run_id', arg).eq('step', 'objections');
  const ctx = { caseId: run.case_id, runId: arg };
  const out = await checkpointed(ctx, 'objections', () => objectionCheck(ctx));
  // The run is still waiting at the attorney checkpoint.
  await db.from('pipeline_runs').update({ status: 'suspended', current_step: 'attorney_review' }).eq('id', arg);
  console.log(out);
} else if (cmd === 'redo-from') {
  // Re-run a run from one step onward (e.g. after improving the drafter), keeping earlier work.
  const step = process.argv[4];
  const order = ['ingest', 'extract_claims', 'map_criteria', 'gaps', 'draft', 'objections'];
  if (!order.includes(step)) throw new Error(`step must be one of ${order.join(', ')}`);
  const { data: run } = await db.from('pipeline_runs').select('case_id').eq('id', arg).single();
  if (!run) throw new Error('run not found');
  const { count } = await db.from('signoffs').select('id', { count: 'exact', head: true }).eq('run_id', arg);
  if (count) throw new Error('run is signed off; start a new run instead');
  await db.from('step_checkpoints').delete().eq('run_id', arg).in('step', order.slice(order.indexOf(step)));
  await db.from('pipeline_runs').update({ status: 'running', error: null }).eq('id', arg);
  const res = await executePipelineRun(run.case_id, arg);
  console.log(`workflow status: ${res.status}`);
  await summarize(arg);
} else if (cmd === 'crash-demo') {
  const c = await resolveCase(arg);
  const runId = await createPipelineRun(c.id, { trigger: 'crash-demo' });
  console.log(`${c.title}: run ${runId}\n1) starting worker process`);
  const worker = spawn('npx', ['tsx', '--env-file=.env.local', 'scripts/pipeline.ts', '__worker', runId], { stdio: 'ignore', detached: true });
  await waitForCheckpoint(runId, 'map_criteria');
  process.kill(-worker.pid!, 'SIGKILL');
  console.log('2) map_criteria committed; worker killed with SIGKILL mid-run');
  await db.from('pipeline_runs').update({ status: 'failed', error: 'worker killed (crash demo)' }).eq('id', runId);
  const { data: before } = await db.from('step_checkpoints').select('step').eq('run_id', runId);
  console.log(`   committed before crash: ${(before ?? []).map((s) => s.step).join(', ')}`);
  console.log('3) resuming in a fresh process');
  const res = await executePipelineRun(c.id, runId);
  console.log(`   workflow status: ${res.status}`);
  await summarize(runId);
} else {
  console.log('usage: pipeline run|resume|redo-from|redo-objections|crash-demo <arg>');
  process.exit(1);
}
process.exit(0);
