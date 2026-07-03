import type { Column, LogicalEdge, Table, WorkspaceContent } from '../types';
import { newId } from '../id';
import { uniqueName } from '../naming';
import { mutate, tableById } from './tables';
import { addForeignKey } from './keys';

export function pkColumnsOf(t: Table): Column[] {
  const pk = t.indexes.find(ix => ix.kind === 'primary');
  if (pk && pk.columns.length) {
    return pk.columns
      .map(ic => t.columns.find(c => c.id === ic.columnId))
      .filter((c): c is Column => !!c);
  }
  return t.columns.length ? [t.columns[0]] : [];
}

/** Adds FK columns mirroring parent's PK into the draft child table, returns new column ids. */
function materializeFkColumns(draftChild: Table, parent: Table): string[] {
  const ids: string[] = [];
  for (const pkCol of pkColumnsOf(parent)) {
    const id = newId();
    const colRec: Column = {
      id,
      name: uniqueName(`${parent.name}_${pkCol.name}`, draftChild.columns.map(c => c.name)),
      type: structuredClone(pkCol.type),
      nullable: false,
    };
    if (pkCol.unsigned) colRec.unsigned = true;
    draftChild.columns.push(colRec);
    ids.push(id);
  }
  return ids;
}

function link(c: WorkspaceContent, parentId: string, childId: string, unique: boolean):
  { content: WorkspaceContent; fkId: string } {
  const parent0 = tableById(c, parentId), child0 = tableById(c, childId);
  if (!parent0 || !child0 || pkColumnsOf(parent0).length === 0) return { content: c, fkId: '' };
  let newColIds: string[] = [];
  const content = mutate(c, d => {
    const child = d.tables.find(t => t.id === childId)!;
    const parent = d.tables.find(t => t.id === parentId)!;
    newColIds = materializeFkColumns(child, parent);
    const colNames = newColIds.map(id => child.columns.find(x => x.id === id)!.name).join('_');
    child.indexes.push({
      id: newId(),
      name: uniqueName(`${unique ? 'uq' : 'idx'}_${child.name}_${colNames}`, child.indexes.map(ix => ix.name)),
      kind: unique ? 'unique' : 'index', visible: true,
      columns: newColIds.map(columnId => ({ columnId })),
    });
  });
  const parentNow = tableById(content, parentId)!;
  const refIds = pkColumnsOf(parentNow).map(x => x.id);
  const r = addForeignKey(content, childId, { columnIds: newColIds, refTableId: parentId, refColumnIds: refIds });
  return { content: r.content, fkId: r.fkId };
}

export const linkOneToMany = (c: WorkspaceContent, parentId: string, childId: string) => link(c, parentId, childId, false);
export const linkOneToOne = (c: WorkspaceContent, parentId: string, childId: string) => link(c, parentId, childId, true);

export function linkManyToMany(c: WorkspaceContent, aId: string, bId: string):
  { content: WorkspaceContent; junctionTableId: string } {
  const a0 = tableById(c, aId), b0 = tableById(c, bId);
  if (!a0 || !b0 || !pkColumnsOf(a0).length || !pkColumnsOf(b0).length) return { content: c, junctionTableId: '' };
  const junctionTableId = newId();
  let aColIds: string[] = [], bColIds: string[] = [];
  let content = mutate(c, d => {
    const a = d.tables.find(t => t.id === aId)!, b = d.tables.find(t => t.id === bId)!;
    const junction: Table = {
      id: junctionTableId,
      name: uniqueName(`${a.name}_${b.name}`, d.tables.map(t => t.name)),
      x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) + 40, w: 220,
      columns: [], indexes: [], foreignKeys: [],
    };
    aColIds = materializeFkColumns(junction, a);
    bColIds = materializeFkColumns(junction, b);
    junction.indexes.push({
      id: newId(), name: 'PRIMARY', kind: 'primary', visible: true,
      columns: [...aColIds, ...bColIds].map(columnId => ({ columnId })),
    });
    const bNames = bColIds.map(id => junction.columns.find(x => x.id === id)!.name).join('_');
    junction.indexes.push({
      id: newId(), name: uniqueName(`idx_${junction.name}_${bNames}`, junction.indexes.map(i => i.name)),
      kind: 'index', visible: true, columns: bColIds.map(columnId => ({ columnId })),
    });
    d.tables.push(junction);
  });
  const aNow = tableById(content, aId)!, bNow = tableById(content, bId)!;
  content = addForeignKey(content, junctionTableId, { columnIds: aColIds, refTableId: aId, refColumnIds: pkColumnsOf(aNow).map(x => x.id) }).content;
  content = addForeignKey(content, junctionTableId, { columnIds: bColIds, refTableId: bId, refColumnIds: pkColumnsOf(bNow).map(x => x.id) }).content;
  return { content, junctionTableId };
}

export function addLogicalEdge(c: WorkspaceContent, e: Omit<LogicalEdge, 'id'>): { content: WorkspaceContent; edgeId: string } {
  const edgeId = newId();
  return { content: mutate(c, d => { d.logicalEdges.push({ id: edgeId, ...structuredClone(e) }); }), edgeId };
}

export const updateLogicalEdge = (c: WorkspaceContent, edgeId: string, patch: Partial<Omit<LogicalEdge, 'id'>>) =>
  mutate(c, d => { const e = d.logicalEdges.find(x => x.id === edgeId); if (e) Object.assign(e, structuredClone(patch)); });

export const deleteLogicalEdge = (c: WorkspaceContent, edgeId: string) =>
  mutate(c, d => { d.logicalEdges = d.logicalEdges.filter(x => x.id !== edgeId); });
