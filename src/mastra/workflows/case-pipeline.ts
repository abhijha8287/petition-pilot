import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { checkpointed, logEvent, type RunCtx } from '../runtime';
import { analyzeGaps, draftPetition, extractClaims, ingest, mapCriteria, objectionCheck } from '../pipeline/stages';

/**
 * The case pipeline as a durable Mastra workflow.
 *
 *   ingest → extract_claims → map_criteria → gaps → draft → objections → attorney_review (suspend)
 *
 * Durability comes from two layers:
 *  - Mastra persists a workflow snapshot to Postgres, so the attorney-review
 *    suspension survives restarts and deploys and is resumed by sign-off.
 *  - Each stage commits a checkpoint row (see runtime.checkpointed). A step
 *    that is retried, or a run that is restarted after a crash, reuses
 *    committed outputs instead of paying for the model calls again.
 */
const Ctx = z.object({ caseId: z.string().uuid(), runId: z.string().uuid() });

function stage(id: string, fn: (ctx: RunCtx) => Promise<unknown>) {
  return createStep({
    id,
    inputSchema: Ctx,
    outputSchema: Ctx,
    retries: 2,
    execute: async ({ inputData }) => {
      await checkpointed(inputData, id, () => fn(inputData));
      return inputData;
    },
  });
}

const attorneyReview = createStep({
  id: 'attorney_review',
  inputSchema: Ctx,
  outputSchema: Ctx.extend({ signoffId: z.string().uuid() }),
  suspendSchema: z.object({ message: z.string() }),
  resumeSchema: z.object({ signoffId: z.string().uuid() }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const db = adminClient();
    if (!resumeData?.signoffId) {
      await db.from('pipeline_runs').update({ status: 'suspended', current_step: 'attorney_review' }).eq('id', inputData.runId);
      await db.from('cases').update({ status: 'needs_review', updated_at: new Date().toISOString() }).eq('id', inputData.caseId);
      await logEvent(inputData, 'attorney_review', 'checkpoint', 'Waiting for attorney review and sign-off');
      return await suspend({ message: 'Awaiting attorney sign-off' });
    }
    // Never trust the resume payload: the sign-off must exist for this run.
    const { data: signoff } = await db
      .from('signoffs')
      .select('id, attorney_id, content_sha256')
      .eq('id', resumeData.signoffId)
      .eq('run_id', inputData.runId)
      .single();
    if (!signoff) throw new Error('Sign-off not found for this run');
    await db.from('pipeline_runs').update({ status: 'succeeded', current_step: null, finished_at: new Date().toISOString() }).eq('id', inputData.runId);
    await logEvent(inputData, 'attorney_review', 'checkpoint', `Signed off by attorney (draft sha256 ${signoff.content_sha256?.slice(0, 12)}…)`);
    return { ...inputData, signoffId: signoff.id };
  },
});

export const casePipeline = createWorkflow({
  id: 'case-pipeline',
  description: 'O-1A evidence mapping, gap analysis, cited drafting, adversarial review, attorney sign-off',
  inputSchema: Ctx,
  outputSchema: Ctx.extend({ signoffId: z.string().uuid() }),
  retryConfig: { attempts: 2, delay: 1500 },
  options: {
    onError: async ({ error, getInitData }) => {
      const init = getInitData() as RunCtx;
      const db = adminClient();
      await db.from('pipeline_runs').update({ status: 'failed', error: error?.message ?? 'unknown error' }).eq('id', init.runId);
      await db.from('cases').update({ status: 'failed' }).eq('id', init.caseId);
    },
  },
})
  .then(stage('ingest', ingest))
  .then(stage('extract_claims', extractClaims))
  .then(stage('map_criteria', mapCriteria))
  .then(stage('gaps', analyzeGaps))
  .then(stage('draft', draftPetition))
  .then(stage('objections', objectionCheck))
  .then(attorneyReview)
  .commit();
