import type { Column, Table, WorkspaceContent } from '../types';
import { newId } from '../id';
import { uniqueName } from '../naming';
import { requiresExpressionDefault, supportsAutoIncrement, supportsCharset, supportsTimeDefault, supportsUnsigned, specOf } from '../datatypes';
import { mutate } from './tables';

const tbl = (d: WorkspaceContent, id: string) => d.tables.find(t => t.id === id);
const col = (t: Table, id: string) => t.columns.find(c => c.id === id);

export function addColumn(c: WorkspaceContent, tableId: string): { content: WorkspaceContent; columnId: string } {
  const columnId = newId();
  const content = mutate(c, d => {
    const t = tbl(d, tableId); if (!t) return;
    t.columns.push({
      id: columnId,
      name: uniqueName('new_column', t.columns.map(x => x.name)),
      type: { base: 'varchar', length: 255 }, nullable: true,
    });
  });
  return { content, columnId };
}

export function sanitizeColumn(x: Column): void {
  const base = x.type.base;
  if (!supportsUnsigned(base)) { delete x.unsigned; delete x.zerofill; }
  if (!supportsAutoIncrement(base)) delete x.autoIncrement;
  if (!supportsCharset(base)) { delete x.charset; delete x.collation; }
  if (specOf(base)?.params !== 'fsp') delete x.type.fsp;
  if (!supportsTimeDefault(base)) {
    delete x.onUpdateCurrentTimestamp; delete x.onUpdateFsp;
    if (x.default?.kind === 'current_timestamp') delete x.default;
  }
  if (specOf(base)?.params !== 'values') delete x.type.values;
  if (x.generated) { delete x.autoIncrement; delete x.default; }
  if (x.default?.kind === 'literal' && requiresExpressionDefault(base))
    x.default = { kind: 'expression', value: x.default.value };
  if (x.autoIncrement) { x.nullable = false; delete x.default; }
}

export const updateColumn = (c: WorkspaceContent, tableId: string, columnId: string, patch: Partial<Omit<Column, 'id'>>) =>
  mutate(c, d => {
    const t = tbl(d, tableId); const x = t && col(t, columnId); if (!x) return;
    Object.assign(x, structuredClone(patch));
    sanitizeColumn(x);
  });

export const deleteColumn = (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
  const t = tbl(d, tableId); if (!t) return;
  t.columns = t.columns.filter(x => x.id !== columnId);
  t.indexes = t.indexes
    .map(ix => ({ ...ix, columns: ix.columns.filter(ic => ic.columnId !== columnId) }))
    .filter(ix => ix.columns.length > 0);
  for (const anyT of d.tables)
    anyT.foreignKeys = anyT.foreignKeys.filter(fk =>
      !fk.columnIds.includes(columnId) && !fk.refColumnIds.includes(columnId));
});

export const moveColumn = (c: WorkspaceContent, tableId: string, columnId: string, dir: -1 | 1) => mutate(c, d => {
  const t = tbl(d, tableId); if (!t) return;
  const i = t.columns.findIndex(x => x.id === columnId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= t.columns.length) return;
  [t.columns[i], t.columns[j]] = [t.columns[j], t.columns[i]];
});

export const togglePk = (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
  const t = tbl(d, tableId); if (!t) return;
  let pk = t.indexes.find(ix => ix.kind === 'primary');
  const member = pk?.columns.some(ic => ic.columnId === columnId);
  if (member) {
    pk!.columns = pk!.columns.filter(ic => ic.columnId !== columnId);
    if (pk!.columns.length === 0) t.indexes = t.indexes.filter(ix => ix !== pk);
  } else {
    if (!pk) { pk = { id: newId(), name: 'PRIMARY', kind: 'primary', visible: true, columns: [] }; t.indexes.unshift(pk); }
    pk.columns.push({ columnId });
    const x = col(t, columnId); if (x) x.nullable = false;
  }
});

export const toggleNotNull = (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
  const t = tbl(d, tableId); const x = t && col(t, columnId); if (x) x.nullable = !x.nullable;
});

export const toggleAutoIncrement = (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
  const t = tbl(d, tableId); const x = t && col(t, columnId); if (!x) return;
  if (x.autoIncrement) delete x.autoIncrement;
  else if (supportsAutoIncrement(x.type.base)) { x.autoIncrement = true; x.nullable = false; delete x.default; }
});

const toggleSingleColIndex = (kind: 'unique' | 'index', prefix: string) =>
  (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
    const t = tbl(d, tableId); if (!t) return;
    const existing = t.indexes.find(ix => ix.kind === kind && ix.columns.length === 1 && ix.columns[0].columnId === columnId);
    if (existing) { t.indexes = t.indexes.filter(ix => ix !== existing); return; }
    const x = col(t, columnId); if (!x) return;
    t.indexes.push({
      id: newId(),
      name: uniqueName(`${prefix}_${t.name}_${x.name}`, t.indexes.map(ix => ix.name)),
      kind, visible: true, columns: [{ columnId }],
    });
  });

export const toggleUnique = toggleSingleColIndex('unique', 'uq');
export const toggleIndex = toggleSingleColIndex('index', 'idx');
