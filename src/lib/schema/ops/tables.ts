import type { Table, Viewport, WorkspaceContent } from '../types';
import { newId } from '../id';
import { uniqueName } from '../naming';

export const mutate = (c: WorkspaceContent, fn: (draft: WorkspaceContent) => void): WorkspaceContent => {
  const draft = structuredClone(c); fn(draft); return draft;
};
export const tableById = (c: WorkspaceContent, id: string) => c.tables.find(t => t.id === id);

export function emptyContent(): WorkspaceContent {
  return {
    schemaVersion: 1,
    settings: { defaultEngine: 'InnoDB', defaultCharset: 'utf8mb4', defaultCollation: 'utf8mb4_0900_ai_ci' },
    tables: [], logicalEdges: [], viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function addTable(c: WorkspaceContent, x: number, y: number): { content: WorkspaceContent; tableId: string } {
  const tableId = newId(); const colId = newId();
  const content = mutate(c, d => {
    const name = uniqueName(`table_${d.tables.length + 1}`, d.tables.map(t => t.name));
    d.tables.push({
      id: tableId, name, x: Math.round(x), y: Math.round(y), w: 220,
      columns: [{ id: colId, name: 'id', type: { base: 'int' }, nullable: false, unsigned: true, autoIncrement: true }],
      indexes: [{ id: newId(), name: 'PRIMARY', kind: 'primary', visible: true, columns: [{ columnId: colId }] }],
      foreignKeys: [],
    });
  });
  return { content, tableId };
}

export const renameTable = (c: WorkspaceContent, tableId: string, name: string) =>
  mutate(c, d => { const t = d.tables.find(x => x.id === tableId); if (t) t.name = name.trim() || t.name; });

export const updateTableOptions = (
  c: WorkspaceContent, tableId: string,
  patch: Partial<Pick<Table, 'engine' | 'charset' | 'collation' | 'comment' | 'autoIncrementStart' | 'color'>>,
) => mutate(c, d => { const t = d.tables.find(x => x.id === tableId); if (t) Object.assign(t, patch); });

export const deleteTable = (c: WorkspaceContent, tableId: string) => mutate(c, d => {
  d.tables = d.tables.filter(t => t.id !== tableId);
  for (const t of d.tables) t.foreignKeys = t.foreignKeys.filter(fk => fk.refTableId !== tableId);
  d.logicalEdges = d.logicalEdges.filter(e => e.fromTableId !== tableId && e.toTableId !== tableId);
});

export function duplicateTable(c: WorkspaceContent, tableId: string): { content: WorkspaceContent; tableId: string } {
  const src = tableById(c, tableId);
  if (!src) return { content: c, tableId };
  const copy = structuredClone(src);
  copy.id = newId();
  const idMap = new Map<string, string>();
  for (const col of copy.columns) { const nid = newId(); idMap.set(col.id, nid); col.id = nid; }
  for (const ix of copy.indexes) {
    ix.id = newId();
    ix.columns = ix.columns.map(icol => ({ ...icol, columnId: idMap.get(icol.columnId) ?? icol.columnId }));
  }
  copy.foreignKeys = [];
  copy.x += 30; copy.y += 30;
  const content = mutate(c, d => {
    copy.name = uniqueName(`${src.name}_copy`, d.tables.map(t => t.name));
    d.tables.push(copy);
  });
  return { content, tableId: copy.id };
}

export const moveTable = (c: WorkspaceContent, tableId: string, x: number, y: number) =>
  mutate(c, d => { const t = d.tables.find(x2 => x2.id === tableId); if (t) { t.x = Math.round(x); t.y = Math.round(y); } });

export const resizeTable = (c: WorkspaceContent, tableId: string, w: number, h: number) =>
  mutate(c, d => { const t = d.tables.find(x => x.id === tableId); if (t) { t.w = Math.max(200, Math.round(w)); t.h = Math.max(60, Math.round(h)); } });

export const setViewport = (c: WorkspaceContent, vp: Viewport) => mutate(c, d => { d.viewport = vp; });
