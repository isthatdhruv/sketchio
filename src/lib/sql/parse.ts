import { Parser } from 'node-sql-parser';
import type { Cardinality, Column, FkAction, IndexKind, Table, WorkspaceContent } from '../schema/types';
import { TYPE_ALIASES, TYPE_MAP, specOf } from '../schema/datatypes';
import { emptyContent } from '../schema/ops/tables';
import { newId } from '../schema/id';
import { uniqueName } from '../schema/naming';
import { splitScript, preprocessStatement, type RawStatement } from './split';

export interface ParseIssue { line: number; statement: string; message: string; level: 'error' | 'skipped' | 'note' }

const OPT = { database: 'mysql' } as const;
const SKIP_RE = /^(INSERT|REPLACE|SET|USE|DROP|LOCK|UNLOCK|COMMIT|START|BEGIN|GRANT|FLUSH|SOURCE|DELIMITER|CREATE\s+(?:OR\s+REPLACE\s+)?(?:ALGORITHM\s*=\s*\w+\s+)?(?:DEFINER\s*=\s*\S+\s+)?(?:SQL\s+SECURITY\s+\w+\s+)?(DATABASE|SCHEMA|VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT|INDEX))\b/i;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ast = any;

const arr = (x: unknown): Ast[] => (Array.isArray(x) ? x : x == null ? [] : [x]);
const head = (s: string) => s.slice(0, 60).replace(/\s+/g, ' ');

interface PendingFk {
  childTable: string; name?: string; columns: string[];
  refTable: string; refColumns: string[];
  onDelete?: FkAction; onUpdate?: FkAction; line: number;
}

