import { notFound, redirect } from 'next/navigation';
import { ReviewWorkspace, type ReviewData } from '@/components/review/review-workspace';
import { Card, Empty } from '@/components/ui';
import type { CitedSentence } from '@/lib/citations/verify';
import { requireUser } from '@/lib/supabase/server';

export default async function ReviewPage({ params }: PageProps<'/cases/[id]/review'>) {
  const { id } = await params;
  const { supabase, profile } = await requireUser();
  if (profile?.role === 'client') redirect(`/cases/${id}`);
  const { data: c } = await supabase.from('cases').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  if (!c.active_run_id) return <Card><Empty>No draft yet. Run the agents first.</Empty></Card>;

  const runId = c.active_run_id;
  const [{ data: sections }, { data: exhibits }, { data: pages }, { data: signoff }] = await Promise.all([
    supabase.from('draft_sections').select('*').eq('run_id', runId).order('position'),
    supabase.from('exhibits').select('id,label,title,page_count').eq('case_id', id).order('label'),
    supabase.from('exhibit_pages').select('exhibit_id,page_no,content').eq('case_id', id),
    supabase.from('signoffs').select('*, attorney:profiles(full_name)').eq('run_id', runId).maybeSingle(),
  ]);
  const sectionIds = (sections ?? []).map((s) => s.id);
  const [{ data: paragraphs }, { data: versions }] = await Promise.all([
    sectionIds.length ? supabase.from('paragraphs').select('*').in('section_id', sectionIds).order('position') : Promise.resolve({ data: [] }),
    supabase.from('paragraph_versions').select('*, actor:profiles(full_name)').eq('case_id', id).order('version', { ascending: false }),
  ]);

  if (!sections?.length) return <Card><Empty>The draft is being written…</Empty></Card>;

  const labelById = new Map((exhibits ?? []).map((e) => [e.id, e.label]));
  const data: ReviewData = {
    caseId: id,
    runId,
    role: profile?.role ?? 'paralegal',
    locked: c.status === 'signed_off',
    signoff: signoff
      ? {
          at: signoff.created_at,
          by: (signoff.attorney as { full_name: string } | null)?.full_name ?? 'Attorney',
          sha: signoff.content_sha256 ?? '',
          note: signoff.note,
        }
      : null,
    exhibits: (exhibits ?? []).map((e) => ({ label: e.label, title: e.title, pageCount: e.page_count })),
    pages: Object.fromEntries((pages ?? []).map((p) => [`${labelById.get(p.exhibit_id)}:${p.page_no}`, p.content])),
    sections: sections.map((s) => ({
      id: s.id,
      heading: s.heading,
      paragraphs: (paragraphs ?? [])
        .filter((p) => p.section_id === s.id)
        .map((p) => ({
          id: p.id,
          status: p.status,
          version: p.version,
          note: p.review_note,
          sentences: p.sentences as unknown as CitedSentence[],
          history: (versions ?? [])
            .filter((v) => v.paragraph_id === p.id)
            .map((v) => ({
              version: v.version,
              status: v.status,
              actor: v.actor_kind === 'agent' ? 'Petition Drafter (agent)' : ((v.actor as { full_name: string } | null)?.full_name ?? 'Staff'),
              at: v.created_at,
              note: v.note,
              text: (v.sentences as unknown as CitedSentence[]).map((x) => x.text).join(' '),
            })),
        })),
    })),
  };
  return <ReviewWorkspace data={data} />;
}
