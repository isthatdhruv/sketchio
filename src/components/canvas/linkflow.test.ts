// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { handleNodePick } from './interactions';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable, tableById } from '@/lib/schema/ops/tables';

let users = '', orders = '';
beforeEach(() => {
  let { content: c, tableId: u } = addTable(emptyContent(), 0, 0);
  c = renameTable(c, u, 'users');
  const r = addTable(c, 400, 0); c = renameTable(r.content, r.tableId, 'orders');
  users = u; orders = r.tableId;
  useEditorStore.getState().initialize({ id: 'w', name: 'w', tableCount: 2, createdAt: 0, updatedAt: 0 }, c);
});

describe('handleNodePick', () => {
  it('1:N flow: first pick is parent, second creates the fk', () => {
    const st = useEditorStore.getState();
    st.setTool('link-1m');
    handleNodePick(users);
    expect(useEditorStore.getState().linkSource).toBe(users);
    handleNodePick(orders);
    const s2 = useEditorStore.getState();
    expect(tableById(s2.content!, orders)!.foreignKeys.length).toBe(1);
    expect(s2.tool).toBe('select');
    expect(s2.linkSource).toBeNull();
  });
  it('N:M creates a junction table and selects it', () => {
    useEditorStore.getState().setTool('link-mm');
    handleNodePick(users);
    handleNodePick(orders);
    const s = useEditorStore.getState();
    expect(s.content!.tables.length).toBe(3);
    expect(s.selection).toMatchObject({ kind: 'table' });
  });
  it('logical link creates an annotation edge', () => {
    useEditorStore.getState().setTool('link-logical');
    handleNodePick(orders);
    handleNodePick(users);
    const s = useEditorStore.getState();
    expect(s.content!.logicalEdges.length).toBe(1);
    expect(s.selection.kind).toBe('edge');
  });
});
