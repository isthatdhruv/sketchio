import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, undo, redo } from './editorStore';
import { emptyContent, addTable, moveTable } from '@/lib/schema/ops/tables';

const meta = { id: 'w1', name: 'ws', tableCount: 0, createdAt: 0, updatedAt: 0 };

beforeEach(() => {
  useEditorStore.getState().initialize(meta, emptyContent());
});

describe('editor store', () => {
  it('apply mutates content, marks dirty, supports undo/redo', () => {
    const s = useEditorStore.getState();
    const { content } = addTable(s.content!, 10, 10);
    s.apply(content);
    expect(useEditorStore.getState().content!.tables.length).toBe(1);
    expect(useEditorStore.getState().saveStatus).toBe('dirty');
    undo();
    expect(useEditorStore.getState().content!.tables.length).toBe(0);
    redo();
    expect(useEditorStore.getState().content!.tables.length).toBe(1);
  });
  it('each apply is exactly one undo step', () => {
    const s = useEditorStore.getState();
    const { content, tableId } = addTable(s.content!, 0, 0);
    s.apply(content);
    useEditorStore.getState().apply(moveTable(useEditorStore.getState().content!, tableId, 100, 0));
    undo();
    expect(useEditorStore.getState().content!.tables[0].x).toBe(0);
    undo();
    expect(useEditorStore.getState().content!.tables.length).toBe(0);
  });
  it('initialize clears history', () => {
    const s = useEditorStore.getState();
    const { content } = addTable(s.content!, 0, 0);
    s.apply(content);
    s.initialize(meta, emptyContent());
    undo();
    expect(useEditorStore.getState().content!.tables.length).toBe(0);
  });
  it('selection and tool transitions', () => {
    const s = useEditorStore.getState();
    s.setTool('link-1m');
    s.setLinkSource('t1');
    s.setTool('select');
    expect(useEditorStore.getState().linkSource).toBeNull();
  });
  it('viewport changes do not create undo entries', () => {
    const s = useEditorStore.getState();
    const { content } = addTable(s.content!, 0, 0);
    s.apply(content);
    useEditorStore.getState().setViewportContent({ x: 5, y: 5, zoom: 2 });
    expect(useEditorStore.getState().saveStatus).toBe('dirty');
    undo();
    expect(useEditorStore.getState().content!.tables.length).toBe(0);
  });
});
