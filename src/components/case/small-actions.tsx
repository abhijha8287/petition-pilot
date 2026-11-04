'use client';

import { useState, useTransition } from 'react';
import { answerQuestion, triageObjection, uploadExhibit } from '@/app/(app)/cases/actions';
import { Button } from '@/components/ui';

export function TriageButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const set = (s: 'open' | 'addressed' | 'dismissed') => start(async () => void (await triageObjection(id, s)));
  return (
    <div className="flex gap-1.5">
      {status !== 'addressed' && (
        <Button variant="secondary" disabled={pending} onClick={() => set('addressed')}>
          Mark addressed
        </Button>
      )}
      {status !== 'dismissed' && (
        <Button variant="ghost" disabled={pending} onClick={() => set('dismissed')}>
          Dismiss
        </Button>
      )}
      {status !== 'open' && (
        <Button variant="ghost" disabled={pending} onClick={() => set('open')}>
          Reopen
        </Button>
      )}
    </div>
  );
}

export function AnswerForm({ id, initial }: { id: string; initial?: string | null }) {
  const [value, setValue] = useState(initial ?? '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <div className="mt-2 flex gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Your answer (you can also upload the document under Documents)"
        className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
      />
      <div className="flex flex-col items-end gap-1">
        <Button
          disabled={pending || !value.trim()}
          onClick={() =>
            start(async () => {
              const r = await answerQuestion(id, value);
              setMsg(r.ok ? 'Saved' : r.error);
            })
          }
        >
          Save
        </Button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </div>
  );
}

export function UploadForm({ caseId }: { caseId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await uploadExhibit(caseId, fd);
          setMsg(r.ok ? 'Uploaded. Re-run the agents to include it.' : r.error);
        })
      }
      className="flex flex-wrap items-end gap-3 px-5 py-4"
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">PDF</span>
        <input name="file" type="file" accept="application/pdf" required className="text-sm" />
      </label>
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">Title</span>
        <input name="title" placeholder="e.g. Letter confirming peer review for SOSD 2025" className="w-full rounded-md border border-line px-2 py-1.5 text-sm" />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? 'Uploading…' : 'Upload exhibit'}
      </Button>
      {msg && <p className="w-full text-xs text-muted">{msg}</p>}
    </form>
  );
}
