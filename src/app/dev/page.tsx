'use client';
import { useEffect, useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';
import { linkOneToMany } from '@/lib/schema/ops/relations';

export default function DevPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let { content: c, tableId: users } = addTable(emptyContent(), 80, 80);
    c = renameTable(c, users, 'users');
    const r = addTable(c, 480, 160); c = renameTable(r.content, r.tableId, 'orders');
    c = linkOneToMany(c, users, r.tableId).content;
    useEditorStore.getState().initialize({ id: 'dev', name: 'dev', tableCount: 2, createdAt: 0, updatedAt: 0 }, c);
    setReady(true);
  }, []);
  return ready ? <div style={{ position: 'fixed', inset: 0 }}><Canvas /></div> : null;
}
