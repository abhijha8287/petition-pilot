import { AnswerForm } from '@/components/case/small-actions';
import { Badge, Card, CardHeader, Empty } from '@/components/ui';
import { criterionByKey, type CriterionKey } from '@/lib/o1a/criteria';
import { requireUser } from '@/lib/supabase/server';

export default async function QuestionsPage({ params }: PageProps<'/cases/[id]/questions'>) {
  const { id } = await params;
  const { supabase, profile } = await requireUser();
  const staff = profile?.role !== 'client';
  const { data: c } = await supabase.from('cases').select('active_run_id').eq('id', id).single();
  const { data: qs } = c?.active_run_id ? await supabase.from('follow_up_questions').select('*').eq('run_id', c.active_run_id) : { data: [] };
  return (
    <Card>
      <CardHeader
        title={staff ? 'Follow-up questions for the client' : 'Questions from your legal team'}
        subtitle={staff ? 'Generated from the gap analysis. The client sees the question, not the internal rationale.' : 'Answering these helps us strengthen your petition.'}
      />
      {(qs ?? []).length === 0 ? (
        <Empty>No questions right now.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {(qs ?? []).map((q) => (
            <li key={q.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{q.question}</p>
                <div className="flex shrink-0 gap-1.5">
                  {q.criterion && staff && <Badge tone="blue">{criterionByKey[q.criterion as CriterionKey].short}</Badge>}
                  <Badge tone={q.status === 'answered' ? 'green' : 'amber'}>{q.status}</Badge>
                </div>
              </div>
              {staff && <p className="mt-1 text-xs text-muted">Why: {q.rationale}</p>}
              {staff ? (
                q.answer && <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm">Client answer: {q.answer}</p>
              ) : (
                <AnswerForm id={q.id} initial={q.answer} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
