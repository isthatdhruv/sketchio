import type { WorkspaceContent } from './types';
import { formatType } from './datatypes';

export function canonicalize(c: WorkspaceContent): unknown {
  const tname = (id: string) => c.tables.find(t => t.id === id)?.name ?? '?';
  return {
    tables: [...c.tables].sort((a, b) => a.name.localeCompare(b.name)).map(t => {
      const cname = (id: string) => t.columns.find(x => x.id === id)?.name ?? '?';
      return {
        name: t.name, comment: t.comment ?? '',
        engine: t.engine ?? c.settings.defaultEngine,
        charset: t.charset ?? c.settings.defaultCharset,
        collation: t.collation ?? c.settings.defaultCollation,
        autoIncrementStart: t.autoIncrementStart ?? null,
        columns: t.columns.map(x => ({
          name: x.name, type: formatType(x.type), srid: x.type.srid ?? null,
          unsigned: !!x.unsigned, zerofill: !!x.zerofill, nullable: x.nullable,
          default: x.default ?? null,
          onUpdateCurrentTimestamp: !!x.onUpdateCurrentTimestamp, onUpdateFsp: x.onUpdateFsp ?? null,
          autoIncrement: !!x.autoIncrement,
          charset: x.charset ?? null, collation: x.collation ?? null,
          comment: x.comment ?? '', generated: x.generated ?? null,
        })),
        indexes: [...t.indexes].filter(ix => ix.columns.length)
          .map(ix => ({
            name: ix.kind === 'primary' ? 'PRIMARY' : ix.name, kind: ix.kind, visible: ix.visible !== false,
            columns: ix.columns.map(ic => ({ name: cname(ic.columnId), length: ic.length ?? null, order: ic.order ?? 'ASC' })),
          }))
          .sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`)),
        foreignKeys: [...t.foreignKeys]
          .map(fk => {
            const ref = c.tables.find(x => x.id === fk.refTableId);
            return {
              name: fk.name, columns: fk.columnIds.map(cname),
              refTable: ref?.name ?? '?', refColumns: fk.refColumnIds.map(id => ref?.columns.find(x => x.id === id)?.name ?? '?'),
              onDelete: fk.onDelete ?? null, onUpdate: fk.onUpdate ?? null,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }),
    logicalEdges: [...c.logicalEdges].map(e => {
      const from = c.tables.find(t => t.id === e.fromTableId);
      const to = c.tables.find(t => t.id === e.toTableId);
      const fc = e.fromColumnId ? from?.columns.find(x => x.id === e.fromColumnId)?.name : undefined;
      const tc = e.toColumnId ? to?.columns.find(x => x.id === e.toColumnId)?.name : undefined;
      return {
        from: fc ? `${tname(e.fromTableId)}.${fc}` : tname(e.fromTableId),
        to: tc ? `${tname(e.toTableId)}.${tc}` : tname(e.toTableId),
        cardinality: e.cardinality, label: e.label ?? '',
      };
    }).sort((a, b) => `${a.from}>${a.to}`.localeCompare(`${b.from}>${b.to}`)),
  };
}

export const semanticallyEqual = (a: WorkspaceContent, b: WorkspaceContent) =>
  JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
