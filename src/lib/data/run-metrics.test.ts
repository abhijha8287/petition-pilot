import { describe, expect, it } from 'vitest';
import { activeSeconds } from './run-metrics';

describe('activeSeconds', () => {
  it('sums the latest completion of each step and ignores idle gaps', () => {
    const events = [
      { kind: 'step_end', step: 'ingest', latency_ms: 2000 },
      { kind: 'error', step: 'draft', latency_ms: null },
      { kind: 'step_end', step: 'draft', latency_ms: 9000 },
      { kind: 'step_end', step: 'draft', latency_ms: 5000 }, // redone later: only the latest counts
      { kind: 'llm_call', step: 'draft', latency_ms: 4000 },
    ];
    expect(activeSeconds(events)).toBe(7);
  });
});

describe('formatDuration', () => {
  it('picks a readable unit', async () => {
    const { formatDuration } = await import('./run-metrics');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(770)).toBe('12.8 min');
    expect(formatDuration(23677)).toBe('6 h 35 min');
  });
});
