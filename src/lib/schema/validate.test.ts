import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, tableById } from './ops/tables';
import { addColumn, updateColumn, togglePk } from './ops/columns';
import { validateContent } from './validate';

const has = (issues: ReturnType<typeof validateContent>, idPrefix: string) =>
  issues.some(i => i.id.startsWith(idPrefix));

describe('validateContent', () => {
  it('accepts a clean schema', () => {
    const { content } = addTable(emptyContent(), 0, 0);
    expect(validateContent(content)).toEqual([]);
  });
  it('flags duplicate table names', () => {
    let { content: c } = addTable(emptyContent(), 0, 0);
    const r = addTable(c, 0, 0); c = r.content;
    c = renameTable(c, r.tableId, 'table_1');
    expect(has(validateContent(c), 'dup-table')).toBe(true);
  });
  it('flags missing pk and duplicate columns', () => {
    let { content: c, tableId } = addTable(emptyContent(), 0, 0);
    const t = tableById(c, tableId)!;
    c = togglePk(c, tableId, t.columns[0].id);
    const r = addColumn(c, tableId); c = r.content;
    c = updateColumn(c, tableId, r.columnId, { name: 'id' });
    const issues = validateContent(c);
    expect(has(issues, 'no-pk')).toBe(true);
    expect(has(issues, 'dup-col')).toBe(true);
  });
  it('flags AI not in key and empty enum', () => {
    let { content: c, tableId } = addTable(emptyContent(), 0, 0);
    const r = addColumn(c, tableId); c = r.content;
    c = updateColumn(c, tableId, r.columnId, { name: 'n', type: { base: 'int' }, autoIncrement: true });
    const r2 = addColumn(c, tableId); c = r2.content;
    c = updateColumn(c, tableId, r2.columnId, { name: 'e', type: { base: 'enum', values: [] } });
    const issues = validateContent(c);
    expect(has(issues, 'ai-no-key')).toBe(true);
    expect(has(issues, 'multi-ai')).toBe(true);
    expect(has(issues, 'enum-empty')).toBe(true);
  });
  it('flags fk type mismatch', () => {
    let { content: c, tableId: p } = addTable(emptyContent(), 0, 0);
    const rb = addTable(c, 0, 0); c = rb.content;
    const child = tableById(c, rb.tableId)!;
    const parent = tableById(c, p)!;
    c = updateColumn(c, rb.tableId, child.columns[0].id, { type: { base: 'varchar', length: 36 }, autoIncrement: undefined });
    c = { ...c, tables: c.tables.map(t => t.id !== rb.tableId ? t : { ...t, foreignKeys: [
      { id: 'f', name: 'fk_bad', columnIds: [child.columns[0].id], refTableId: p, refColumnIds: [parent.columns[0].id] },
    ]}) };
    expect(has(validateContent(c), 'fk-mismatch')).toBe(true);
  });
  it('flags 64+ char identifiers', () => {
    let { content: c, tableId } = addTable(emptyContent(), 0, 0);
    c = renameTable(c, tableId, 'x'.repeat(65));
    expect(has(validateContent(c), 'name-too-long')).toBe(true);
  });
});
