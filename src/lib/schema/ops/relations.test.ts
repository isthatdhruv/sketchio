import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, tableById } from './tables';
import { togglePk, addColumn, updateColumn } from './columns';
import { linkOneToMany, linkOneToOne, linkManyToMany, addLogicalEdge, deleteLogicalEdge } from './relations';

const twoTables = () => {
  let { content: c, tableId: users } = addTable(emptyContent(), 0, 0);
  c = renameTable(c, users, 'users');
  const r = addTable(c, 400, 0);
  c = renameTable(r.content, r.tableId, 'orders');
  return { c, users, orders: r.tableId };
};

describe('relationship tools', () => {
  it('1:N creates typed fk column, index, constraint', () => {
    const { c, users, orders } = twoTables();
    const { content } = linkOneToMany(c, users, orders);
    const child = tableById(content, orders)!;
    const fkCol = child.columns.find(x => x.name === 'users_id')!;
    expect(fkCol).toMatchObject({ nullable: false, unsigned: true, type: { base: 'int' } });
    expect(child.indexes.some(ix => ix.kind === 'index' && ix.columns[0].columnId === fkCol.id)).toBe(true);
    expect(child.foreignKeys[0]).toMatchObject({ refTableId: users, name: 'fk_orders_users' });
    expect(child.foreignKeys[0].columnIds).toEqual([fkCol.id]);
  });
  it('1:1 uses a unique index instead', () => {
    const { c, users, orders } = twoTables();
    const { content } = linkOneToOne(c, users, orders);
    const child = tableById(content, orders)!;
    const fkCol = child.columns.find(x => x.name === 'users_id')!;
    expect(child.indexes.some(ix => ix.kind === 'unique' && ix.columns[0].columnId === fkCol.id)).toBe(true);
  });
  it('composite parent pk produces one column per pk col', () => {
    let { c, users, orders } = twoTables();
    const r = addColumn(c, users); c = r.content;
    c = updateColumn(c, users, r.columnId, { name: 'tenant', type: { base: 'varchar', length: 20 } });
    c = togglePk(c, users, r.columnId);
    const { content } = linkOneToMany(c, users, orders);
    const child = tableById(content, orders)!;
    expect(child.columns.map(x => x.name)).toContain('users_id');
    expect(child.columns.map(x => x.name)).toContain('users_tenant');
    expect(child.foreignKeys[0].columnIds.length).toBe(2);
  });
  it('self-reference uniquifies the column name', () => {
    const { c, users } = twoTables();
    const { content } = linkOneToMany(c, users, users);
    const t = tableById(content, users)!;
    expect(t.columns.some(x => x.name === 'users_id')).toBe(true);
    expect(t.foreignKeys[0].refTableId).toBe(users);
  });
  it('N:M creates junction with composite pk and two fks', () => {
    const { c, users, orders } = twoTables();
    const { content, junctionTableId } = linkManyToMany(c, users, orders);
    const j = tableById(content, junctionTableId)!;
    expect(j.name).toBe('users_orders');
    expect(j.columns.map(x => x.name)).toEqual(['users_id', 'orders_id']);
    const pk = j.indexes.find(ix => ix.kind === 'primary')!;
    expect(pk.columns.length).toBe(2);
    expect(j.foreignKeys.length).toBe(2);
    expect(j.x).toBe(200);
  });
  it('logical edges add and delete', () => {
    const { c, users, orders } = twoTables();
    const { content, edgeId } = addLogicalEdge(c, { fromTableId: orders, toTableId: users, cardinality: 'm-1', label: 'soft ref' });
    expect(content.logicalEdges[0]).toMatchObject({ cardinality: 'm-1', label: 'soft ref' });
    expect(deleteLogicalEdge(content, edgeId).logicalEdges.length).toBe(0);
  });
});
