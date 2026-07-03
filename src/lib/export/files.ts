import type { WorkspaceContent, WorkspaceMeta } from '@/lib/schema/types';
import { normalizeContent } from '@/lib/firebase/workspaces';

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function workspaceToJson(meta: WorkspaceMeta, content: WorkspaceContent): string {
  return JSON.stringify({ app: 'sketchio', schemaVersion: content.schemaVersion, name: meta.name, content }, null, 2);
}

export function jsonToContent(text: string): { name: string; content: WorkspaceContent } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Not valid JSON.'); }
  const obj = parsed as { name?: unknown; content?: unknown };
  if (!obj || typeof obj !== 'object' || obj.content == null)
    throw new Error('Not a Sketchio workspace export (missing "content").');
  try {
    return { name: String(obj.name ?? 'imported'), content: normalizeContent(obj.content) };
  } catch (e) {
    throw new Error(`Workspace content invalid: ${e instanceof Error ? e.message : 'unknown shape'}`);
  }
}
