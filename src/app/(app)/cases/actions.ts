'use server';

import crypto from 'node:crypto';
import { after } from 'next/server';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createPipelineRun, executePipelineRun, resumeAfterSignoff } from '@/mastra/pipeline/control';
import { requireUser } from '@/lib/supabase/server';
import type { JsonValue } from '@/lib/supabase/json';

/**
 * Every action re-checks the role on the server and then acts through the
 * user's own Supabase session, so RLS and the database triggers (versioning,
 * sign-off lock, sign-off rules) apply. The service role is used only to run
 * the agent pipeline after the permission check has passed.
 */

type Result = { ok: true } | { ok: false; error: string };

async function staffOnly() {
  const ctx = await requireUser();
  if (!ctx.profile || ctx.profile.role === 'client') throw new Error('Only firm staff can do this.');
  return ctx;
}

async function audit(db: Awaited<ReturnType<typeof requireUser>>['supabase'], caseId: string, action: string, detail: Record<string, unknown> = {}) {
  await db.from('audit_log').insert({ case_id: caseId, action, detail: detail as JsonValue });
}

export async function startRun(caseId: string): Promise<Result> {
  const { supabase } = await staffOnly();
  const { data: c } = await supabase.from('cases').select('id,status').eq('id', caseId).single();
  if (!c) return { ok: false, error: 'Case not found.' };
  if (c.status === 'processing') return { ok: false, error: 'Agents are already working on this case.' };
  if (c.status === 'signed_off') return { ok: false, error: 'This case is signed off. Open a new case version to re-run.' };
  const runId = await createPipelineRun(caseId, { trigger: 'ui' });
  await audit(supabase, caseId, 'pipeline.started', { runId });
  // Respond immediately; the durable workflow keeps running after the response.
  after(() => executePipelineRun(caseId, runId).catch((e) => console.error('[pipeline]', e)));
  refresh();
  return { ok: true };
}

export async function resumeRun(caseId: string, runId: string): Promise<Result> {
  const { supabase } = await staffOnly();
  const { data: run } = await supabase.from('pipeline_runs').select('status').eq('id', runId).single();
  if (run?.status !== 'failed') return { ok: false, error: 'Only failed runs can be resumed.' };
  await supabase.from('audit_log').insert({ case_id: caseId, action: 'pipeline.resumed', detail: { runId } });
  after(() => executePipelineRun(caseId, runId).catch((e) => console.error('[pipeline]', e)));
  refresh();
  return { ok: true };
}

const Sentence = z.object({
  text: z.string().trim().min(1),
  citations: z.array(z.object({ claimId: z.string(), exhibitLabel: z.string(), page: z.number(), quote: z.string() })).min(1),
});

export async function reviewParagraph(input: {
  paragraphId: string;
  status: 'accepted' | 'edited' | 'rejected' | 'pending';
  sentences?: unknown;
  note?: string;
}): Promise<Result> {
  const { supabase } = await staffOnly();
  const patch: { status: typeof input.status; review_note: string | null; sentences?: JsonValue } = {
    status: input.status,
    review_note: input.note?.trim() || null,
  };
  if (input.status === 'edited') {
    const parsed = z.array(Sentence).min(1).safeParse(input.sentences);
    if (!parsed.success) return { ok: false, error: 'Every sentence must keep at least one citation. Remove the sentence instead of its sources.' };
    patch.sentences = parsed.data as unknown as JsonValue;
  }
  const { data, error } = await supabase.from('paragraphs').update(patch).eq('id', input.paragraphId).select('case_id').single();
  if (error) return { ok: false, error: error.message.includes('signed off') ? 'The draft is locked after sign-off.' : error.message };
  await audit(supabase, data.case_id, `paragraph.${input.status}`, { paragraphId: input.paragraphId });
  refresh();
  return { ok: true };
}

export async function signOff(caseId: string, runId: string, note: string): Promise<Result> {
  const { supabase, profile } = await requireUser();
  if (profile?.role !== 'attorney') return { ok: false, error: 'Only a licensed attorney can sign off.' };
  // The insert policy itself enforces: attorney role, own identity, and no pending paragraphs.
  const { data, error } = await supabase
    .from('signoffs')
    .insert({ case_id: caseId, run_id: runId, note: note.trim() || null })
    .select('id')
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message.includes('row-level security') ? 'Resolve every paragraph (accept, edit or reject) before signing.' : (error?.message ?? 'Sign-off failed.') };
  }
  await audit(supabase, caseId, 'case.signed_off', { runId, signoffId: data.id });
  after(() => resumeAfterSignoff(runId, data.id).catch((e) => console.error('[pipeline resume]', e)));
  refresh();
  return { ok: true };
}

export async function answerQuestion(questionId: string, answer: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const { error } = await supabase
    .from('follow_up_questions')
    .update({ answer: answer.trim(), status: 'answered', answered_by: user.id, answered_at: new Date().toISOString() })
    .eq('id', questionId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function triageObjection(objectionId: string, status: 'open' | 'addressed' | 'dismissed'): Promise<Result> {
  const { supabase } = await staffOnly();
  const { error } = await supabase.from('objections').update({ status }).eq('id', objectionId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function uploadExhibit(caseId: string, form: FormData): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const file = form.get('file');
  const title = String(form.get('title') ?? '').trim();
  if (!(file instanceof File) || file.type !== 'application/pdf') return { ok: false, error: 'Upload a PDF.' };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: 'PDF is larger than 25 MB.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const { data: existing } = await supabase.from('exhibits').select('label').eq('case_id', caseId);
  const used = new Set((existing ?? []).map((e) => e.label));
  const label = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).find((l) => !used.has(l));
  if (!label) return { ok: false, error: 'This demo supports up to 26 exhibits per case.' };
  const path = `${caseId}/${label}-${sha256.slice(0, 12)}.pdf`;
  const up = await supabase.storage.from('exhibits').upload(path, bytes, { contentType: 'application/pdf' });
  if (up.error) return { ok: false, error: up.error.message };
  const { error } = await supabase.from('exhibits').insert({
    case_id: caseId,
    label,
    title: title || file.name.replace(/\.pdf$/i, ''),
    storage_path: path,
    sha256,
    uploaded_by: user.id,
  });
  if (error) return { ok: false, error: error.code === '23505' ? 'This exact file is already an exhibit.' : error.message };
  await audit(supabase, caseId, 'exhibit.uploaded', { label, sha256 });
  refresh();
  return { ok: true };
}

const NewCase = z.object({
  beneficiary_name: z.string().trim().min(2),
  field: z.string().trim().min(2),
  petitioner: z.string().trim().min(2),
  proposed_role: z.string().trim().min(2),
});

export async function createCase(_prev: { error?: string } | undefined, form: FormData) {
  const { supabase, user } = await staffOnly();
  const parsed = NewCase.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'All fields are required.' };
  const { data, error } = await supabase
    .from('cases')
    .insert({ ...parsed.data, title: `O-1A · ${parsed.data.beneficiary_name}`, created_by: user!.id, attorney_id: null })
    .select('id')
    .single();
  if (error) return { error: error.message };
  redirect(`/cases/${data.id}`);
}
