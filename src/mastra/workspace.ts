import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalFilesystem, Workspace, WORKSPACE_TOOLS } from '@mastra/core/workspace';

/**
 * Per-case sandboxed workspace.
 *
 * Each pipeline run materializes its working files (exhibit page text,
 * verified claims, the criteria map, the draft) under
 *   .workspaces/<caseId>/<runId>/
 * Agents get file tools resolved per request to exactly that folder:
 * `contained` blocks path traversal and symlink escapes, `readOnly` blocks
 * writes, and destructive tools are switched off. One case can never see
 * another case's files.
 */
export const WORKSPACES_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.PILOT_WORKSPACES_DIR ?? '.workspaces');

export function runDir(caseId: string, runId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(caseId) || !/^[\w-]{1,64}$/.test(runId)) throw new Error('invalid workspace id');
  return path.join(/*turbopackIgnore: true*/ WORKSPACES_ROOT, caseId, runId);
}

export async function writeWorkspaceFile(caseId: string, runId: string, rel: string, content: string) {
  const base = runDir(caseId, runId);
  const target = path.resolve(/*turbopackIgnore: true*/ base, rel);
  if (!target.startsWith(base + path.sep)) throw new Error('path escapes workspace');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

export const caseWorkspace = new Workspace({
  id: 'case-workspace',
  name: 'Case workspace (read-only, per case)',
  filesystem: ({ requestContext }) => {
    const caseId = requestContext.get('caseId') as string | undefined;
    const runId = requestContext.get('runId') as string | undefined;
    if (!caseId || !runId) throw new Error('caseWorkspace requires caseId and runId in the request context');
    return new LocalFilesystem({ basePath: runDir(caseId, runId), contained: true, readOnly: true });
  },
  tools: {
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { enabled: false },
  },
});
