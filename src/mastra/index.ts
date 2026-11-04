import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import { agents } from './agents';
import { casePipeline } from './workflows/case-pipeline';

/**
 * Single Mastra instance shared by the Next.js server, scripts and evals.
 * Workflow snapshots live in the same Supabase Postgres, in their own schema.
 */
function createMastra() {
  return new Mastra({
    agents,
    workflows: { casePipeline },
    storage: new PostgresStore({
      id: 'exhibit-a-store',
      connectionString: process.env.DATABASE_URL!,
      schemaName: 'mastra',
    }),
    logger: new PinoLogger({ name: 'exhibit-a', level: process.env.NODE_ENV === 'production' ? 'info' : 'warn' }),
  });
}

// Reuse one instance across hot reloads in development.
const globalForMastra = globalThis as unknown as { mastra?: ReturnType<typeof createMastra> };
export const mastra = globalForMastra.mastra ?? createMastra();

if (process.env.NODE_ENV !== 'production') globalForMastra.mastra = mastra;
