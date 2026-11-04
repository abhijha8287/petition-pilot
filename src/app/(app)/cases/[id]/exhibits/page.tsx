import Link from 'next/link';
import { UploadForm } from '@/components/case/small-actions';
import { Badge, Card, CardHeader, Empty } from '@/components/ui';
import { findQuoteRange } from '@/lib/citations/highlight';
import { requireUser } from '@/lib/supabase/server';

export default async function ExhibitsPage({ params, searchParams }: PageProps<'/cases/[id]/exhibits'>) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const staff = profile?.role !== 'client';
  const { data: exhibits } = await supabase.from('exhibits').select('*').eq('case_id', id).order('label');
  const label = (typeof sp.label === 'string' ? sp.label : exhibits?.[0]?.label) ?? 'A';
  const page = Number(typeof sp.page === 'string' ? sp.page : 1) || 1;
  const quote = typeof sp.q === 'string' ? sp.q : undefined;
  const ex = exhibits?.find((e) => e.label === label);
  const { data: pageRow } = ex
    ? await supabase.from('exhibit_pages').select('content').eq('exhibit_id', ex.id).eq('page_no', page).maybeSingle()
    : { data: null };
  // Short-lived signed URL; storage RLS decides whether this user may read the file.
  const signed = ex ? await supabase.storage.from('exhibits').createSignedUrl(ex.storage_path, 300) : null;
  const text = pageRow?.content ?? '';
  const range = quote ? findQuoteRange(text, quote) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Card>
        <CardHeader title={staff ? 'Exhibits' : 'Your documents'} subtitle="Labels are how the petition cites each document." />
        {(exhibits ?? []).length === 0 ? (
          <Empty>No documents yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {(exhibits ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/cases/${id}/exhibits?label=${e.label}`} className={`flex items-start gap-3 px-5 py-3 hover:bg-slate-50 ${e.label === label ? 'bg-brand-soft/40' : ''}`}>
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-800 font-mono text-xs text-white">{e.label}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{e.title}</span>
                    <span className="text-xs text-muted">
                      {e.page_count || '?'} page{e.page_count === 1 ? '' : 's'}
                      {staff && e.doc_type !== 'other' && <> · {e.doc_type.replace('_', ' ')}</>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line">
          <UploadForm caseId={id} />
        </div>
      </Card>

      {ex ? (
        <Card>
          <CardHeader
            title={`Exhibit ${ex.label}: ${ex.title}`}
            subtitle={<span className="font-mono">sha256 {ex.sha256.slice(0, 16)}…</span>}
            action={
              <div className="flex items-center gap-2">
                {Array.from({ length: ex.page_count || 1 }, (_, i) => i + 1).map((p) => (
                  <Link key={p} href={`/cases/${id}/exhibits?label=${ex.label}&page=${p}`} className={`flex h-7 w-7 items-center justify-center rounded-md text-xs ${p === page ? 'bg-brand text-white' : 'hover:bg-slate-100'}`}>
                    {p}
                  </Link>
                ))}
                {signed?.data?.signedUrl && (
                  <a href={`${signed.data.signedUrl}#page=${page}`} target="_blank" rel="noreferrer" className="ml-2 text-xs font-medium text-brand hover:underline">
                    Open PDF
                  </a>
                )}
              </div>
            }
          />
          {quote && <div className="border-b border-line bg-yellow-50 px-5 py-2 text-xs">Highlighting the cited passage {range ? '' : <Badge tone="amber">matched after normalization</Badge>}</div>}
          <pre className="whitespace-pre-wrap px-6 py-5 font-serif text-[15px] leading-relaxed text-slate-800">
            {!text ? (
              <span className="text-muted">Text is extracted when the agents run.</span>
            ) : range ? (
              <>
                {text.slice(0, range[0])}
                <mark className="cite">{text.slice(range[0], range[1])}</mark>
                {text.slice(range[1])}
              </>
            ) : (
              text
            )}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
