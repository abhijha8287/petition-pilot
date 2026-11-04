import fs from 'node:fs/promises';
import path from 'node:path';
import { RequestContext } from '@mastra/core/request-context';
import { searchAao } from '@/lib/aao/retrieval';
import { extractText, getDocumentProxy } from 'unpdf';
import { CRITERIA, REQUIREMENTS, countLikelyMet, criterionByKey, type CriterionKey } from '@/lib/o1a/criteria';
import { CriteriaMap, DraftSection, ExtractedClaims, GapReport, MIN_QUOTE_CHARS, OfficerReview } from '@/lib/o1a/schemas';
import { enforceCitations, normalizeText, stripClaimHandles, tidyExcerpt, verifyQuote, type CitedSentence } from '@/lib/citations/verify';
import { adminClient } from '@/lib/supabase/admin';
import type { JsonValue } from '@/lib/supabase/json';
import { criteriaMapper, evidenceAnalyst, gapAnalyst, petitionDrafter, uscisOfficer } from '../agents';
import { callAgent, logEvent, mapLimit, type RunCtx } from '../runtime';
import { runDir, writeWorkspaceFile } from '../workspace';

const db = () => adminClient();

function ok(res: { error: { message: string } | null }, what: string): void {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
}

function must<R extends { data: unknown; error: { message: string } | null }>(res: R, what: string): NonNullable<R['data']> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: no data`);
  return res.data as NonNullable<R['data']>;
}

type Exhibit = { id: string; label: string; title: string; page_count: number; storage_path: string };
type Page = { exhibit_id: string; page_no: number; content: string };
type Claim = { id: string; exhibit_id: string; page_no: number; quote: string; statement: string };

async function loadCase(caseId: string) {
  return must(await db().from('cases').select('*').eq('id', caseId).single(), 'load case');
}

async function loadExhibits(caseId: string): Promise<Exhibit[]> {
  return must(
    await db().from('exhibits').select('id,label,title,page_count,storage_path').eq('case_id', caseId).order('label'),
    'load exhibits',
  );
}

async function loadPages(caseId: string): Promise<Page[]> {
  return must(await db().from('exhibit_pages').select('exhibit_id,page_no,content').eq('case_id', caseId), 'load pages');
}

async function loadVerifiedClaims(runId: string): Promise<Claim[]> {
  return must(
    await db()
      .from('claims')
      .select('id,exhibit_id,page_no,quote,statement')
      .eq('run_id', runId)
      .eq('quote_verified', true)
      .order('created_at'),
    'load claims',
  );
}

/** Models see short, stable handles (C1, C2...) instead of UUIDs; fewer copy errors. */
function claimHandles(claims: Claim[], exhibits: Exhibit[]) {
  const label = new Map(exhibits.map((e) => [e.id, e.label]));
  const toId = new Map<string, string>();
  const lines = claims.map((c, i) => {
    const h = `C${i + 1}`;
    toId.set(h, c.id);
    return `[${h}] Ex. ${label.get(c.exhibit_id)} p.${c.page_no}: ${c.statement} | quote: "${c.quote}"`;
  });
  const fromId = new Map([...toId.entries()].map(([h, id]) => [id, h]));
  return { lines, toId, fromId };
}

// ---------------------------------------------------------------------------
// 1. Ingest: per-page text for every exhibit, materialized into the workspace
// ---------------------------------------------------------------------------
export async function ingest(ctx: RunCtx) {
  const exhibits = await loadExhibits(ctx.caseId);
  if (exhibits.length === 0) throw new Error('Case has no exhibits');
  const existing = await loadPages(ctx.caseId);
  const have = new Set(existing.map((p) => p.exhibit_id));

  for (const ex of exhibits.filter((e) => !have.has(e.id))) {
    const file = await db().storage.from('exhibits').download(ex.storage_path);
    if (file.error) throw new Error(`download ${ex.label}: ${file.error.message}`);
    const pdf = await getDocumentProxy(new Uint8Array(await file.data.arrayBuffer()));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const rows = text.map((content, i) => ({ exhibit_id: ex.id, case_id: ctx.caseId, page_no: i + 1, content }));
    ok(await db().from('exhibit_pages').upsert(rows), `store pages ${ex.label}`);
    ok(await db().from('exhibits').update({ page_count: totalPages }).eq('id', ex.id), 'update page count');
    await logEvent(ctx, 'ingest', 'info', `Extracted ${totalPages} page(s) from Exhibit ${ex.label}`);
  }

  const pages = await loadPages(ctx.caseId);
  const fresh = await loadExhibits(ctx.caseId);
  for (const ex of fresh) {
    for (const p of pages.filter((p) => p.exhibit_id === ex.id)) {
      await writeWorkspaceFile(ctx.caseId, ctx.runId, `exhibits/${ex.label}/page-${String(p.page_no).padStart(3, '0')}.txt`, p.content);
    }
  }
  await writeWorkspaceFile(
    ctx.caseId,
    ctx.runId,
    'exhibits/INDEX.md',
    fresh.map((e) => `- Exhibit ${e.label}: ${e.title} (${e.page_count} pages)`).join('\n'),
  );
  return { exhibits: fresh.length, pages: pages.length };
}

// ---------------------------------------------------------------------------
// 2. Extract claims: one agent call per exhibit, every quote verified on page
// ---------------------------------------------------------------------------
export async function extractClaims(ctx: RunCtx) {
  ok(await db().from('claims').delete().eq('run_id', ctx.runId), 'clear claims');
  const exhibits = await loadExhibits(ctx.caseId);
  const pages = await loadPages(ctx.caseId);

  const results = await mapLimit(exhibits, 4, async (ex) => {
    const exPages = pages.filter((p) => p.exhibit_id === ex.id).sort((a, b) => a.page_no - b.page_no);
    const body = exPages.map((p) => `=== PAGE ${p.page_no} ===\n${p.content}`).join('\n\n');
    const out = await callAgent(
      ctx,
      'extract_claims',
      evidenceAnalyst,
      `Exhibit ${ex.label}: "${ex.title}"\n\n<exhibit_text>\n${body}\n</exhibit_text>`,
      ExtractedClaims,
      { label: `Exhibit ${ex.label}` },
    );
    const rows = out.claims.filter((c) => c.quote.trim().length >= MIN_QUOTE_CHARS).map((c) => {
      const page = exPages.find((p) => p.page_no === c.page)?.content ?? '';
      // Recover a mis-paged quote: if it is not on the stated page, look on the others.
      let pageNo = c.page;
      let ok = verifyQuote(c.quote, page).verified;
      if (!ok) {
        const alt = exPages.find((p) => verifyQuote(c.quote, p.content).verified);
        if (alt) {
          pageNo = alt.page_no;
          ok = true;
        }
      }
      return { run_id: ctx.runId, case_id: ctx.caseId, exhibit_id: ex.id, page_no: pageNo, quote: c.quote, statement: c.statement, quote_verified: ok };
    });
    if (rows.length) ok(await db().from('claims').insert(rows), 'insert claims');
    ok(await db().from('exhibits').update({ doc_type: out.docType }).eq('id', ex.id), 'set doc type');
    return { total: rows.length, verified: rows.filter((r) => r.quote_verified).length };
  });

  const total = results.reduce((a, r) => a + r.total, 0);
  const verified = results.reduce((a, r) => a + r.verified, 0);
  if (total > verified) {
    await logEvent(ctx, 'extract_claims', 'info', `Discarded ${total - verified} claim(s) whose quote was not found on the cited page`);
  }
  const claims = await loadVerifiedClaims(ctx.runId);
  const { lines } = claimHandles(claims, exhibits);
  await writeWorkspaceFile(ctx.caseId, ctx.runId, 'claims.md', `# Verified claims\n\n${lines.join('\n')}`);
  return { claims: total, verified, quoteVerificationRate: total ? verified / total : 0 };
}

