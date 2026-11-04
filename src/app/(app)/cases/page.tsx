import Link from 'next/link';
import { Badge, ButtonLink, Card, CardHeader, Empty, statusLabel, statusTone } from '@/components/ui';
import { listCases } from '@/lib/data/cases';
import { requireUser } from '@/lib/supabase/server';

export default async function CasesPage() {
  const { supabase, profile } = await requireUser();
  const cases = await listCases(supabase);
  const staff = profile?.role !== 'client';
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="mt-1 text-sm text-muted">{staff ? 'O-1A petitions in preparation.' : 'Your petition.'}</p>
        </div>
        {staff && (
          <ButtonLink href="/cases/new" variant="primary">
            New case
          </ButtonLink>
        )}
      </div>
      <Card>
        <CardHeader title={`${cases.length} case${cases.length === 1 ? '' : 's'}`} />
        {cases.length === 0 ? (
          <Empty>No cases yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-medium">Beneficiary</th>
                <th className="px-5 py-2.5 font-medium">Field</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                {staff && <th className="px-5 py-2.5 text-right font-medium">Criteria likely met</th>}
                {staff && <th className="px-5 py-2.5 text-right font-medium">Open high-risk objections</th>}
                {staff && <th className="px-5 py-2.5 text-right font-medium">Agent cost</th>}
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/cases/${c.id}`} className="font-medium text-brand hover:underline">
                      {c.beneficiary_name}
                    </Link>
                    <div className="text-xs text-muted">{c.proposed_role} · {c.petitioner}</div>
                  </td>
                  <td className="px-5 py-3 text-muted">{c.field}</td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
                  </td>
                  {staff && (
                    <td className="px-5 py-3 text-right tabular-nums">
                      {c.likelyMet === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className={c.likelyMet >= 3 ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{c.likelyMet} / 8</span>
                      )}
                    </td>
                  )}
                  {staff && <td className="px-5 py-3 text-right tabular-nums">{c.objections ? c.highObjections : '—'}</td>}
                  {staff && <td className="px-5 py-3 text-right tabular-nums text-muted">{c.modelCalls ? `$${c.costUsd.toFixed(2)}` : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
