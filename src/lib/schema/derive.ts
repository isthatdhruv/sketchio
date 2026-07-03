import type { Cardinality, Table, WorkspaceContent } from './types';

export interface DerivedEdge {
  id: string; kind: 'fk' | 'logical';
  fkId?: string; ownerTableId?: string; logicalId?: string;
  fromTableId: string; toTableId: string;
  fromColumnIds: string[]; toColumnIds: string[];
  cardinality: Cardinality; label?: string;
}

export const CARD_SYMBOLS: Record<Cardinality, [string, string]> =
  { '1-1': ['1', '1'], '1-m': ['1', 'N'], 'm-1': ['N', '1'], 'm-m': ['N', 'N'] };

const fkIsUnique = (t: Table, fkColIds: string[]): boolean => {
  const fkSet = new Set(fkColIds);
  return t.indexes.some(ix =>
    (ix.kind === 'primary' || ix.kind === 'unique') &&
    ix.columns.length > 0 &&
    ix.columns.every(ic => fkSet.has(ic.columnId)));
};

export function deriveEdges(c: WorkspaceContent): DerivedEdge[] {
  const edges: DerivedEdge[] = [];
  for (const t of c.tables)
    for (const fk of t.foreignKeys)
      edges.push({
        id: `fk:${fk.id}`, kind: 'fk', fkId: fk.id, ownerTableId: t.id,
        fromTableId: t.id, toTableId: fk.refTableId,
        fromColumnIds: [...fk.columnIds], toColumnIds: [...fk.refColumnIds],
        cardinality: fkIsUnique(t, fk.columnIds) ? '1-1' : 'm-1',
      });
  for (const e of c.logicalEdges)
    edges.push({
      id: `log:${e.id}`, kind: 'logical', logicalId: e.id,
      fromTableId: e.fromTableId, toTableId: e.toTableId,
      fromColumnIds: e.fromColumnId ? [e.fromColumnId] : [], toColumnIds: e.toColumnId ? [e.toColumnId] : [],
      cardinality: e.cardinality, label: e.label,
    });
  return edges;
}

export function columnBadges(t: Table): Map<string, string[]> {
  const pkSet = new Set<string>(), uqSet = new Set<string>(), ixSet = new Set<string>(), fkSet = new Set<string>();
  for (const ix of t.indexes)
    for (const ic of ix.columns) {
      if (ix.kind === 'primary') pkSet.add(ic.columnId);
      else if (ix.kind === 'unique') uqSet.add(ic.columnId);
      else ixSet.add(ic.columnId);
    }
  for (const fk of t.foreignKeys) for (const id of fk.columnIds) fkSet.add(id);
  const out = new Map<string, string[]>();
  for (const col of t.columns) {
    const b: string[] = [];
    if (pkSet.has(col.id)) b.push('PK');
    if (fkSet.has(col.id)) b.push('FK');
    if (uqSet.has(col.id)) b.push('UQ');
    if (!col.nullable) b.push('NN');
    if (col.autoIncrement) b.push('AI');
    if (col.unsigned) b.push('UN');
    if (ixSet.has(col.id)) b.push('IX');
    out.set(col.id, b);
  }
  return out;
}

export function adjacency(c: WorkspaceContent): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>(c.tables.map(t => [t.id, new Set<string>()]));
  for (const e of deriveEdges(c)) {
    adj.get(e.fromTableId)?.add(e.toTableId);
    adj.get(e.toTableId)?.add(e.fromTableId);
  }
  return adj;
}