// ---------------------------------------------------------------------------
// 3. Map to the 8 criteria
// ---------------------------------------------------------------------------
export async function mapCriteria(ctx: RunCtx) {
  const c = await loadCase(ctx.caseId);
  const exhibits = await loadExhibits(ctx.caseId);
  const claims = await loadVerifiedClaims(ctx.runId);
  const { lines, toId } = claimHandles(claims, exhibits);

  const out = await callAgent(
    ctx,
    'map_criteria',
    criteriaMapper,
    `Beneficiary: ${c.beneficiary_name}\nField: ${c.field}\nProposed role: ${c.proposed_role}\n\nVerified claims:\n${lines.join('\n')}\n\nAssess all 8 criteria.`,
    CriteriaMap,
  );

  // Normalize: exactly one row per criterion, only known claim ids.
  const byKey = new Map(out.assessments.map((a) => [a.criterion, a]));
  const rows = CRITERIA.map(({ key }) => {
    const a = byKey.get(key);
    return {
      run_id: ctx.runId,
      case_id: ctx.caseId,
      criterion: key,
      strength: a?.strength ?? 'none',
      rationale: a?.rationale ?? 'Not assessed.',
      claim_ids: (a?.claimIds ?? []).map((h) => toId.get(h)).filter((x): x is string => !!x),
      comparable_evidence: a?.comparableEvidence ?? false,
    };
  });
  ok(await db().from('criterion_assessments').delete().eq('run_id', ctx.runId), 'clear assessments');
  ok(await db().from('criterion_assessments').insert(rows), 'insert assessments');

  const likelyMet = countLikelyMet(rows);
  await writeWorkspaceFile(
    ctx.caseId,
    ctx.runId,
    'criteria.md',
    `# Criteria map (${likelyMet}/8 likely met)\n\n` +
      rows.map((r) => `## ${criterionByKey[r.criterion].title}\nStrength: ${r.strength}\n${r.rationale}`).join('\n\n'),
  );
  return { likelyMet, strengths: Object.fromEntries(rows.map((r) => [r.criterion, r.strength])) };
}

