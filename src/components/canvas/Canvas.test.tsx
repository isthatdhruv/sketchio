// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Canvas } from './Canvas';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';

beforeEach(() => {
  let { content: c, tableId } = addTable(emptyContent(), 10, 10);
  c = renameTable(c, tableId, 'users');
  useEditorStore.getState().initialize({ id: 'w', name: 'w', tableCount: 1, createdAt: 0, updatedAt: 0 }, c);
});

describe('Canvas', () => {
  it('renders table nodes with pk badge and type', () => {
    render(<Canvas />);
    expect(screen.getByText('users')).toBeTruthy();
    expect(screen.getByText('id')).toBeTruthy();
    expect(screen.getByText('PK')).toBeTruthy();
    expect(screen.getByText('int')).toBeTruthy();
  });
});

describe('inline commits', () => {
  it('renames table on blur commit', async () => {
    const { commitInlineEdit } = await import('./interactions');
    render(<Canvas />);
    const name = screen.getByText('users');
    name.textContent = 'customers';
    commitInlineEdit(name as HTMLElement);
    expect(useEditorStore.getState().content!.tables[0].name).toBe('customers');
  });
  it('empty rename is rejected', async () => {
    const { commitInlineEdit } = await import('./interactions');
    render(<Canvas />);
    const name = screen.getByText('users');
    name.textContent = '   ';
    commitInlineEdit(name as HTMLElement);
    expect(useEditorStore.getState().content!.tables[0].name).toBe('users');
  });
});
