import { redirect } from 'next/navigation';
import { TriageButtons } from '@/components/case/small-actions';
import { Badge, Card, CardHeader, Empty, severityTone } from '@/components/ui';
import { REASON_CODES, criterionByKey, type CriterionKey, type ReasonCode } from '@/lib/o1a/criteria';
import { requireUser } from '@/lib/supabase/server';

type Ref = { decisionId: string; quote: string; url?: string };

export default async function ObjectionsPage({ params }: PageProps<'/cases/[id]/objections'>) {
  const { id } = await params;
  const { supabase, profile } = await requireUser();
  if (profile?.role === 'client') redirect(`/cases/${id}`);
  const { data: c } = await supabase.from('cases').select('active_run_id').eq('id', id).single();
  const { data: objections } = c?.active_run_id
    ? await supabase.from('objections').select('*').eq('run_id', c.active_run_id)
    : { data: [] };
  const sorted = [...(objections ?? [])].sort(
    (a, b) => ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity),
  );
  return (
    <Card>
      <CardHeader
        title="Adversarial review by the USCIS Officer agent"
        subtitle="Predicted RFE and denial grounds, grounded in published AAO O-1 decisions. Triage each before filing."
      />
      {sorted.length === 0 ? (
        <Empty>No objections yet. The officer agent runs after drafting.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((o) => (
            <li key={o.id} className={`px-5 py-4 ${o.status !== 'open' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={severityTone[o.severity as 'high']}>{o.severity}</Badge>
                <Badge tone="slate">{o.prong.replace('_', ' ')}</Badge>
                {o.criterion && <Badge tone="blue">{criterionByKey[o.criterion as CriterionKey]?.short}</Badge>}
                <span className="font-mono text-xs text-muted" title={REASON_CODES[o.reason_code as ReasonCode]}>
                  {o.reason_code}
                </span>
                {o.status !== 'open' && <Badge tone="green">{o.status}</Badge>}
                <div className="ml-auto">
                  <TriageButtons id={o.id} status={o.status} />
                </div>
              </div>
              <p className="mt-2 text-sm font-medium text-ink">{o.objection}</p>
              <p className="mt-1 text-sm text-slate-600">
                <span className="font-medium text-emerald-800">Cure: </span>
                {o.suggested_fix}
              </p>
              {(o.aao_refs as Ref[]).length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {(o.aao_refs as Ref[]).map((r, i) => (
                    <blockquote key={i} className="border-l-2 border-slate-300 pl-3 text-xs text-slate-600">
                      “{r.quote}”{' '}
                      <a href={r.url} target="_blank" rel="noreferrer" className="font-mono text-brand hover:underline">
                        AAO {r.decisionId}
                      </a>
                    </blockquote>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
