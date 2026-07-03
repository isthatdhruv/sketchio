import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, tableById } from './tables';
import { addIndex, updateIndex, deleteIndex, addForeignKey, updateForeignKey, deleteForeignKey } from './keys';

const setup2 = () => {
  const { content: c, tableId: a } = addTable(emptyContent(), 0, 0);
  const rb = addTable(c, 300, 0);
  return { c: rb.content, a, b: rb.tableId };
};

describe('index ops', () => {
  it('addIndex names by kind and refuses second primary', () => {
    let { c, a } = setup2();
    const r1 = addIndex(c, a, 'unique'); c = r1.content;
    const r2 = addIndex(c, a, 'fulltext'); c = r2.content;
    const t = tableById(c, a)!;
    expect(t.indexes.map(i => i.name)).toEqual(['PRIMARY', 'uq_table_1_1', 'ft_table_1_1']);
    const r3 = addIndex(c, a, 'primary');
    expect(r3.content).toBe(c);
  });
  it('update/delete index', () => {
    let { c, a } = setup2();
    const r = addIndex(c, a, 'index'); c = r.content;
    const t0 = tableById(c, a)!;
    c = updateIndex(c, a, r.indexId, { name: 'idx_custom', columns: [{ columnId: t0.columns[0].id, length: 10, order: 'DESC' }], visible: false });
    const ix = tableById(c, a)!.indexes.find(i => i.id === r.indexId)!;
    expect(ix).toMatchObject({ name: 'idx_custom', visible: false });
    expect(ix.columns[0]).toMatchObject({ length: 10, order: 'DESC' });
    c = deleteIndex(c, a, r.indexId);
    expect(tableById(c, a)!.indexes.find(i => i.id === r.indexId)).toBeUndefined();
  });
});

describe('fk ops', () => {
  it('addForeignKey auto-names globally unique constraints', () => {
    let { c, a, b } = setup2();
    const ta = tableById(c, a)!, tb = tableById(c, b)!;
    const r1 = addForeignKey(c, b, { columnIds: [tb.columns[0].id], refTableId: a, refColumnIds: [ta.columns[0].id] });
    c = r1.content;
    const r2 = addForeignKey(c, b, { columnIds: [tb.columns[0].id], refTableId: a, refColumnIds: [ta.columns[0].id] });
    c = r2.content;
    const names = tableById(c, b)!.foreignKeys.map(f => f.name);
    expect(names).toEqual(['fk_table_2_table_1', 'fk_table_2_table_1_2']);
  });
  it('update and delete fk', () => {
    let { c, a, b } = setup2();
    const ta = tableById(c, a)!, tb = tableById(c, b)!;
    const r = addForeignKey(c, b, { columnIds: [tb.columns[0].id], refTableId: a, refColumnIds: [ta.columns[0].id] });
    c = r.content;
    c = updateForeignKey(c, b, r.fkId, { onDelete: 'CASCADE', onUpdate: 'SET NULL' });
    expect(tableById(c, b)!.foreignKeys[0]).toMatchObject({ onDelete: 'CASCADE', onUpdate: 'SET NULL' });
    c = deleteForeignKey(c, b, r.fkId);
    expect(tableById(c, b)!.foreignKeys.length).toBe(0);
  });
});
