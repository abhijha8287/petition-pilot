import { adminClient } from '@/lib/supabase/admin';
import { mastra } from '../index';

/** Create a pipeline run row and start the durable workflow. Returns immediately after the run is created. */
export async function createPipelineRun(caseId: string, config: Record<string, unknown> = {}) {
  const db = adminClient();
  const { data: run, error } = await db.from('pipeline_runs').insert({ case_id: caseId, config: config as never }).select('id').single();
  if (error || !run) throw new Error(`could not create run: ${error?.message}`);
  await db.from('cases').update({ status: 'processing', active_run_id: run.id, updated_at: new Date().toISOString() }).eq('id', caseId);
  return run.id;
}

/** Execute (or re-execute) the workflow for an existing pipeline run until it completes or suspends. */
export async function executePipelineRun(caseId: string, runId: string) {
  const workflow = mastra.getWorkflow('casePipeline');
  const wfRun = await workflow.createRun();
  await adminClient().from('pipeline_runs').update({ workflow_run_id: wfRun.runId, status: 'running', error: null }).eq('id', runId);
  return wfRun.start({ inputData: { caseId, runId } });
}

/**
 * Resume after a crash: a fresh workflow run over the same pipeline run.
 * Committed stage checkpoints are reused, so only unfinished work re-executes.
 */
export const resumePipelineRun = executePipelineRun;

/** Resume the suspended attorney-review step after a sign-off was recorded. */
export async function resumeAfterSignoff(runId: string, signoffId: string) {
  const { data: run } = await adminClient().from('pipeline_runs').select('workflow_run_id').eq('id', runId).single();
  if (!run?.workflow_run_id) throw new Error('run has no workflow id');
  const workflow = mastra.getWorkflow('casePipeline');
  const wfRun = await workflow.createRun({ runId: run.workflow_run_id });
  return wfRun.resume({ step: 'attorney_review', resumeData: { signoffId } });
}
