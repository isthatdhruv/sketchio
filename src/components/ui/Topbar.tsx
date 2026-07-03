'use client';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { useEditorStore, undo, redo, type Tool } from '@/store/editorStore';
import { addTable } from '@/lib/schema/ops/tables';
import { autoLayout } from '@/lib/layout/autoLayout';
import { fitToContent, onCamera, screenToWorld, viewport, zoomAt } from '@/components/canvas/viewport';
import { signOutUser } from '@/lib/firebase/auth';
import { SaveIndicator } from './SaveIndicator';
import { ExportMenu } from './ExportMenu';

const TOOLS: Array<[Tool, string, string]> = [
  ['link-1m', '1:N', 'one-to-many: parent, then child'],
  ['link-11', '1:1', 'one-to-one: parent, then child'],
  ['link-mm', 'N:M', 'many-to-many: creates a junction table'],
  ['link-logical', '⇢', 'logical link (no DDL)'],
];

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch { /* private mode */ }
}

const canvasEl = () => document.getElementById('canvas');

export function Topbar({ onImport }: { onImport: () => void }) {
  const router = useRouter();
  const meta = useEditorStore(s => s.meta);
  const tool = useEditorStore(s => s.tool);
  const setTool = useEditorStore(s => s.setTool);
  const renameWorkspaceLocal = useEditorStore(s => s.renameWorkspaceLocal);
  const zoomPct = useSyncExternalStore(onCamera, () => Math.round(viewport.zoom * 100), () => 100);

  const addTableAtCenter = () => {
    const st = useEditorStore.getState();
    const canvas = canvasEl();
    if (!st.content || !canvas) return;
    const p = screenToWorld(canvas, canvas.getBoundingClientRect().left + canvas.clientWidth / 2,
      canvas.getBoundingClientRect().top + canvas.clientHeight / 2);
    const r = addTable(st.content, p.x - 110, p.y - 60);
    st.apply(r.content, { kind: 'table', tableId: r.tableId });
  };

  const tidy = () => {
    const st = useEditorStore.getState();
    const canvas = canvasEl();
    if (!st.content) return;
    const next = autoLayout(st.content);
    st.apply(next);
    if (canvas) fitToContent(canvas, next.tables);
  };

  return (
    <header className="flex items-center gap-2 px-3 h-12 border-b border-[var(--panel-border)] bg-[var(--panel)] relative z-[140]">
      <button className="text-[13px] font-bold text-[var(--accent)]" title="back to dashboard"
        onClick={() => router.push('/dashboard')}>Sketchio</button>
      <span className="text-[var(--faint)]">/</span>
      <span className="text-[13px] font-mono outline-none rounded px-1 focus:bg-[var(--accent-soft)]"
        contentEditable suppressContentEditableWarning spellCheck={false}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
        onBlur={e => {
          const v = (e.target.textContent ?? '').trim();
          if (v && v !== meta?.name) renameWorkspaceLocal(v);
          else e.target.textContent = meta?.name ?? '';
        }}>{meta?.name ?? ''}</span>
      <SaveIndicator />
      <span className="w-px self-stretch my-2.5 bg-[var(--panel-border)] mx-1" />
      <button className="kbtn" onClick={addTableAtCenter}>+ Table</button>
      {TOOLS.map(([t, label, title]) => (
        <button key={t} className={`kbtn${tool === t ? ' cur' : ''}`} title={title}
          onClick={() => setTool(tool === t ? 'select' : t)}>{label}</button>
      ))}
      <span className="w-px self-stretch my-2.5 bg-[var(--panel-border)] mx-1" />
      <button className="kbtn" title="undo (ctrl+z)" onClick={() => undo()}>↶</button>
      <button className="kbtn" title="redo (ctrl+shift+z)" onClick={() => redo()}>↷</button>
      <button className="kbtn" title="auto-layout" onClick={tidy}>Tidy</button>
      <button className="kbtn" onClick={() => {
        const st = useEditorStore.getState(); const canvas = canvasEl();
        if (canvas && st.content) fitToContent(canvas, st.content.tables);
      }}>Fit</button>
      <div className="flex items-center">
        <button className="kbtn" style={{ borderRadius: '7px 0 0 7px' }} onClick={() => {
          const c = canvasEl(); if (c) zoomAt(c, c.clientWidth / 2, c.clientHeight / 2, 1 / 1.15);
        }}>−</button>
        <span className="text-[11px] font-mono text-[var(--muted)] border-y border-[var(--panel-border)] px-1.5 py-[5px] min-w-11 text-center bg-[var(--panel-2)]">{zoomPct}%</span>
        <button className="kbtn" style={{ borderRadius: '0 7px 7px 0' }} onClick={() => {
          const c = canvasEl(); if (c) zoomAt(c, c.clientWidth / 2, c.clientHeight / 2, 1.15);
        }}>+</button>
      </div>
      <span className="flex-1" />
      <button className="kbtn" onClick={onImport}>Import</button>
      <ExportMenu />
      <button className="kbtn" onClick={toggleTheme}>Theme</button>
      <button className="kbtn" onClick={async () => { await signOutUser(); router.replace('/login'); }}>Sign out</button>
    </header>
  );
}
