import { notFound } from 'next/navigation';
import { AutoRefresh, ResumeButton, RunButton } from '@/components/case/run-controls';
import { CaseTabs } from '@/components/case/tabs';
import { Badge, statusLabel, statusTone } from '@/components/ui';
import { requireUser } from '@/lib/supabase/server';

export default async function CaseLayout({ children, params }: LayoutProps<'/cases/[id]'>) {
  const { id } = await params;
  const { supabase, profile } = await requireUser();
  const { data: c } = await supabase.from('cases').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const staff = profile?.role !== 'client';
  const { data: run } = c.active_run_id
    ? await supabase.from('pipeline_runs').select('id,status,current_step').eq('id', c.active_run_id).maybeSingle()
    : { data: null };
  const [{ count: openQuestions }, { count: objections }] = await Promise.all([
    supabase.from('follow_up_questions').select('id', { count: 'exact', head: true }).eq('run_id', c.active_run_id ?? '00000000-0000-0000-0000-000000000000').eq('status', 'open'),
    staff
      ? supabase.from('objections').select('id', { count: 'exact', head: true }).eq('run_id', c.active_run_id ?? '00000000-0000-0000-0000-000000000000').eq('status', 'open')
      : Promise.resolve({ count: 0 }),
  ]);

  const tabs = staff
    ? [
        { href: '', label: 'Evidence map' },
        { href: '/review', label: 'Draft review' },
        { href: '/objections', label: 'Officer objections', count: objections ?? 0 },
        { href: '/questions', label: 'Client questions', count: openQuestions ?? 0 },
        { href: '/exhibits', label: 'Exhibits' },
        { href: '/run', label: 'Agent run' },
      ]
    : [
        { href: '', label: 'Status' },
        { href: '/questions', label: 'Questions for you', count: openQuestions ?? 0 },
        { href: '/exhibits', label: 'Documents' },
      ];

  return (
    <div className="space-y-5">
      <AutoRefresh active={c.status === 'processing'} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{c.beneficiary_name}</h1>
            <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
            {c.status === 'processing' && run?.current_step && <span className="animate-pulse text-xs text-muted">running: {run.current_step.replace('_', ' ')}</span>}
          </div>
          <p className="mt-1 text-sm text-muted">
            O-1A · {c.field} · {c.proposed_role}, {c.petitioner}
          </p>
        </div>
        {staff && (
          <div className="flex items-center gap-2">
            {run?.status === 'failed' && <ResumeButton caseId={c.id} runId={run.id} />}
            {c.status !== 'signed_off' && (
              <RunButton caseId={c.id} disabled={c.status === 'processing'} label={c.active_run_id ? 'Re-run agents' : 'Run agents'} />
            )}
          </div>
        )}
      </div>
      <CaseTabs caseId={c.id} tabs={tabs} />
      {children}
    </div>
  );
}