// ---------------------------------------------------------------------------
// 4. Gaps, missing requirements, client follow-up questions
// ---------------------------------------------------------------------------
export async function analyzeGaps(ctx: RunCtx) {
  const c = await loadCase(ctx.caseId);
  const exhibits = await loadExhibits(ctx.caseId);
  const claims = await loadVerifiedClaims(ctx.runId);
  const { lines, toId } = claimHandles(claims, exhibits);
  const assessments = must(await db().from('criterion_assessments').select('*').eq('run_id', ctx.runId), 'load assessments');
  const likelyMet = countLikelyMet(assessments);

  const out = await callAgent(
    ctx,
    'gaps',
    gapAnalyst,
    `Beneficiary: ${c.beneficiary_name} (${c.field}), proposed role: ${c.proposed_role}, petitioner: ${c.petitioner}

Exhibits:
${exhibits.map((e) => `- ${e.label}: ${e.title}`).join('\n')}

Criteria map (${likelyMet} of 8 rated strong or moderate; at least 3 are required):
${assessments.map((a) => `- ${a.criterion}: ${a.strength}. ${a.rationale}`).join('\n')}

Verified claims:
${lines.join('\n')}`,
    GapReport,
  );

  const gaps = out.gaps.map((g) => ({ ...g, run_id: ctx.runId, case_id: ctx.caseId }));
  if (likelyMet < 3) {
    gaps.unshift({
      run_id: ctx.runId,
      case_id: ctx.caseId,
      kind: 'final_merits',
      criterion: null,
      title: `Only ${likelyMet} of the required 3 criteria are likely met`,
      detail: 'The petition does not yet clear the 3-criteria threshold of 8 CFR 214.2(o)(3)(iii)(B). Strengthen the moderate/weak criteria before filing.',
      severity: 'high',
    });
  }
  for (const r of out.requirements.filter((r) => !r.present)) {
    const req = REQUIREMENTS.find((x) => x.key === r.key)!;
    if (!gaps.some((g) => g.kind === 'requirement' && g.title.toLowerCase().includes(req.title.slice(0, 20).toLowerCase()))) {
      gaps.push({ run_id: ctx.runId, case_id: ctx.caseId, kind: 'requirement', criterion: null, title: `Missing: ${req.title}`, detail: `${r.note} (${req.cfr})`, severity: 'high' });
    }
  }

  ok(await db().from('gaps').delete().eq('run_id', ctx.runId), 'clear gaps');
  ok(await db().from('follow_up_questions').delete().eq('run_id', ctx.runId), 'clear questions');
  if (gaps.length) ok(await db().from('gaps').insert(gaps.map(({ kind, criterion, title, detail, severity, run_id, case_id }) => ({ kind, criterion, title, detail, severity, run_id, case_id }))), 'insert gaps');
  if (out.questions.length)
    ok(
      await db()
        .from('follow_up_questions')
        .insert(out.questions.map((q) => ({ ...q, run_id: ctx.runId, case_id: ctx.caseId }))),
      'insert questions',
    );

  await writeWorkspaceFile(
    ctx.caseId,
    ctx.runId,
    'gaps.md',
    `# Gaps\n\n${gaps.map((g) => `- [${g.severity}] ${g.title}: ${g.detail}`).join('\n')}\n\n# Requirements\n\n${out.requirements
      .map((r) => `- ${r.key}: ${r.present ? 'present' : 'MISSING'} (${r.note}) ${r.claimIds.map((h) => toId.get(h)).filter(Boolean).length} supporting claim(s)`)
      .join('\n')}`,
  );
  return { gaps: gaps.length, questions: out.questions.length, missingRequirements: out.requirements.filter((r) => !r.present).map((r) => r.key) };
}

