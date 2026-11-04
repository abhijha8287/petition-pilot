'use client';

import { useEffect, useRef } from 'react';
import { findQuoteRange } from '@/lib/citations/highlight';

export type SourceSel = { label: string; page: number; quote?: string };

export function SourcePanel({
  exhibits,
  pages,
  sel,
  onSelect,
}: {
  exhibits: { label: string; title: string; pageCount: number }[];
  pages: Record<string, string>;
  sel: SourceSel;
  onSelect: (s: SourceSel) => void;
}) {
  const text = pages[`${sel.label}:${sel.page}`] ?? '';
  const range = sel.quote ? findQuoteRange(text, sel.quote) : null;
  const markRef = useRef<HTMLElement>(null);
  useEffect(() => {
    markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [sel.label, sel.page, sel.quote]);
  const ex = exhibits.find((e) => e.label === sel.label);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <select
          value={sel.label}
          onChange={(e) => onSelect({ label: e.target.value, page: 1 })}
          className="min-w-0 flex-1 truncate rounded-md border border-line bg-white px-2 py-1 text-sm"
        >
          {exhibits.map((e) => (
            <option key={e.label} value={e.label}>
              Exhibit {e.label}: {e.title}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-sm">
          {Array.from({ length: ex?.pageCount ?? 1 }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => onSelect({ label: sel.label, page: p })}
              className={`h-7 w-7 rounded-md text-xs ${p === sel.page ? 'bg-brand text-white' : 'hover:bg-slate-100'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {sel.quote && !range && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">Quote matched after normalization; exact highlight unavailable: “{sel.quote}”</div>
      )}
      <div className="flex-1 overflow-y-auto bg-white px-6 py-5">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
          Exhibit {sel.label} · page {sel.page}
        </div>
        <pre className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-slate-800">
          {range ? (
            <>
              {text.slice(0, range[0])}
              <mark ref={markRef} className="cite">
                {text.slice(range[0], range[1])}
              </mark>
              {text.slice(range[1])}
            </>
          ) : (
            text || 'No text extracted for this page.'
          )}
        </pre>
      </div>
    </div>
  );
}
