/**
 * Permission model tests against the local Supabase stack (RLS + triggers).
 * Requires `npm run db:start` and `npm run seed`.
 */
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/lib/supabase/types';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient<Database>(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function as(email: string) {
  const c = createClient<Database>(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: 'exhibit-a-demo' });
  if (error) throw error;
  return c;
}

const sentence = (t: string) => [{ text: t, citations: [{ claimId: 'x', exhibitLabel: 'A', page: 1, quote: 'q' }] }];

let caseId: string;
let otherCaseId: string;
let runId: string;
let paraIds: string[] = [];

beforeAll(async () => {
  const { data: cases } = await admin.from('cases').select('id,title').order('created_at');
  const alvarez = cases!.find((c) => c.title.includes('Alvarez'))!;
  otherCaseId = cases!.find((c) => c.title.includes('Raman'))!.id;
  // An isolated case with a synthetic draft, so tests never touch demo data.
  const { data: client } = await admin.from('profiles').select('id').eq('email', 'mateo.alvarez@client.exhibit-a.test').single();
  const { data: c } = await admin
    .from('cases')
    .insert({ title: 'RLS test case', beneficiary_name: 'Test Person', field: 'testing', client_id: client!.id })
    .select('id')
    .single();
  caseId = c!.id;
  void alvarez;
  const { data: run } = await admin.from('pipeline_runs').insert({ case_id: caseId, status: 'suspended' }).select('id').single();
  runId = run!.id;
  await admin.from('cases').update({ active_run_id: runId, status: 'needs_review' }).eq('id', caseId);
  const { data: sec } = await admin.from('draft_sections').insert({ run_id: runId, case_id: caseId, heading: 'Test', position: 0 }).select('id').single();
  const { data: paras } = await admin
    .from('paragraphs')
    .insert([0, 1].map((i) => ({ section_id: sec!.id, case_id: caseId, position: i, sentences: sentence(`Sentence ${i}.`) })))
    .select('id');
  paraIds = paras!.map((p) => p.id);
});

afterAll(async () => {
  if (caseId) await admin.from('cases').delete().eq('id', caseId);
});

describe('row-level security', () => {
  it('a client sees only their own cases', async () => {
    const c = await as('mateo.alvarez@client.exhibit-a.test');
    const { data } = await c.from('cases').select('id');
    const ids = data!.map((x) => x.id);
    expect(ids).toContain(caseId);
    expect(ids).not.toContain(otherCaseId);
  });

  it('a client cannot read drafts, claims, objections or agent events', async () => {
    const c = await as('mateo.alvarez@client.exhibit-a.test');
    for (const table of ['paragraphs', 'claims', 'objections', 'agent_events', 'criterion_assessments'] as const) {
      const { data } = await c.from(table).select('id').eq('case_id', caseId);
      expect(data, table).toEqual([]);
    }
  });

  it('a client cannot read another case’s exhibit files', async () => {
    const c = await as('mateo.alvarez@client.exhibit-a.test');
    const { data } = await c.storage.from('exhibits').list(otherCaseId);
    expect(data ?? []).toEqual([]);
  });

  it('a client cannot escalate their own role', async () => {
    const c = await as('mateo.alvarez@client.exhibit-a.test');
    const { data: me } = await c.auth.getUser();
    await c.from('profiles').update({ role: 'attorney' }).eq('id', me.user!.id);
    const { data } = await admin.from('profiles').select('role').eq('id', me.user!.id).single();
    expect(data!.role).toBe('client');
  });

  it('a client cannot create cases', async () => {
    const c = await as('mateo.alvarez@client.exhibit-a.test');
    const { error } = await c.from('cases').insert({ title: 'x', beneficiary_name: 'x', field: 'x' });
    expect(error).not.toBeNull();
  });
});

describe('review workflow and human checkpoint', () => {
  it('every reviewed change is versioned with the human actor', async () => {
    const p = await as('paralegal@exhibit-a.test');
    const { error } = await p.from('paragraphs').update({ status: 'edited', sentences: sentence('Edited sentence.') }).eq('id', paraIds[0]);
    expect(error).toBeNull();
    const { data: versions } = await admin.from('paragraph_versions').select('version,actor_kind,actor_id,status').eq('paragraph_id', paraIds[0]).order('version');
    expect(versions!.map((v) => [v.version, v.actor_kind, v.status])).toEqual([
      [1, 'agent', 'pending'],
      [2, 'human', 'edited'],
    ]);
    expect(versions![1].actor_id).not.toBeNull();
  });

  it('the database rejects an uncited sentence even from staff', async () => {
    const p = await as('paralegal@exhibit-a.test');
    const { error } = await p.from('paragraphs').update({ sentences: [{ text: 'No source.', citations: [] }] }).eq('id', paraIds[0]);
    expect(error?.message).toMatch(/every_sentence_cited/);
  });

  it('a paralegal cannot sign off', async () => {
    const p = await as('paralegal@exhibit-a.test');
    const { error } = await p.from('signoffs').insert({ case_id: caseId, run_id: runId });
    expect(error).not.toBeNull();
  });

  it('an attorney cannot sign off while a paragraph is still pending', async () => {
    const a = await as('attorney@exhibit-a.test');
    const { error } = await a.from('signoffs').insert({ case_id: caseId, run_id: runId });
    expect(error?.message).toMatch(/row-level security/);
  });

  it('an attorney can sign off a fully reviewed draft, which locks it', async () => {
    const a = await as('attorney@exhibit-a.test');
    await a.from('paragraphs').update({ status: 'accepted' }).eq('id', paraIds[1]);
    const { data, error } = await a.from('signoffs').insert({ case_id: caseId, run_id: runId, note: 'ok' }).select('content_sha256').single();
    expect(error).toBeNull();
    expect(data!.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    const { data: c } = await admin.from('cases').select('status').eq('id', caseId).single();
    expect(c!.status).toBe('signed_off');
    const { error: lockErr } = await a.from('paragraphs').update({ status: 'rejected' }).eq('id', paraIds[1]);
    expect(lockErr?.message).toMatch(/signed off/);
  });
});