// ---------------------------------------------------------------------------
// 5. Draft: sentence-level citations, no source -> no sentence
// ---------------------------------------------------------------------------
export async function draftPetition(ctx: RunCtx) {
  const c = await loadCase(ctx.caseId);
  const exhibits = await loadExhibits(ctx.caseId);
  const pages = await loadPages(ctx.caseId);
  const claims = await loadVerifiedClaims(ctx.runId);
  const { lines, toId, fromId } = claimHandles(claims, exhibits);
  const claimById = new Map(claims.map((cl) => [cl.id, cl]));
  const labelOf = new Map(exhibits.map((e) => [e.id, e.label]));
  const pageText = new Map(pages.map((p) => [`${labelOf.get(p.exhibit_id)}:${p.page_no}`, p.content]));
  const assessments = must(await db().from('criterion_assessments').select('*').eq('run_id', ctx.runId), 'load assessments');

  const targets = assessments
    .filter((a) => a.strength === 'strong' || a.strength === 'moderate')
    .sort((a, b) => CRITERIA.findIndex((x) => x.key === a.criterion) - CRITERIA.findIndex((x) => x.key === b.criterion));

  const sections: { criterion: CriterionKey | null; heading: string; brief: string; claimHandles: string[] }[] = [
    {
      criterion: null,
      heading: 'Introduction and Summary of Eligibility',
      brief: `Introduce ${c.beneficiary_name}, a ${c.field} professional, the petitioner (${c.petitioner}) and proposed role (${c.proposed_role}). ${
        targets.length
          ? `State that the petition addresses the following criteria: ${targets.map((t) => criterionByKey[t.criterion as CriterionKey].short).join(', ')}.`
          : 'No criterion is yet supported strongly enough to claim, so state only cited background facts and do not say that any criterion is met.'
      } Keep it to one paragraph.`,
      claimHandles: [],
    },
    ...targets.map((a) => {
      const crit = criterionByKey[a.criterion as CriterionKey];
      return {
        criterion: a.criterion as CriterionKey,
        heading: `${crit.title} (${crit.cfr})`,
        brief: `Criterion: ${crit.title}\nLegal test: ${crit.test}\nAssessment: ${a.strength}. ${a.rationale}`,
        claimHandles: (a.claim_ids as string[]).map((id) => fromId.get(id)).filter((h): h is string => !!h),
      };
    }),
  ];

  const drafted = await mapLimit(sections, 3, async (s) => {
    const primary = s.claimHandles.length ? `Primary evidence for this section: ${s.claimHandles.join(', ')}\n` : '';
    const out = await callAgent(
      ctx,
      'draft',
      petitionDrafter,
      `${s.brief}\n\n${primary}All verified claims you may cite:\n${lines.join('\n')}\n\nDraft the section "${s.heading}".`,
      DraftSection,
      { label: s.heading.slice(0, 60) },
    );
    let kept = 0;
    let dropped = 0;
    const seen = new Set<string>();
    const paragraphs = out.paragraphs
      .map((p) => {
        const fresh = p.sentences
          .map((st) => ({ ...st, text: stripClaimHandles(st.text) }))
          .filter((st) => {
            const key = normalizeText(st.text);
            if (!key || seen.has(key)) return false; // small models sometimes repeat sentences
            seen.add(key);
            return true;
          });
        const sentences: CitedSentence[] = fresh.map((st) => ({
          text: st.text,
          citations: st.claimIds
            .map((h) => toId.get(h))
            .filter((id): id is string => !!id)
            .map((id) => {
              const cl = claimById.get(id)!;
              return { claimId: id, exhibitLabel: labelOf.get(cl.exhibit_id)!, page: cl.page_no, quote: cl.quote };
            }),
        }));
        const r = enforceCitations(sentences, (l, pg) => pageText.get(`${l}:${pg}`));
        kept += r.kept.length;
        dropped += r.dropped.length;
        return r.kept;
      })
      .filter((p) => p.length > 0);
    return { ...s, paragraphs, kept, dropped };
  });

  ok(await db().from('draft_sections').delete().eq('run_id', ctx.runId), 'clear draft');
  let position = 0;
  for (const s of drafted) {
    if (s.paragraphs.length === 0) continue;
    const sec = must(
      await db()
        .from('draft_sections')
        .insert({ run_id: ctx.runId, case_id: ctx.caseId, criterion: s.criterion, heading: s.heading, position: position++ })
        .select('id')
        .single(),
      'insert section',
    );
    ok(
      await db()
        .from('paragraphs')
        .insert(s.paragraphs.map((sentences, i) => ({ section_id: sec.id, case_id: ctx.caseId, position: i, sentences: sentences as unknown as JsonValue }))),
      'insert paragraphs',
    );
  }

  const kept = drafted.reduce((a, s) => a + s.kept, 0);
  const dropped = drafted.reduce((a, s) => a + s.dropped, 0);
  if (dropped) await logEvent(ctx, 'draft', 'info', `Removed ${dropped} sentence(s) with no valid citation`);
  await writeWorkspaceFile(
    ctx.caseId,
    ctx.runId,
    'draft.md',
    drafted
      .map(
        (s) =>
          `## ${s.heading}\n\n` +
          s.paragraphs.map((p) => p.map((st) => `${st.text} [${st.citations.map((x) => `Ex. ${x.exhibitLabel} p.${x.page}`).join('; ')}]`).join(' ')).join('\n\n'),
      )
      .join('\n\n'),
  );
  return { sections: drafted.filter((s) => s.paragraphs.length).length, sentences: kept, sentencesDropped: dropped };
}

