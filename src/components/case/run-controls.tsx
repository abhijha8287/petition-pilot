'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { resumeRun, startRun } from '@/app/(app)/cases/actions';

export function RunButton({ caseId, label = 'Run agents', disabled }: { caseId: string; label?: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-700">{error}</span>}
      <Button
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const r = await startRun(caseId);
            setError(r.ok ? undefined : r.error);
          })
        }
      >
        {pending ? 'Starting…' : label}
      </Button>
    </div>
  );
}

export function ResumeButton({ caseId, runId }: { caseId: string; runId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-700">{error}</span>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resumeRun(caseId, runId);
            setError(r.ok ? undefined : r.error);
          })
        }
      >
        {pending ? 'Resuming…' : 'Resume from last checkpoint'}
      </Button>
    </div>
  );
}

/** Polls the server while agents are working. */
export function AutoRefresh({ active, intervalMs = 2500 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
