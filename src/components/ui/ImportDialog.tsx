'use client';
import { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { autoLayout } from '@/lib/layout/autoLayout';
import { jsonToContent } from '@/lib/export/files';
import { confirmDanger } from './ConfirmDialog';
import { fitToContent } from '@/components/canvas/viewport';
import type { ParseIssue } from '@/lib/sql/parse';
import type { WorkspaceContent } from '@/lib/schema/types';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'sql' | 'json'>('sql');
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<ParseIssue[] | null>(null);
  const [pending, setPending] = useState<WorkspaceContent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const readFile = (f: File | undefined) => {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setText(String(rd.result ?? ''));
    rd.readAsText(f);
  };

  const parse = async () => {
    setBusy(true); setError(''); setIssues(null); setPending(null);
    try {
      if (tab === 'sql') {
        const { parseDDL } = await import('@/lib/sql/parse');
        const { content, issues } = parseDDL(text);
        if (!content.tables.length) { setError('No tables found in that script.'); setIssues(issues); }
        else { setPending(autoLayout(content)); setIssues(issues); }
      } else {
        const { content } = jsonToContent(text);
        setPending(content); setIssues([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally { setBusy(false); }
  };

  const applyImport = async () => {
    const st = useEditorStore.getState();
    if (!pending || !st.content) return;
    if (st.content.tables.length > 0 &&
        !(await confirmDanger('Importing replaces the current diagram. Continue?', 'Replace'))) return;
    st.apply({ ...pending, viewport: st.content.viewport });
    onClose();
    requestAnimationFrame(() => {
      const canvas = document.getElementById('canvas');
      const c = useEditorStore.getState().content;
      if (canvas && c) fitToContent(canvas, c.tables);
    });
  };

  const badge = (level: ParseIssue['level']) =>
    level === 'error' ? 'var(--danger)' : level === 'note' ? 'var(--muted)' : 'var(--warn)';

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center"
      style={{ background: 'color-mix(in srgb, #0b0f16 55%, transparent)' }}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="panel relative w-[560px] max-w-[calc(100vw-40px)] max-h-[80vh] flex flex-col p-4">
        <div className="flex items-center gap-2 mb-3">
          <b className="text-sm">Import schema</b>
          <div className="flex gap-1 ml-3">
            <button className={`kbtn${tab === 'sql' ? ' cur' : ''}`} onClick={() => setTab('sql')}>SQL dump</button>
            <button className={`kbtn${tab === 'json' ? ' cur' : ''}`} onClick={() => setTab('json')}>Workspace JSON</button>
          </div>
          <button className="ml-auto text-[var(--muted)] hover:text-[var(--danger)]" onClick={onClose}>✕</button>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} spellCheck={false}
          placeholder={tab === 'sql' ? 'Paste CREATE TABLE statements…' : 'Paste a Sketchio .json export…'}
          className="w-full h-44 rounded-lg border border-[var(--panel-border)] bg-[var(--panel-2)] p-2 font-mono text-[11.5px] text-[var(--ink)] outline-none focus:border-[var(--accent)]" />
        <div className="flex items-center gap-2 mt-2">
          <label className="kbtn cursor-pointer">
            Choose file…
            <input type="file" accept={tab === 'sql' ? '.sql,text/plain' : '.json,application/json'} hidden
              onChange={e => readFile(e.target.files?.[0])} />
          </label>
          <button className="kbtn cur" disabled={!text.trim() || busy} onClick={parse}>
            {busy ? 'Parsing…' : 'Parse'}
          </button>
          {pending && (
            <button className="kbtn cur ml-auto" onClick={applyImport}>
              Apply — {pending.tables.length} table{pending.tables.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
        {error && <p className="text-[12px] mt-2" style={{ color: 'var(--danger)' }}>{error}</p>}
        {issues && issues.length > 0 && (
          <div className="mt-2 overflow-y-auto max-h-40 border-t border-[var(--panel-border)] pt-2">
            <p className="text-[11px] text-[var(--muted)] mb-1">{issues.length} notice{issues.length === 1 ? '' : 's'}:</p>
            {issues.map((i, k) => (
              <p key={k} className="text-[11px] font-mono" style={{ color: badge(i.level) }}>
                line {i.line} · {i.level} · {i.message}{i.statement ? ` — ${i.statement}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
