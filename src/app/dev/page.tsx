'use client';
import { useEffect, useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { Inspector } from '@/components/inspector/Inspector';
import { ValidationPanel } from '@/components/inspector/ValidationPanel';
import { ConfirmHost } from '@/components/ui/ConfirmDialog';
import { useEditorStore, type Tool } from '@/store/editorStore';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';
import { linkOneToMany } from '@/lib/schema/ops/relations';

const TOOLS: Array<[Tool, string]> = [
  ['select', 'Select'], ['link-1m', '1:N'], ['link-11', '1:1'], ['link-mm', 'N:M'], ['link-logical', 'Logical'],
];

export default function DevPage() {
  const [ready, setReady] = useState(false);
  const tool = useEditorStore(s => s.tool);
  const setTool = useEditorStore(s => s.setTool);
  useEffect(() => {
    let { content: c, tableId: users } = addTable(emptyContent(), 80, 80);
    c = renameTable(c, users, 'users');
    const r = addTable(c, 480, 160); c = renameTable(r.content, r.tableId, 'orders');
    c = linkOneToMany(c, users, r.tableId).content;
    useEditorStore.getState().initialize({ id: 'dev', name: 'dev', tableCount: 2, createdAt: 0, updatedAt: 0 }, c);
    setReady(true);
  }, []);
  if (!ready) return null;
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas />
      <div className="panel" style={{ top: 14, left: 14, padding: 8, display: 'flex', gap: 6 }}>
        {TOOLS.map(([t, label]) => (
          <button key={t} className={`kbtn${tool === t ? ' cur' : ''}`} onClick={() => setTool(t)}>{label}</button>
        ))}
        <button className="kbtn" onClick={() => {
          const st = useEditorStore.getState();
          if (st.content) { const r = addTable(st.content, 200, 300); st.apply(r.content, { kind: 'table', tableId: r.tableId }); }
        }}>+ Table</button>
      </div>
      <Inspector />
      <ValidationPanel />
      <ConfirmHost />
    </div>
  );
}
