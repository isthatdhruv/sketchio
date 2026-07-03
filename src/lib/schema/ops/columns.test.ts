import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, tableById } from './tables';
import { addColumn, updateColumn, deleteColumn, moveColumn, togglePk, toggleNotNull,
         toggleAutoIncrement, toggleUnique, toggleIndex } from './columns';

const setup = () => {
  const { content, tableId } = addTable(emptyContent(), 0, 0);
  return { c: content, tid: tableId };
};

describe('column ops', () => {
  it('addColumn appends uniqued varchar', () => {
    let { c, tid } = setup();
    const r1 = addColumn(c, tid); c = r1.content;
    const r2 = addColumn(c, tid); c = r2.content;
    const t = tableById(c, tid)!;
    expect(t.columns[1]).toMatchObject({ name: 'new_column', nullable: true, type: { base: 'varchar', length: 255 } });
    expect(t.columns[2].name).toBe('new_column_2');
  });
  it('updateColumn sanitizes attributes on type change', () => {
    let { c, tid } = setup();
    const t0 = tableById(c, tid)!;
    c = updateColumn(c, tid, t0.columns[0].id, { type: { base: 'varchar', length: 40 } });
    const col = tableById(c, tid)!.columns[0];
    expect(col.unsigned).toBeUndefined();
    expect(col.autoIncrement).toBeUndefined();
  });
  it('literal default on json becomes expression', () => {
    let { c, tid } = setup();
    const r = addColumn(c, tid); c = r.content;
    c = updateColumn(c, tid, r.columnId, { type: { base: 'json' }, default: { kind: 'literal', value: 'json_array()' } });
    expect(tableById(c, tid)!.columns[1].default).toMatchObject({ kind: 'expression' });
  });
  it('deleteColumn cleans indexes and fks', () => {
    let { c, tid } = setup();
    const t0 = tableById(c, tid)!;
    const pkCol = t0.columns[0].id;
    const rb = addTable(c, 0, 0); c = rb.content;
    const child = tableById(c, rb.tableId)!;
    c = { ...c, tables: c.tables.map(t => t.id !== child.id ? t : { ...t, foreignKeys: [
      { id: 'f1', name: 'fk1', columnIds: [child.columns[0].id], refTableId: tid, refColumnIds: [pkCol] },
    ]}) };
    c = deleteColumn(c, tid, pkCol);
    const t = tableById(c, tid)!;
    expect(t.columns.length).toBe(0);
    expect(t.indexes.length).toBe(0);
    expect(tableById(c, rb.tableId)!.foreignKeys.length).toBe(0);
  });
  it('togglePk manages PRIMARY index and not-null', () => {
    let { c, tid } = setup();
    const r = addColumn(c, tid); c = r.content;
    c = togglePk(c, tid, r.columnId);
    let t = tableById(c, tid)!;
    expect(t.indexes.find(i => i.kind === 'primary')!.columns.length).toBe(2);
    expect(t.columns[1].nullable).toBe(false);
    c = togglePk(c, tid, r.columnId);
    c = togglePk(c, tid, t.columns[0].id);
    t = tableById(c, tid)!;
    expect(t.indexes.find(i => i.kind === 'primary')).toBeUndefined();
  });
  it('toggleUnique / toggleIndex create and remove named single-col indexes', () => {
    let { c, tid } = setup();
    const r = addColumn(c, tid); c = r.content;
    c = updateColumn(c, tid, r.columnId, { name: 'email' });
    c = toggleUnique(c, tid, r.columnId);
    c = toggleIndex(c, tid, r.columnId);
    let t = tableById(c, tid)!;
    expect(t.indexes.map(i => i.name)).toContain('uq_table_1_email');
    expect(t.indexes.map(i => i.name)).toContain('idx_table_1_email');
    c = toggleUnique(c, tid, r.columnId);
    t = tableById(c, tid)!;
    expect(t.indexes.map(i => i.name)).not.toContain('uq_table_1_email');
  });
  it('toggleNotNull flips, toggleAutoIncrement forces not-null, moveColumn reorders', () => {
    let { c, tid } = setup();
    const r = addColumn(c, tid); c = r.content;
    c = toggleNotNull(c, tid, r.columnId);
    expect(tableById(c, tid)!.columns[1].nullable).toBe(false);
    c = updateColumn(c, tid, r.columnId, { type: { base: 'int' }, nullable: true });
    c = toggleAutoIncrement(c, tid, r.columnId);
    expect(tableById(c, tid)!.columns[1]).toMatchObject({ autoIncrement: true, nullable: false });
    c = moveColumn(c, tid, r.columnId, -1);
    expect(tableById(c, tid)!.columns[0].id).toBe(r.columnId);
  });
});
