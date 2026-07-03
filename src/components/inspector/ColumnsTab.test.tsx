// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from './Inspector';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable, tableById } from '@/lib/schema/ops/tables';

let tid = '';
beforeEach(() => {
  const { content: c, tableId } = addTable(emptyContent(), 0, 0);
  tid = tableId;
  const named = renameTable(c, tableId, 'users');
  useEditorStore.getState().initialize({ id: 'w', name: 'w', tableCount: 1, createdAt: 0, updatedAt: 0 }, named);
  useEditorStore.getState().setSelection({ kind: 'table', tableId });
});

const expandFirstColumn = () => fireEvent.click(screen.getByRole('button', { name: /^id/ }));
const typeSelect = () => screen.getByLabelText('type of id') as HTMLSelectElement;
const col0 = () => tableById(useEditorStore.getState().content!, tid)!.columns[0];

describe('ColumnsTab', () => {
  it('type change to decimal seeds precision/scale and keeps unsigned allowed', () => {
    render(<Inspector />);
    expandFirstColumn();
    fireEvent.change(typeSelect(), { target: { value: 'decimal' } });
    expect(col0().type).toMatchObject({ base: 'decimal', precision: 10, scale: 2 });
    const unsigned = screen.getByLabelText('UNSIGNED') as HTMLInputElement;
    expect(unsigned.disabled).toBe(false);
  });
  it('type change to varchar seeds length 255 and disables UNSIGNED', () => {
    render(<Inspector />);
    expandFirstColumn();
    fireEvent.change(typeSelect(), { target: { value: 'varchar' } });
    expect(col0().type).toMatchObject({ base: 'varchar', length: 255 });
    expect(col0().unsigned).toBeUndefined();
    const unsigned = screen.getByLabelText('UNSIGNED') as HTMLInputElement;
    expect(unsigned.disabled).toBe(true);
  });
  it('enum values editor adds values', () => {
    render(<Inspector />);
    expandFirstColumn();
    fireEvent.change(typeSelect(), { target: { value: 'enum' } });
    const input = screen.getByLabelText('add enum value');
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(col0().type.values).toEqual(['a']);
  });
});