export function parseDDL(sql: string): { content: WorkspaceContent; issues: ParseIssue[] } {
  const parser = new Parser();
  const issues: ParseIssue[] = [];
  const content = emptyContent();
  const pendingFks: PendingFk[] = [];
  const { statements, logicalLines } = splitScript(sql);

  const exprText = (expr: Ast): string => {
    try {
      const s = parser.sqlify({ type: 'select', options: null, distinct: null, columns: [{ expr, as: null }],
        from: null, where: null, groupby: null, having: null, orderby: null, limit: null } as Ast, OPT);
      return s.replace(/^SELECT\s+/i, '');
    } catch { return '?'; }
  };
  const stripOuterParens = (s: string) => (s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s);
  const colRefName = (ref: Ast): string =>
    typeof ref === 'string' ? ref : typeof ref?.column === 'string' ? ref.column : ref?.column?.expr?.value ?? String(ref?.column ?? '?');
  const fkAction = (v: Ast): FkAction | undefined => {
    const up = String(v?.value?.value ?? v?.value ?? '').toUpperCase();
    return (['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'] as FkAction[]).find(a => a === up);
  };

  function mapColumn(def: Ast, srids: Map<string, number>): Column {
    const name = colRefName(def.column);
    const rawBase = String(def.definition?.dataType ?? 'varchar').toLowerCase();
    const base = TYPE_MAP.has(rawBase) ? rawBase : TYPE_ALIASES[rawBase] ?? rawBase;
    if (!TYPE_MAP.has(base)) issues.push({ line: 0, statement: name, message: `Unknown type \`${rawBase}\` kept as-is`, level: 'note' });
    const col: Column = { id: newId(), name, type: { base }, nullable: def.nullable?.type !== 'not null' };
    const d = def.definition ?? {};
    const spec = specOf(base);
    if (spec?.params === 'precision-scale') {
      if (d.length != null) col.type.precision = d.length;
      if (d.scale != null) col.type.scale = d.scale;
    } else if (spec?.params === 'fsp') {
      if (d.length != null) col.type.fsp = d.length;
    } else if (d.length != null) col.type.length = d.length;
    if (spec?.params === 'values') col.type.values = arr(d.expr?.value).map((v: Ast) => String(v.value));
    const suffix: string[] = arr(d.suffix).map((s: Ast) => String(s).toUpperCase());
    if (suffix.includes('UNSIGNED')) col.unsigned = true;
    if (suffix.includes('ZEROFILL')) col.zerofill = true;
    if (def.auto_increment) col.autoIncrement = true;
    if (def.character_set?.value?.value) col.charset = String(def.character_set.value.value);
    if (def.collate?.collate?.name) col.collation = String(def.collate.collate.name);
    if (def.comment?.value?.value != null) col.comment = String(def.comment.value.value);
    if (def.generated) {
      col.generated = {
        expression: stripOuterParens(exprText(def.generated.expr)),
        stored: String(def.generated.storage_type).toLowerCase() === 'stored',
      };
    }
    const dv = def.default_val?.value;
    if (dv && !col.generated) {
      const kind = String(dv.type ?? '');
      if (kind === 'null') col.default = { kind: 'null' };
      else if (kind === 'single_quote_string' || kind === 'double_quote_string') col.default = { kind: 'literal', value: String(dv.value) };
      else if (kind === 'number') col.default = { kind: 'literal', value: String(dv.value) };
      else if (kind === 'bool') col.default = { kind: 'literal', value: dv.value ? '1' : '0' };
      else if (kind === 'bit_string') col.default = { kind: 'expression', value: `b'${dv.value}'` };
      else if (kind === 'function') {
        const fname = String(dv.name?.name?.[0]?.value ?? '').toUpperCase();
        if (fname === 'CURRENT_TIMESTAMP' || fname === 'NOW') {
          col.default = { kind: 'current_timestamp' };
          const fsp = dv.args?.value?.[0]?.value; if (fsp != null) col.default.fsp = Number(fsp);
        } else col.default = { kind: 'expression', value: stripOuterParens(exprText(dv)) };
        const over = dv.over;
        if (over?.type === 'on update') {
          col.onUpdateCurrentTimestamp = true;
          const ofsp = over.expr?.value?.[0]?.value; if (ofsp != null) col.onUpdateFsp = Number(ofsp);
        }
      } else col.default = { kind: 'expression', value: stripOuterParens(exprText(dv)) };
    }
    for (const act of arr(def.reference_definition?.on_action))
      if (act.type === 'on update') col.onUpdateCurrentTimestamp = true;
    const srid = srids.get(name); if (srid != null) col.type.srid = srid;
    if (col.autoIncrement) col.nullable = false;
    return col;
  }

  function mapIndexDef(o: Ast, t: Table): void {
    const kw = String(o.keyword ?? o.constraint_type ?? '').toLowerCase();
    let kind: IndexKind = 'index';
    if (kw.includes('primary')) kind = 'primary';
    else if (kw.includes('unique')) kind = 'unique';
    else if (kw.includes('fulltext')) kind = 'fulltext';
    else if (kw.includes('spatial')) kind = 'spatial';
    const visible = !arr(o.index_options).some((op: Ast) => String(op.type).toLowerCase() === 'invisible');
    const cols = arr(o.definition).map((cd: Ast) => {
      const rec: { columnId: string; length?: number; order?: 'ASC' | 'DESC' } = { columnId: '' };
      const cname = colRefName(cd);
      const target = t.columns.find(x => x.name === cname);
      rec.columnId = target?.id ?? '';
      const pm = String(cd.suffix ?? '').match(/\((\d+)\)/); if (pm) rec.length = Number(pm[1]);
      if (String(cd.order_by ?? '').toUpperCase() === 'DESC') rec.order = 'DESC';
      return rec;
    }).filter(rc => rc.columnId);
    if (!cols.length) return;
    const name = kind === 'primary' ? 'PRIMARY'
      : String(o.index ?? '') || uniqueName(`idx_${t.name}_${cols.length}`, t.indexes.map(i => i.name));
    t.indexes.push({ id: newId(), name, kind, visible, columns: cols });
  }

  function collectFk(o: Ast, childTable: string, line: number): void {
    const rd = o.reference_definition ?? {};
    const pending: PendingFk = {
      childTable, line,
      name: o.constraint ?? undefined,
      columns: arr(o.definition).map(colRefName),
      refTable: String(rd.table?.[0]?.table ?? ''),
      refColumns: arr(rd.definition).map(colRefName),
    };
    for (const act of arr(rd.on_action)) {
      const a = fkAction(act);
      const ty = String(act.type ?? '').toLowerCase();
      if (!a && act?.value)
        issues.push({ line, statement: pending.name ?? childTable, message: `Unsupported FK action dropped (${JSON.stringify(act.value?.value ?? act.value)})`, level: 'note' });
      if (ty === 'on delete' && a) pending.onDelete = a;
      if (ty === 'on update' && a) pending.onUpdate = a;
    }
    pendingFks.push(pending);
  }

  function mapCreateTable(ast: Ast, raw: RawStatement, srids: Map<string, number>): void {
    const name = String(ast.table?.[0]?.table ?? `table_${content.tables.length + 1}`);
    const i = content.tables.length;
    const t: Table = { id: newId(), name, x: (i % 5) * 300 + 60, y: Math.floor(i / 5) * 260 + 60, w: 220, columns: [], indexes: [], foreignKeys: [] };
    for (const def of arr(ast.create_definitions)) {
      if (def.resource === 'column') t.columns.push(mapColumn(def, srids));
      else if (def.resource === 'constraint' && String(def.constraint_type).toUpperCase() === 'FOREIGN KEY') collectFk(def, name, raw.line);
      else if (def.resource === 'constraint' || def.resource === 'index') mapIndexDef(def, t);
    }
    for (const op of arr(ast.table_options)) {
      const kw = String(op.keyword ?? '').toLowerCase();
      if (kw === 'engine') t.engine = String(op.value).toUpperCase() === 'INNODB' ? 'InnoDB' : String(op.value);
      else if (kw === 'auto_increment') t.autoIncrementStart = Number(op.value);
      else if (kw.includes('charset') || kw.includes('character set')) t.charset = String(op.value?.value ?? op.value);
      else if (kw === 'collate') t.collation = String(op.value?.value ?? op.value);
      else if (kw === 'comment') t.comment = String(op.value ?? '').replace(/^'([\s\S]*)'$/, '$1').replace(/''/g, "'");
    }
    content.tables.push(t);
  }

  function mapAlter(ast: Ast, raw: RawStatement, srids: Map<string, number>): void {
    const tname = String(ast.table?.[0]?.table ?? '');
    const t = content.tables.find(x => x.name === tname) ?? content.tables.find(x => x.name.toLowerCase() === tname.toLowerCase());
    if (!t) { issues.push({ line: raw.line, statement: head(raw.text), message: `ALTER on unknown table \`${tname}\``, level: 'error' }); return; }
    for (const item of arr(ast.expr)) {
      if (item.action !== 'add') { issues.push({ line: raw.line, statement: head(raw.text), message: `ALTER ${item.action} skipped`, level: 'skipped' }); continue; }
      const def = item.create_definitions ?? item;
      if (item.resource === 'column') t.columns.push(mapColumn(item, srids));
      else if ((item.resource === 'constraint' || def.resource === 'constraint') && String(def.constraint_type ?? '').toUpperCase() === 'FOREIGN KEY')
        collectFk(def, t.name, raw.line);
      else if (item.resource === 'index' || item.resource === 'constraint') mapIndexDef(def === item ? item : def, t);
    }
  }

  for (const raw of statements) {
    if (/^CREATE\s+TABLE/i.test(raw.text) || /^ALTER\s+TABLE/i.test(raw.text)) {
      const pre = preprocessStatement(raw.text);
      for (const n of pre.notes) issues.push({ line: raw.line, statement: head(raw.text), message: n, level: 'note' });
      try {
        for (const ast of arr(parser.astify(pre.text, OPT))) {
          if (ast.type === 'create' && ast.keyword === 'table') mapCreateTable(ast, raw, pre.srids);
          else if (ast.type === 'alter') mapAlter(ast, raw, pre.srids);
        }
      } catch (e) {
        issues.push({ line: raw.line, statement: head(raw.text), message: e instanceof Error ? e.message.slice(0, 160) : 'parse error', level: 'error' });
      }
    } else if (SKIP_RE.test(raw.text)) {
      /* silently skip recognized non-DDL */
    } else {
      issues.push({ line: raw.line, statement: head(raw.text), message: 'Unrecognized statement', level: 'error' });
    }
  }

  for (const p of pendingFks) {
    const child = content.tables.find(x => x.name === p.childTable);
    if (!child) continue;
    const ref = content.tables.find(x => x.name === p.refTable) ?? content.tables.find(x => x.name.toLowerCase() === p.refTable.toLowerCase());
    if (!ref) { issues.push({ line: p.line, statement: p.name ?? p.childTable, message: `FK references missing table \`${p.refTable}\` — dropped`, level: 'error' }); continue; }
    const cols = p.columns.map(n => child.columns.find(x => x.name === n)?.id).filter((x): x is string => !!x);
    const refCols = p.refColumns.map(n => ref.columns.find(x => x.name === n)?.id).filter((x): x is string => !!x);
    if (cols.length !== p.columns.length || refCols.length !== p.refColumns.length || cols.length === 0) {
      content.logicalEdges.push({ id: newId(), fromTableId: child.id, toTableId: ref.id, cardinality: 'm-1', label: p.name });
      issues.push({ line: p.line, statement: p.name ?? p.childTable, message: `FK columns unresolved — kept as logical edge`, level: 'note' });
      continue;
    }
    const allNames = content.tables.flatMap(x => x.foreignKeys.map(f => f.name));
    child.foreignKeys.push({
      id: newId(), name: p.name ?? uniqueName(`fk_${child.name}_${ref.name}`, allNames),
      columnIds: cols, refTableId: ref.id, refColumnIds: refCols,
      ...(p.onDelete ? { onDelete: p.onDelete } : {}), ...(p.onUpdate ? { onUpdate: p.onUpdate } : {}),
    });
  }

  for (const ll of logicalLines) {
    try {
      const j = JSON.parse(ll.json) as { from: string; to: string; cardinality: Cardinality; label?: string };
      const [ft, fc] = String(j.from).split('.'); const [tt, tc] = String(j.to).split('.');
      const from = content.tables.find(x => x.name === ft); const to = content.tables.find(x => x.name === tt);
      if (!from || !to) { issues.push({ line: ll.line, statement: ll.json.slice(0, 60), message: `logical edge endpoint not found (${!from ? ft : tt})`, level: 'note' }); continue; }
      content.logicalEdges.push({
        id: newId(), fromTableId: from.id, toTableId: to.id,
        fromColumnId: fc ? from.columns.find(x => x.name === fc)?.id : undefined,
        toColumnId: tc ? to.columns.find(x => x.name === tc)?.id : undefined,
        cardinality: (['1-1', '1-m', 'm-1', 'm-m'] as Cardinality[]).includes(j.cardinality) ? j.cardinality : 'm-1',
        label: j.label,
      });
    } catch { issues.push({ line: ll.line, statement: ll.json.slice(0, 60), message: 'invalid logical comment', level: 'note' }); }
  }

  return { content, issues };
}