// ---------------------------------------------------------------------------
// 6. Adversarial officer review, grounded in AAO decisions
// ---------------------------------------------------------------------------
/** Precedent queries derived from which criteria the record touches, plus the final-merits step. */
const REQUIREMENT_REASON_CODES = new Set(['NO_ADVISORY_OPINION', 'NO_CONTRACT_OR_ITINERARY', 'PETITIONER_NOT_QUALIFYING']);

const CRITERION_HINTS: Record<CriterionKey, RegExp> = {
  awards: /award|prize|medal|honou?r|winner/i,
  membership: /member|association|society|fellow/i,
  published_material: /article|magazine|newspaper|press|media|profile|interview|published about/i,
  judging: /judg|review(er|ed)|panel|committee|referee/i,
  original_contributions: /contribut|innovat|patent|adopt|impact|original/i,
  scholarly_articles: /journal|paper|publication|authored|proceedings|preprint/i,
  critical_employment: /role|position|lead|chief|director|founder|employ|critical/i,
  high_remuneration: /salary|remuneration|compensation|wage|\$\d/i,
};

async function retrievePrecedent(materials: string, excludeIds: string[]) {
  const queries = CRITERIA.filter((c) => CRITERION_HINTS[c.key].test(materials)).map((c) => `${c.title}. ${c.commonFailures}`);
  queries.push('final merits determination sustained national or international acclaim small percentage at the very top of the field');
  const seen = new Set<string>();
  const out: { decisionId: string; content: string }[] = [];
  for (const q of queries) {
    for (const h of await searchAao(q, { k: 2, excludeIds })) {
      const key = `${h.decisionId}:${h.chunkIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ decisionId: h.decisionId, content: h.content.slice(0, 900) });
    }
  }
  return out.slice(0, 10);
}

async function readWorkspace(caseId: string, runId: string, files: string[]) {
  const parts: string[] = [];
  for (const f of files) {
    try {
      parts.push(`### ${f}\n${await fs.readFile(path.join(runDir(caseId, runId), f), 'utf8')}`);
    } catch {
      // optional file
    }
  }
  return parts.join('\n\n');
}

