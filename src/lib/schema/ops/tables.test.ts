import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, deleteTable, duplicateTable, moveTable, tableById } from './tables';
import { uniqueName } from '../naming';

describe('uniqueName', () => {
  it('suffixes collisions', () => {
    expect(uniqueName('t', [])).toBe('t');
    expect(uniqueName('t', ['t'])).toBe('t_2');
    expect(uniqueName('t', ['t', 't_2'])).toBe('t_3');
  });
});

describe('table ops', () => {
  it('addTable creates pk id column and unique names', () => {
    let { content: c, tableId: a } = addTable(emptyContent(), 10, 20);
    const r2 = addTable(c, 50, 60); c = r2.content;
    const t1 = tableById(c, a)!, t2 = tableById(c, r2.tableId)!;
    expect(t1.name).toBe('table_1');
    expect(t2.name).toBe('table_2');
    expect(t1.columns[0]).toMatchObject({ name: 'id', nullable: false, autoIncrement: true, unsigned: true });
    expect(t1.indexes[0]).toMatchObject({ kind: 'primary', name: 'PRIMARY' });
    expect(t1.indexes[0].columns[0].columnId).toBe(t1.columns[0].id);
    expect(t1.x).toBe(10);
  });
  it('is immutable', () => {
    const c0 = emptyContent();
    const { content: c1 } = addTable(c0, 0, 0);
    expect(c0.tables.length).toBe(0);
    expect(c1.tables.length).toBe(1);
  });
  it('deleteTable cascades fks and logical edges', () => {
    let { content: c, tableId: a } = addTable(emptyContent(), 0, 0);
    const rb = addTable(c, 0, 0); c = rb.content;
    const ta = tableById(c, a)!, tb = tableById(c, rb.tableId)!;
    c = { ...c, tables: c.tables.map(t => t.id !== tb.id ? t : { ...t, foreignKeys: [
      { id: 'f1', name: 'fk_x', columnIds: [t.columns[0].id], refTableId: a, refColumnIds: [ta.columns[0].id] },
    ]}), logicalEdges: [{ id: 'l1', fromTableId: a, toTableId: tb.id, cardinality: 'm-1' as const }] };
    c = deleteTable(c, a);
    expect(c.tables.length).toBe(1);
    expect(c.tables[0].foreignKeys.length).toBe(0);
    expect(c.logicalEdges.length).toBe(0);
  });
  it('duplicateTable remaps ids and drops fks', () => {
    const { content: c, tableId: a } = addTable(emptyContent(), 0, 0);
    const orig = tableById(c, a)!;
    const dup = duplicateTable(c, a);
    const copy = tableById(dup.content, dup.tableId)!;
    expect(copy.name).toBe('table_1_copy');
    expect(copy.columns[0].id).not.toBe(orig.columns[0].id);
    expect(copy.indexes[0].columns[0].columnId).toBe(copy.columns[0].id);
    expect(copy.foreignKeys.length).toBe(0);
  });
  it('rename + move', () => {
    let { content: c, tableId: a } = addTable(emptyContent(), 0, 0);
    c = renameTable(c, a, 'users');
    c = moveTable(c, a, 99, 77);
    expect(tableById(c, a)).toMatchObject({ name: 'users', x: 99, y: 77 });
  });
});
