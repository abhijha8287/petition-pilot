'use client';

import { useMemo, useState, useTransition } from 'react';
import { reviewParagraph, signOff } from '@/app/(app)/cases/actions';
import { Badge, Button, cn } from '@/components/ui';
import type { CitedSentence } from '@/lib/citations/verify';
import { SourcePanel, type SourceSel } from './source-panel';

type Status = 'pending' | 'accepted' | 'edited' | 'rejected';
type Para = {
  id: string;
  status: Status;
  version: number;
  note: string | null;
  sentences: CitedSentence[];
  history: { version: number; status: Status; actor: string; at: string; note: string | null; text: string }[];
};
export type ReviewData = {
  caseId: string;
  runId: string;
  role: 'attorney' | 'paralegal' | 'client';
  locked: boolean;
  signoff: { at: string; by: string; sha: string; note: string | null } | null;
  exhibits: { label: string; title: string; pageCount: number }[];
  pages: Record<string, string>;
  sections: { id: string; heading: string; paragraphs: Para[] }[];
};

const statusTone = { pending: 'slate', accepted: 'green', edited: 'blue', rejected: 'red' } as const;

export function ReviewWorkspace({ data }: { data: ReviewData }) {
  const first = data.sections[0]?.paragraphs[0]?.sentences[0]?.citations[0];
  const [sel, setSel] = useState<SourceSel>(first ? { label: first.exhibitLabel, page: first.page, quote: first.quote } : { label: data.exhibits[0]?.label ?? 'A', page: 1 });
  const all = data.sections.flatMap((s) => s.paragraphs);
  const resolved = all.filter((p) => p.status !== 'pending').length;

  return (
    <div className="space-y-3">
      <SignoffBar data={data} resolved={resolved} total={all.length} />
      <div className="grid h-[calc(100vh-290px)] min-h-[560px] grid-cols-1 overflow-hidden rounded-lg border border-line bg-white shadow-sm lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="hidden border-r border-line lg:block">
          <SourcePanel exhibits={data.exhibits} pages={data.pages} sel={sel} onSelect={setSel} />
        </div>
        <div className="overflow-y-auto bg-paper px-6 py-5">
          {data.sections.map((s) => (
            <section key={s.id} className="mb-8">
              <h3 className="mb-3 font-serif text-lg font-semibold text-ink">{s.heading}</h3>
              <div className="space-y-3">
                {s.paragraphs.map((p) => (
                  <ParagraphCard key={p.id} p={p} locked={data.locked} onCite={setSel} activeQuote={sel.quote} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function ParagraphCard({ p, locked, onCite, activeQuote }: { p: Para; locked: boolean; onCite: (s: SourceSel) => void; activeQuote?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CitedSentence[]>(p.sentences);
  const [note, setNote] = useState(p.note ?? '');
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const act = (status: Status, sentences?: CitedSentence[]) =>
    start(async () => {
      const r = await reviewParagraph({ paragraphId: p.id, status, sentences, note });
      if (r.ok) {
        setEditing(false);
        setError(undefined);
      } else setError(r.error);
    });

  return (
    <div className={cn('rounded-lg border bg-white shadow-sm', p.status === 'rejected' ? 'border-red-200 opacity-70' : p.status === 'pending' ? 'border-line' : 'border-emerald-200')}>
      <div className="px-4 pt-3.5 pb-3">
        {editing ? (
          <div className="space-y-2">
            {draft.map((s, i) => (
              <div key={i} className="flex gap-2">
                <textarea
                  value={s.text}
                  onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  rows={2}
                  className="flex-1 rounded-md border border-line px-2 py-1.5 font-serif text-[15px] focus:border-brand focus:outline-none"
                />
                <div className="flex w-28 shrink-0 flex-col items-start gap-1">
                  {s.citations.map((c, k) => (
                    <span key={k} className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] text-brand">
                      Ex. {c.exhibitLabel} p.{c.page}
                    </span>
                  ))}
                  <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="text-xs text-red-700 hover:underline">
                    remove sentence
                  </button>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted">Sources stay attached to each sentence. To drop a source, remove the sentence it supports.</p>
          </div>
        ) : (
          <p className={cn('font-serif text-[15px] leading-relaxed text-slate-800', p.status === 'rejected' && 'line-through')}>
            {p.sentences.map((s, i) => (
              <span key={i}>
                {s.text}
                {s.citations.map((c, k) => (
                  <button
                    key={k}
                    onClick={() => onCite({ label: c.exhibitLabel, page: c.page, quote: c.quote })}
                    title={`“${c.quote}”`}
                    className={cn(
                      'mx-0.5 rounded px-1 align-super font-mono text-[10px] transition-colors',
                      activeQuote === c.quote ? 'bg-yellow-300 text-ink' : 'bg-brand-soft text-brand hover:bg-indigo-200',
                    )}
                  >
                    {c.exhibitLabel}·{c.page}
                  </button>
                ))}{' '}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-slate-50/60 px-4 py-2">
        <Badge tone={statusTone[p.status]}>{p.status}</Badge>
        <span className="text-xs text-muted">v{p.version}</span>
        <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
          {showHistory ? 'hide history' : `history (${p.history.length})`}
        </button>
        <div className="flex-1" />
        {!locked && (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Review note (optional)"
              className="w-48 rounded-md border border-line bg-white px-2 py-1 text-xs focus:border-brand focus:outline-none"
            />
            {editing ? (
              <>
                <Button variant="ghost" onClick={() => (setEditing(false), setDraft(p.sentences))} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={() => act('edited', draft)} disabled={pending || draft.length === 0}>
                  Save edit
                </Button>
              </>
            ) : (
              <>
                <Button variant="danger" onClick={() => act('rejected')} disabled={pending}>
                  Reject
                </Button>
                <Button variant="secondary" onClick={() => setEditing(true)} disabled={pending}>
                  Edit
                </Button>
                <Button variant="success" onClick={() => act('accepted')} disabled={pending || p.status === 'accepted'}>
                  Accept
                </Button>
              </>
            )}
          </>
        )}
      </div>
      {error && <div className="border-t border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-800">{error}</div>}
      {showHistory && (
        <ol className="space-y-2 border-t border-line px-4 py-3">
          {p.history.map((h) => (
            <li key={h.version} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-muted">v{h.version}</span>
                <Badge tone={statusTone[h.status]}>{h.status}</Badge>
                <span className="font-medium">{h.actor}</span>
                <span className="text-muted">{new Date(h.at).toLocaleString()}</span>
              </div>
              {h.note && <div className="mt-0.5 text-muted">Note: {h.note}</div>}
              <div className="mt-1 line-clamp-2 font-serif text-slate-600">{h.text}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function SignoffBar({ data, resolved, total }: { data: ReviewData; resolved: number; total: number }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const pct = total ? Math.round((resolved / total) * 100) : 0;
  const ready = resolved === total && total > 0;
  const isAttorney = data.role === 'attorney';
  const hint = useMemo(() => {
    if (!isAttorney) return 'Only the attorney of record can sign off.';
    if (!ready) return `Resolve ${total - resolved} more paragraph${total - resolved === 1 ? '' : 's'} to enable sign-off.`;
    return 'Signing locks the draft and records a SHA-256 of the approved text.';
  }, [isAttorney, ready, total, resolved]);

  if (data.signoff) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <span className="font-semibold">Signed off</span>
        <span>
          by {data.signoff.by} on {new Date(data.signoff.at).toLocaleString()}
        </span>
        <span className="font-mono text-xs">sha256 {data.signoff.sha.slice(0, 16)}…</span>
        {data.signoff.note && <span className="italic">“{data.signoff.note}”</span>}
        <span className="ml-auto text-xs">The draft is locked. Edits are blocked in the database.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-white px-4 py-3 shadow-sm">
      <div className="min-w-56">
        <div className="flex justify-between text-xs">
          <span className="font-medium">Human checkpoint</span>
          <span className="tabular-nums text-muted">
            {resolved}/{total} paragraphs resolved
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="flex-1 text-xs text-muted">{error ? <span className="text-red-700">{error}</span> : hint}</p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={!isAttorney || !ready}
        placeholder="Sign-off note"
        className="w-56 rounded-md border border-line px-2 py-1.5 text-sm disabled:bg-slate-50"
      />
      <Button
        variant="success"
        disabled={!isAttorney || !ready || pending}
        onClick={() =>
          start(async () => {
            const r = await signOff(data.caseId, data.runId, note);
            setError(r.ok ? undefined : r.error);
          })
        }
      >
        {pending ? 'Signing…' : 'Sign off as attorney'}
      </Button>
    </div>
  );
}