/** Phrases the officer puts in quotes must exist in the record; otherwise the objection is about something that isn't there. */
function groundedInRecord(text: string, record: string) {
  const quoted = [...text.matchAll(/['"‘“]([^'"’”]{4,80})['"’”]/g)].map((m) => normalizeText(m[1]));
  const rec = normalizeText(record);
  return quoted.every((q) => rec.includes(q));
}

export async function runOfficer(opts: {
  ctx: RunCtx | null;
  workspace: { caseId: string; runId: string };
  excludeDecisionIds?: string[];
}) {
  const exclude = opts.excludeDecisionIds ?? [];
  const rc = new RequestContext();
  rc.set('caseId', opts.workspace.caseId);
  rc.set('runId', opts.workspace.runId);
  rc.set('excludeDecisionIds', exclude);

  // Materials and precedent are placed in context by code. Small local models
  // are unreliable at deciding to open files or search on their own; the
  // workspace and search tools stay available for follow-up lookups.
  const materials = await readWorkspace(opts.workspace.caseId, opts.workspace.runId, ['case_summary.md', 'criteria.md', 'gaps.md', 'draft.md', 'claims.md']);
  const precedent = await retrievePrecedent(materials, exclude);
  const prompt = `<case_materials>
${materials.slice(0, 24_000)}
</case_materials>

<aao_precedent>
${precedent.map((p, i) => `[P${i + 1}] decisionId=${p.decisionId}\n${p.content}`).join('\n\n')}
</aao_precedent>

Review this O-1A petition as the adjudicating officer and return your objections. Object only to evidence that appears in <case_materials>; never mention awards, publications, organizations or documents that are not in it. For precedent, list the labels (P1, P2, ...) of the excerpts that support each objection.`;

  const review = await callAgent(opts.ctx, 'objections', uscisOfficer, prompt, OfficerReview, { requestContext: rc, maxSteps: 4 });

  // Attach precedent deterministically: the model names an excerpt, code picks
  // the excerpt sentence that best matches the objection. Quotes are verbatim
  // by construction; unknown labels and excluded decisions are dropped.
  const byLabel = new Map(precedent.map((p, i) => [`P${i + 1}`, p]));
  const { data: meta } = precedent.length
    ? await db().from('aao_decisions').select('id,source_url').in('id', [...new Set(precedent.map((p) => p.decisionId))])
    : { data: [] as { id: string; source_url: string }[] };
  const urlOf = new Map((meta ?? []).map((m) => [m.id, m.source_url]));
  const words = (t: string) => new Set(normalizeText(t).split(/\W+/).filter((w) => w.length > 3));
  let refsDropped = 0;
  let ungrounded = 0;
  const objections = review.objections
    .filter((o) => {
      const okRecord = groundedInRecord(o.objection, materials);
      if (!okRecord) ungrounded++;
      return okRecord;
    })
    .map((o) => {
      const isRequirement = REQUIREMENT_REASON_CODES.has(o.reasonCode);
      const aaoRefs = [...new Set(o.precedent)].slice(0, 3)
        .map((label) => byLabel.get(label.trim().toUpperCase()) ?? precedent.find((p) => p.decisionId === label.trim()))
        .filter((p): p is { decisionId: string; content: string } => {
          const ok = !!p && !exclude.includes(p.decisionId);
          if (!ok) refsDropped++;
          return ok;
        })
        .map((p) => {
          const target = words(o.objection);
          const sentences = p.content.split(/(?<=[.;])\s+/).filter((x) => x.length > 40 && x.length < 400);
          const best = sentences.sort((x, y) => [...words(y)].filter((w) => target.has(w)).length - [...words(x)].filter((w) => target.has(w)).length)[0] ?? p.content.slice(0, 300);
          return { decisionId: p.decisionId, quote: tidyExcerpt(best), url: urlOf.get(p.decisionId) };
        });
      // Internal handles never reach the attorney: "AAO P3" becomes the decision id, claim handles go.
      const readable = (t: string) => stripClaimHandles(t.replace(/\bP(\d{1,2})\b/g, (m) => byLabel.get(m)?.decisionId ?? m));
      return {
        ...o,
        objection: readable(o.objection),
        suggestedFix: readable(o.suggestedFix),
        prong: isRequirement ? ('requirement' as const) : o.prong,
        criterion: isRequirement ? null : o.criterion,
        aaoRefs,
      };
    });
  if (opts.ctx && ungrounded) await logEvent(opts.ctx, 'objections', 'info', `Dropped ${ungrounded} objection(s) that referred to evidence not in the record`);
  return { objections, overallRisk: review.overallRisk, refsDropped, ungrounded };
}

