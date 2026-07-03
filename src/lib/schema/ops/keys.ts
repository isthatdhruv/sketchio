import type { FkAction, ForeignKey, IndexKind, TableIndex, WorkspaceContent } from '../types';
import { newId } from '../id';
import { uniqueName } from '../naming';
import { mutate, tableById } from './tables';

const PREFIX: Record<IndexKind, string> = { primary: 'PRIMARY', unique: 'uq', index: 'idx', fulltext: 'ft', spatial: 'sp' };

export function addIndex(c: WorkspaceContent, tableId: string, kind: IndexKind): { content: WorkspaceContent; indexId: string } {
  const t0 = tableById(c, tableId);
  if (!t0) return { content: c, indexId: '' };
  if (kind === 'primary' && t0.indexes.some(ix => ix.kind === 'primary')) return { content: c, indexId: '' };
  const indexId = newId();
  const content = mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId)!;
    const name = kind === 'primary' ? 'PRIMARY'
      : uniqueName(`${PREFIX[kind]}_${t.name}_1`, t.indexes.map(ix => ix.name));
    t.indexes.push({ id: indexId, name, kind, visible: true, columns: [] });
  });
  return { content, indexId };
}

export const updateIndex = (c: WorkspaceContent, tableId: string, indexId: string,
  patch: Partial<Pick<TableIndex, 'name' | 'kind' | 'columns' | 'visible'>>) =>
  mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId);
    const ix = t?.indexes.find(i => i.id === indexId);
    if (ix) Object.assign(ix, structuredClone(patch));
  });

export const deleteIndex = (c: WorkspaceContent, tableId: string, indexId: string) =>
  mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId);
    if (t) t.indexes = t.indexes.filter(i => i.id !== indexId);
  });

export function addForeignKey(c: WorkspaceContent, tableId: string,
  fk: { columnIds: string[]; refTableId: string; refColumnIds: string[]; onDelete?: FkAction; onUpdate?: FkAction; name?: string },
): { content: WorkspaceContent; fkId: string } {
  const fkId = newId();
  const content = mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId); if (!t) return;
    const parent = d.tables.find(x => x.id === fk.refTableId);
    const allNames = d.tables.flatMap(x => x.foreignKeys.map(f => f.name));
    const name = fk.name ?? uniqueName(`fk_${t.name}_${parent?.name ?? 'ref'}`, allNames);
    const rec: ForeignKey = { id: fkId, name, columnIds: [...fk.columnIds], refTableId: fk.refTableId, refColumnIds: [...fk.refColumnIds] };
    if (fk.onDelete) rec.onDelete = fk.onDelete;
    if (fk.onUpdate) rec.onUpdate = fk.onUpdate;
    t.foreignKeys.push(rec);
  });
  return { content, fkId };
}

export const updateForeignKey = (c: WorkspaceContent, tableId: string, fkId: string, patch: Partial<Omit<ForeignKey, 'id'>>) =>
  mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId);
    const fk = t?.foreignKeys.find(f => f.id === fkId);
    if (fk) Object.assign(fk, structuredClone(patch));
  });

export const deleteForeignKey = (c: WorkspaceContent, tableId: string, fkId: string) =>
  mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId);
    if (t) t.foreignKeys = t.foreignKeys.filter(f => f.id !== fkId);
  });
