import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, updateTableOptions, tableById } from '@/lib/schema/ops/tables';
import { addColumn, updateColumn } from '@/lib/schema/ops/columns';
import { addIndex, updateIndex } from '@/lib/schema/ops/keys';
import { linkOneToMany, linkManyToMany, addLogicalEdge } from '@/lib/schema/ops/relations';
import { canonicalize, semanticallyEqual } from '@/lib/schema/equal';
import { generateScript } from './generate';
import { parseDDL } from './parse';

function richContent() {
  let { content: c, tableId: users } = addTable(emptyContent(), 0, 0);
  c = renameTable(c, users, 'users');
  let r = addColumn(c, users); c = r.content;
  c = updateColumn(c, users, r.columnId, {
    name: 'email', type: { base: 'varchar', length: 255 }, nullable: false,
    charset: 'utf8mb4', collation: 'utf8mb4_bin', comment: "user's email",
  });
  r = addColumn(c, users); c = r.content;
  c = updateColumn(c, users, r.columnId, { name: 'kind', type: { base: 'enum', values: ['a', 'b'] }, default: { kind: 'literal', value: 'a' } });
  r = addColumn(c, users); c = r.content;
  c = updateColumn(c, users, r.columnId, {
    name: 'joined', type: { base: 'datetime', fsp: 6 }, nullable: false,
    default: { kind: 'current_timestamp', fsp: 6 }, onUpdateCurrentTimestamp: true, onUpdateFsp: 6,
  });
  r = addColumn(c, users); c = r.content;
  c = updateColumn(c, users, r.columnId, { name: 'home', type: { base: 'point', srid: 4326 }, nullable: false });
  c = updateTableOptions(c, users, { comment: 'people', autoIncrementStart: 500 });
  const ordersR = addTable(c, 400, 0); c = ordersR.content;
  c = renameTable(c, ordersR.tableId, 'orders');
  c = linkOneToMany(c, users, ordersR.tableId).content;
  c = linkManyToMany(c, users, ordersR.tableId).content;
  const t = tableById(c, users)!;
  const ixR = addIndex(c, users, 'index'); c = ixR.content;
  c = updateIndex(c, users, ixR.indexId, { columns: [{ columnId: t.columns[1].id, length: 20, order: 'DESC' }], visible: false });
  c = addLogicalEdge(c, { fromTableId: ordersR.tableId, toTableId: users, cardinality: 'm-m', label: 'soft' }).content;
  return c;
}

describe('round-trip', () => {
  it('generate → parse yields a semantically equal model', () => {
    const original = richContent();
    const script = generateScript(original);
    const { content: reparsed, issues } = parseDDL(script);
    expect(issues.filter(i => i.level === 'error')).toEqual([]);
    expect(canonicalize(reparsed)).toEqual(canonicalize(original));
    expect(semanticallyEqual(original, reparsed)).toBe(true);
  });
  it('detects difference', () => {
    const a = richContent();
    const { content: b } = parseDDL(generateScript(a));
    b.tables[0].columns[0].nullable = !b.tables[0].columns[0].nullable;
    expect(semanticallyEqual(a, b)).toBe(false);
  });
});
