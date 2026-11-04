// Smoke test: the judge model returns schema-valid structured output.
import { z } from 'zod';
import { goldenLabeler } from '../../evals/lib/judges';
import { callAgent } from '../../src/mastra/runtime';

const out = await callAgent(null, 'smoke', goldenLabeler, 'Reply about a toy case: field "robotics", one ground about awards.', z.object({ field: z.string(), grounds: z.array(z.object({ criterion: z.string() })).max(3) }));
console.log(JSON.stringify(out));
process.exit(0);
