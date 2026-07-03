import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Viewport, WorkspaceContent, WorkspaceMeta } from '@/lib/schema/types';

export type Selection = { kind: 'none' } | { kind: 'table'; tableId: string } | { kind: 'edge'; edgeId: string };
export type Tool = 'select' | 'link-1m' | 'link-11' | 'link-mm' | 'link-logical';
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error';

interface EditorState {
  meta: WorkspaceMeta | null;
  content: WorkspaceContent | null;
  selection: Selection;
  tool: Tool;
  linkSource: string | null;
  saveStatus: SaveStatus;
  initialize(meta: WorkspaceMeta, content: WorkspaceContent): void;
  apply(next: WorkspaceContent, select?: Selection): void;
  setSelection(s: Selection): void;
  setTool(t: Tool): void;
  setLinkSource(id: string | null): void;
  setSaveStatus(s: SaveStatus): void;
  renameWorkspaceLocal(name: string): void;
  setViewportContent(vp: Viewport): void;
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set) => ({
      meta: null, content: null,
      selection: { kind: 'none' }, tool: 'select', linkSource: null, saveStatus: 'idle',
      initialize: (meta, content) => {
        set({ meta, content, selection: { kind: 'none' }, tool: 'select', linkSource: null, saveStatus: 'idle' });
        useEditorStore.temporal.getState().clear();
      },
      apply: (next, select) =>
        set(s => ({ content: next, saveStatus: 'dirty', ...(select ? { selection: select } : {}), meta: s.meta })),
      setSelection: selection => set({ selection }),
      setTool: tool => set({ tool, linkSource: null }),
      setLinkSource: linkSource => set({ linkSource }),
      setSaveStatus: saveStatus => set({ saveStatus }),
      renameWorkspaceLocal: name => set(s => ({ meta: s.meta ? { ...s.meta, name } : null, saveStatus: 'dirty' })),
      setViewportContent: vp =>
        set(s => (s.content ? { content: { ...s.content, viewport: vp }, saveStatus: 'dirty' } : {})),
    }),
    {
      partialize: s => ({ content: s.content }),
      limit: 50,
      equality: (a, b) => a.content?.tables === b.content?.tables && a.content?.logicalEdges === b.content?.logicalEdges,
    },
  ),
);

export const undo = () => useEditorStore.temporal.getState().undo();
export const redo = () => useEditorStore.temporal.getState().redo();
