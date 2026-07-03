// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Inspector } from './Inspector';
import { ValidationPanel } from './ValidationPanel';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';

beforeEach(() => {
  const { content: c, tableId } = addTable(emptyContent(), 0, 0);
  useEditorStore.getState().initialize(
    { id: 'w', name: 'w', tableCount: 1, createdAt: 0, updatedAt: 0 },
    renameTable(c, tableId, 'users'));
  useEditorStore.getState().setSelection({ kind: 'table', tableId });
});

describe('SqlPreview', () => {
  it('renders live CREATE TABLE for the selected table', () => {
    render(<Inspector />);
    expect(screen.getByText(/CREATE TABLE `users`/)).toBeTruthy();
  });
});

describe('ValidationPanel', () => {
  it('surfaces duplicate table names', () => {
    const st = useEditorStore.getState();
    let c = st.content!;
    const r = addTable(c, 0, 0);
    c = renameTable(r.content, r.tableId, 'users');
    st.apply(c);
    render(<ValidationPanel />);
    expect(screen.getByText(/2 issues?/)).toBeTruthy();
  });
});
