import { formatDuration } from '@/lib/data/run-metrics';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, CardHeader, Empty, Stat, severityTone, strengthTone } from '@/components/ui';
import { getCaseBundle, runMetrics } from '@/lib/data/cases';
import { CRITERIA, REQUIREMENTS, countLikelyMet, type Strength } from '@/lib/o1a/criteria';
import { requireUser } from '@/lib/supabase/server';

export default async function CaseOverview({ params }: PageProps<'/cases/[id]'>) {
  const { id } = await params;
  const { supabase, profile } = await requireUser();
  const b = await getCaseBundle(supabase, id);
  if (!b) notFound();

  if (profile?.role === 'client') return <ClientStatus status={b.case.status} openQuestions={b.questions.filter((q) => q.status === 'open').length} caseId={id} />;

  if (!b.run) {
    return (
      <Card>
        <Empty>
          {b.exhibits.length} exhibit{b.exhibits.length === 1 ? '' : 's'} uploaded. Run the agents to map the evidence to the 8 O-1A criteria.
        </Empty>
      </Card>
    );
  }

  const m = runMetrics(b.events);
  const likelyMet = countLikelyMet(b.assessments as { strength: Strength }[]);
  const claimsById = new Map(b.claims.map((c) => [c.id, c]));
  const exLabel = new Map(b.exhibits.map((e) => [e.id, e.label]));
  const byCriterion = new Map(b.assessments.map((a) => [a.criterion, a]));
  const highGaps = b.gaps.filter((g) => g.severity === 'high');
  const reqGaps = new Set(b.gaps.filter((g) => g.kind === 'requirement').map((g) => g.title.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Criteria likely met" value={`${likelyMet} / 8`} hint="3 required (8 CFR 214.2(o)(3)(iii))" tone={b.assessments.length ? (likelyMet >= 3 ? 'good' : 'bad') : undefined} />
        <Stat label="Verified evidence" value={b.claims.length} hint="claims with a quote found on the cited page" />
        <Stat label="High-severity gaps" value={highGaps.length} tone={highGaps.length ? 'warn' : 'good'} />
        <Stat label="Officer objections" value={b.objections.length} hint={`${b.objections.filter((o) => o.severity === 'high').length} high severity`} />
        <Stat label="Agent cost · time" value={`$${m.costUsd.toFixed(2)}`} hint={`${formatDuration(m.activeSeconds)} compute · ${m.llmCalls} model calls`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Evidence map" subtitle="Each criterion assessed against its regulatory elements. Click a citation to open the source page." />
          {b.assessments.length === 0 ? (
            <Empty>Mapping in progress…</Empty>
          ) : (
            <div className="divide-y divide-line">
              {CRITERIA.map((crit, i) => {
                const a = byCriterion.get(crit.key);
                if (!a) return null;
                const evidence = (a.claim_ids as string[]).map((cid) => claimsById.get(cid)).filter((c) => !!c);
                return (
                  <div key={crit.key} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs text-muted">
                          ({i + 1}) {crit.cfr}
                        </div>
                        <div className="font-medium">{crit.title}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {a.comparable_evidence && <Badge tone="violet">comparable evidence</Badge>}
                        <Badge tone={strengthTone[a.strength]}>{a.strength}</Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{a.rationale}</p>
                    {evidence.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {evidence.map((c) => {
                          const label = exLabel.get(c.exhibit_id);
                          return (
                            <li key={c.id} className="flex gap-2 text-sm">
                              <Link
                                href={`/cases/${id}/exhibits?label=${label}&page=${c.page_no}&q=${encodeURIComponent(c.quote.slice(0, 300))}`}
                                className="shrink-0 rounded bg-brand-soft px-1.5 py-0.5 font-mono text-xs text-brand hover:bg-indigo-200"
                              >
                                Ex. {label} p.{c.page_no}
                              </Link>
                              <span className="text-slate-600">“{c.quote}”</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Petition requirements" subtitle="Outside the 8 criteria; common RFE grounds" />
            <ul className="divide-y divide-line text-sm">
              {REQUIREMENTS.map((r) => {
                const missing = [...reqGaps].some((t) => t.includes(r.title.slice(0, 20).toLowerCase()));
                return (
                  <li key={r.key} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted">{r.cfr}</div>
                    </div>
                    {b.gaps.length === 0 ? <Badge>pending</Badge> : missing ? <Badge tone="red">missing</Badge> : <Badge tone="green">present</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Gaps to close before filing" />
            {b.gaps.length === 0 ? (
              <Empty>No gap analysis yet.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {[...b.gaps]
                  .sort((x, y) => ['high', 'medium', 'low'].indexOf(x.severity) - ['high', 'medium', 'low'].indexOf(y.severity))
                  .map((g) => (
                    <li key={g.id} className="px-5 py-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{g.title}</span>
                        <Badge tone={severityTone[g.severity as 'high' | 'medium' | 'low']}>{g.severity}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{g.detail}</p>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ClientStatus({ status, openQuestions, caseId }: { status: string; openQuestions: number; caseId: string }) {
  const steps = [
    { key: 'intake', label: 'Documents received' },
    { key: 'processing', label: 'Evidence being organized' },
    { key: 'needs_review', label: 'Attorney review' },
    { key: 'signed_off', label: 'Approved by your attorney' },
  ];
  const idx = Math.max(0, steps.findIndex((s) => s.key === status));
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Where your petition stands" />
      <ol className="space-y-3 px-5 py-4">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${i <= idx ? 'bg-brand text-white' : 'bg-slate-100 text-muted'}`}>{i + 1}</span>
            <span className={i <= idx ? 'font-medium' : 'text-muted'}>{s.label}</span>
          </li>
        ))}
      </ol>
      {openQuestions > 0 && (
        <div className="border-t border-line px-5 py-3 text-sm">
          Your attorney has <strong>{openQuestions}</strong> question{openQuestions === 1 ? '' : 's'} for you.{' '}
          <Link className="font-medium text-brand underline" href={`/cases/${caseId}/questions`}>
            Answer them
          </Link>
        </div>
      )}
    </Card>
  );
}
