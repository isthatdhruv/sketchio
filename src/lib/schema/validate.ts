import type { WorkspaceContent } from './types';
import { isSpatialType, specOf } from './datatypes';

export interface ValidationIssue {
  id: string; level: 'error' | 'warning'; message: string;
  tableId?: string; columnId?: string;
}

export function validateContent(c: WorkspaceContent): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (id: string, level: 'error' | 'warning', message: string, tableId?: string, columnId?: string) =>
    issues.push({ id, level, message, tableId, columnId });

  const tnames = new Map<string, number>();
  for (const t of c.tables) tnames.set(t.name.toLowerCase(), (tnames.get(t.name.toLowerCase()) ?? 0) + 1);
  for (const t of c.tables) {
    if ((tnames.get(t.name.toLowerCase()) ?? 0) > 1)
      push(`dup-table:${t.id}`, 'error', `Duplicate table name \`${t.name}\``, t.id);
    if (t.name.length > 64) push(`name-too-long:${t.id}`, 'error', `Table name \`${t.name.slice(0, 20)}…\` exceeds 64 chars`, t.id);

    const cnames = new Map<string, number>();
    for (const col of t.columns) cnames.set(col.name.toLowerCase(), (cnames.get(col.name.toLowerCase()) ?? 0) + 1);
    for (const col of t.columns) {
      if ((cnames.get(col.name.toLowerCase()) ?? 0) > 1)
        push(`dup-col:${t.id}:${col.id}`, 'error', `Duplicate column \`${col.name}\` in \`${t.name}\``, t.id, col.id);
      if (col.name.length > 64) push(`name-too-long:${t.id}:${col.id}`, 'error', `Column name exceeds 64 chars`, t.id, col.id);
      if ((col.type.base === 'enum' || col.type.base === 'set') && !(col.type.values?.length))
        push(`enum-empty:${t.id}:${col.id}`, 'error', `\`${col.name}\` has no ${col.type.base.toUpperCase()} values`, t.id, col.id);
    }

    const pk = t.indexes.find(ix => ix.kind === 'primary');
    if (!pk && t.columns.length) push(`no-pk:${t.id}`, 'warning', `Table \`${t.name}\` has no primary key`, t.id);

    const keyed = new Set<string>();
    for (const ix of t.indexes) if (ix.columns.length) keyed.add(ix.columns[0].columnId);
    const ai = t.columns.filter(x => x.autoIncrement);
    if (ai.length > 1) push(`multi-ai:${t.id}`, 'error', `Table \`${t.name}\` has ${ai.length} AUTO_INCREMENT columns`, t.id);
    for (const col of ai)
      if (!keyed.has(col.id))
        push(`ai-no-key:${t.id}:${col.id}`, 'error', `AUTO_INCREMENT \`${col.name}\` must be the first column of a key`, t.id, col.id);

    const inames = new Map<string, number>();
    for (const ix of t.indexes) inames.set(ix.name.toLowerCase(), (inames.get(ix.name.toLowerCase()) ?? 0) + 1);
    for (const ix of t.indexes) {
      if ((inames.get(ix.name.toLowerCase()) ?? 0) > 1)
        push(`dup-index:${t.id}:${ix.id}`, 'error', `Duplicate index name \`${ix.name}\` in \`${t.name}\``, t.id);
      if (ix.name.length > 64) push(`name-too-long:ix:${ix.id}`, 'error', `Index name exceeds 64 chars`, t.id);
      for (const ic of ix.columns) {
        const colRec = t.columns.find(x => x.id === ic.columnId); if (!colRec) continue;
        if (ix.kind === 'fulltext' && !specOf(colRec.type.base)?.text)
          push(`ft-nontext:${ix.id}`, 'warning', `FULLTEXT \`${ix.name}\` on non-text column \`${colRec.name}\``, t.id, colRec.id);
        if (ix.kind === 'spatial' && (!isSpatialType(colRec.type.base) || colRec.nullable))
          push(`sp-invalid:${ix.id}`, 'warning', `SPATIAL \`${ix.name}\` requires NOT NULL spatial column`, t.id, colRec.id);
      }
    }
  }

  const fknames = new Map<string, number>();
  for (const t of c.tables) for (const fk of t.foreignKeys)
    fknames.set(fk.name.toLowerCase(), (fknames.get(fk.name.toLowerCase()) ?? 0) + 1);
  for (const t of c.tables) for (const fk of t.foreignKeys) {
    if ((fknames.get(fk.name.toLowerCase()) ?? 0) > 1)
      push(`dup-fk:${fk.id}`, 'error', `Duplicate constraint name \`${fk.name}\``, t.id);
    if (fk.name.length > 64) push(`name-too-long:fk:${fk.id}`, 'error', `Constraint name exceeds 64 chars`, t.id);
    const ref = c.tables.find(x => x.id === fk.refTableId);
    if (!ref) { push(`fk-dangling:${fk.id}`, 'error', `\`${fk.name}\` references a missing table`, t.id); continue; }
    if (fk.columnIds.length !== fk.refColumnIds.length || fk.columnIds.length === 0) {
      push(`fk-mismatch:${fk.id}`, 'warning', `\`${fk.name}\` column count mismatch`, t.id); continue;
    }
    for (let i = 0; i < fk.columnIds.length; i++) {
      const a = t.columns.find(x => x.id === fk.columnIds[i]);
      const b = ref.columns.find(x => x.id === fk.refColumnIds[i]);
      if (!a || !b) { push(`fk-dangling:${fk.id}:${i}`, 'error', `\`${fk.name}\` references a missing column`, t.id); continue; }
      if (a.type.base !== b.type.base || !!a.unsigned !== !!b.unsigned)
        push(`fk-mismatch:${fk.id}:${i}`, 'warning',
          `\`${fk.name}\`: \`${a.name}\` (${a.type.base}${a.unsigned ? ' unsigned' : ''}) vs \`${ref.name}.${b.name}\` (${b.type.base}${b.unsigned ? ' unsigned' : ''})`,
          t.id, a.id);
    }
  }
  return issues;
}
