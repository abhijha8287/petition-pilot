type StepEvent = { kind: string; step: string; latency_ms?: number | null };

/**
 * Compute time for a run: the duration of the last successful completion of
 * each step. Unlike first-to-last timestamps, this ignores time the run spent
 * idle between a failure and its resume, or waiting for the attorney.
 */
export function activeSeconds(events: StepEvent[]) {
  const latest = new Map<string, number>();
  for (const e of events) if (e.kind === 'step_end' && e.latency_ms != null) latest.set(e.step, e.latency_ms);
  return [...latest.values()].reduce((s, ms) => s + ms, 0) / 1000;
}

/** 42 -> "42 s", 770 -> "12.8 min", 23677 -> "6 h 35 min". */
export function formatDuration(seconds: number) {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
}
