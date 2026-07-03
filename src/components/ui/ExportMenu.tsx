'use client';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { generateScript } from '@/lib/sql/generate';
import { downloadText, workspaceToJson } from '@/lib/export/files';

const slug = (s: string) => (s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace');

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);

  const run = async (fn: () => Promise<void> | void) => {
    setErr('');
    try { await fn(); setOpen(false); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Export failed.'); }
  };

  return (
    <div className="relative" ref={ref}>
      <button className="kbtn" onClick={() => setOpen(!open)}>Export ▾</button>
      {open && (
        <div className="panel" style={{ position: 'absolute', right: 0, top: '110%', padding: 8, minWidth: 190, zIndex: 300 }}>
          <button className="kbtn w-full mb-1" onClick={() => run(() => {
            const { meta, content } = useEditorStore.getState();
            if (!meta || !content) return;
            downloadText(`${slug(meta.name)}.sql`, generateScript(content), 'application/sql');
          })}>SQL script (.sql)</button>
          <button className="kbtn w-full mb-1" onClick={() => run(() => {
            const { meta, content } = useEditorStore.getState();
            if (!meta || !content) return;
            downloadText(`${slug(meta.name)}.json`, workspaceToJson(meta, content), 'application/json');
          })}>Workspace JSON</button>
          <button className="kbtn w-full" onClick={() => run(async () => {
            const { meta, content } = useEditorStore.getState();
            const world = document.getElementById('world');
            if (!meta || !content || !world) return;
            const { exportPng } = await import('@/lib/export/png');
            const blob = await exportPng(world, content.tables);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `${slug(meta.name)}.png`; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
          })}>PNG image</button>
          {err && <p className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>{err}</p>}
        </div>
      )}
    </div>
  );
}
