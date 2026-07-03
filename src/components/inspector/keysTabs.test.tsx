// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from './Inspector';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable, tableById } from '@/lib/schema/ops/tables';
import { linkOneToMany } from '@/lib/schema/ops/relations';

let users = '', orders = '';
beforeEach(() => {
  let { content: c, tableId: u } = addTable(emptyContent(), 0, 0);
  c = renameTable(c, u, 'users');
  const r = addTable(c, 400, 0);
  c = renameTable(r.content, r.tableId, 'orders');
  c = linkOneToMany(c, u, r.tableId).content;
  users = u; orders = r.tableId;
  useEditorStore.getState().initialize({ id: 'w', name: 'w', tableCount: 2, createdAt: 0, updatedAt: 0 }, c);
  useEditorStore.getState().setSelection({ kind: 'table', tableId: orders });
});

describe('FksTab', () => {
  it('shows the constraint and edits ON DELETE', () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Foreign keys' }));
    fireEvent.click(screen.getByRole('button', { name: /fk_orders_users/ }));
    const onDelete = screen.getByLabelText('ON DELETE') as HTMLSelectElement;
    fireEvent.change(onDelete, { target: { value: 'CASCADE' } });
    const t = tableById(useEditorStore.getState().content!, orders)!;
    expect(t.foreignKeys[0].onDelete).toBe('CASCADE');
  });
});

describe('IndexesTab', () => {
  it('adds an index', () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Indexes' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add index' }));
    const t = tableById(useEditorStore.getState().content!, orders)!;
    expect(t.indexes.some(ix => ix.name.startsWith('idx_orders'))).toBe(true);
  });
});

describe('OptionsTab', () => {
  it('sets engine', () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'MyISAM' } });
    expect(tableById(useEditorStore.getState().content!, orders)!.engine).toBe('MyISAM');
  });
});
