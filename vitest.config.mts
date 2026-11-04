import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'vitest/config';

try {
  loadEnvFile('.env.local');
} catch {
  // CI provides env vars directly
}

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), 'server-only': path.resolve(import.meta.dirname, 'tests/server-only-stub.ts') } },
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'evals/**/*.test.ts'], testTimeout: 30_000, fileParallelism: false },
});