export async function objectionCheck(ctx: RunCtx) {
  const c = await loadCase(ctx.caseId);
  const assessments = must(await db().from('criterion_assessments').select('*').eq('run_id', ctx.runId), 'load assessments');
  await writeWorkspaceFile(
    ctx.caseId,
    ctx.runId,
    'case_summary.md',
    `# O-1A petition under review\n\nBeneficiary: ${c.beneficiary_name}\nField: ${c.field}\nPetitioner: ${c.petitioner}\nProposed role: ${c.proposed_role}\n\nClaimed criteria: ${assessments
      .filter((a) => a.strength === 'strong' || a.strength === 'moderate')
      .map((a) => a.criterion)
      .join(', ')}\n\nFiles: exhibits/INDEX.md (exhibit list), exhibits/<label>/page-NNN.txt (source pages), claims.md, criteria.md, gaps.md, draft.md (the petition letter).`,
  );
  const { objections, overallRisk, refsDropped } = await runOfficer({ ctx, workspace: ctx });
  ok(await db().from('objections').delete().eq('run_id', ctx.runId), 'clear objections');
  if (objections.length)
    ok(
      await db()
        .from('objections')
        .insert(
          objections.map((o) => ({
            run_id: ctx.runId,
            case_id: ctx.caseId,
            prong: o.prong,
            criterion: o.criterion,
            reason_code: o.reasonCode,
            objection: o.objection,
            severity: o.severity,
            suggested_fix: o.suggestedFix,
            aao_refs: o.aaoRefs as unknown as JsonValue,
          })),
        ),
      'insert objections',
    );
  if (refsDropped) await logEvent(ctx, 'objections', 'info', `Dropped ${refsDropped} AAO reference(s) that could not be verified`);
  return { objections: objections.length, overallRisk, high: objections.filter((o) => o.severity === 'high').length };
}
