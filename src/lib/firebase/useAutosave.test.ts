// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutosave } from './useAutosave';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable } from '@/lib/schema/ops/tables';
import * as repo from './workspaces';

vi.mock('./workspaces', () => ({
  saveWorkspace: vi.fn(() => Promise.resolve()),
  contentByteSize: vi.fn(() => 100),
}));

const meta = { id: 'w1', name: 'ws', tableCount: 0, createdAt: 0, updatedAt: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(repo.saveWorkspace).mockClear();
  vi.mocked(repo.saveWorkspace).mockImplementation(() => Promise.resolve());
  useEditorStore.getState().initialize(meta, emptyContent());
});
afterEach(() => { vi.useRealTimers(); });

describe('useAutosave', () => {
  it('debounces to one save and transitions to saved', async () => {
    renderHook(() => useAutosave('u1', 'w1'));
    const s = useEditorStore.getState();
    s.apply(addTable(s.content!, 0, 0).content);
    const s2 = useEditorStore.getState();
    s2.apply(addTable(s2.content!, 10, 10).content);   // second edit within window
    await vi.advanceTimersByTimeAsync(2100);
    expect(repo.saveWorkspace).toHaveBeenCalledTimes(1);
    const [, , savedContent] = vi.mocked(repo.saveWorkspace).mock.calls[0];
    expect((savedContent as { tables: unknown[] }).tables.length).toBe(2);  // latest content won
    expect(useEditorStore.getState().saveStatus).toBe('saved');
  });
  it('save failure sets error status', async () => {
    vi.mocked(repo.saveWorkspace).mockImplementation(() => Promise.reject(new Error('boom')));
    renderHook(() => useAutosave('u1', 'w1'));
    const s = useEditorStore.getState();
    s.apply(addTable(s.content!, 0, 0).content);
    await vi.advanceTimersByTimeAsync(2100);
    expect(useEditorStore.getState().saveStatus).toBe('error');
  });
});
