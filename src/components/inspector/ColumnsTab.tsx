'use client';
import type { Column, ColumnDefault, ColumnType, Table } from '@/lib/schema/types';
import { useEditorStore } from '@/store/editorStore';
import { addColumn, updateColumn, deleteColumn, moveColumn } from '@/lib/schema/ops/columns';
import { TYPES, specOf, formatType, supportsAutoIncrement, supportsUnsigned, supportsCharset,
         supportsTimeDefault, isSpatialType, CHARSETS } from '@/lib/schema/datatypes';
import { TextField, NumField, SelectField, CheckRow, ValuesEditor } from './fields';

const CATEGORIES: Array<[string, string]> = [
  ['numeric', 'Numeric'], ['string', 'String'], ['datetime', 'Date & time'], ['json', 'JSON'], ['spatial', 'Spatial'],
];

function seedType(base: string, prev: ColumnType): ColumnType {
  const spec = specOf(base);
  const t: ColumnType = { base };
  if (!spec) return t;
  if (spec.params === 'length-required') t.length = base === 'varchar' ? 255 : 32;
  else if (spec.params === 'length' && (base === 'char' || base === 'binary')) t.length = 1;
  else if (base === 'bit') t.length = 8;
  else if (spec.params === 'precision-scale' && base === 'decimal') { t.precision = 10; t.scale = 2; }
  else if (spec.params === 'values') t.values = prev.values ?? [];
  return t;
}

function DefaultEditor({ col, commit }: { col: Column; commit: (patch: Partial<Column>) => void }) {
  const kind = col.default?.kind ?? 'none';
  const timeOk = supportsTimeDefault(col.type.base);
  const kinds: Array<[string, string]> = [
    ['none', 'No default'], ['null', 'NULL'], ['literal', 'Literal'], ['expression', 'Expression (…)'],
    ...(timeOk ? [['current_timestamp', 'CURRENT_TIMESTAMP'] as [string, string]] : []),
  ];
  const set = (d: ColumnDefault | undefined) => commit({ default: d });
  return (
    <>
      <SelectField label="Default" value={kind} options={kinds}
        onCommit={v => {
          if (v === 'none') set(undefined);
          else if (v === 'null') set({ kind: 'null' });
          else if (v === 'literal') set({ kind: 'literal', value: col.default?.value ?? '' });
          else if (v === 'expression') set({ kind: 'expression', value: col.default?.value ?? '' });
          else set({ kind: 'current_timestamp', fsp: col.type.fsp });
        }} />
      {(kind === 'literal' || kind === 'expression') && (
        <TextField label={kind === 'literal' ? 'Default value' : 'Default expression'} mono
          value={col.default?.value ?? ''}
          onCommit={v => set({ kind: kind as 'literal' | 'expression', value: v })} />
      )}
      {kind === 'current_timestamp' && (
        <NumField label="CURRENT_TIMESTAMP fsp (0–6)" min={0} value={col.default?.fsp}
          onCommit={v => set({ kind: 'current_timestamp', fsp: v })} />
      )}
      {timeOk && (
        <CheckRow label="ON UPDATE CURRENT_TIMESTAMP" checked={!!col.onUpdateCurrentTimestamp}
          onToggle={() => commit({ onUpdateCurrentTimestamp: !col.onUpdateCurrentTimestamp || undefined, onUpdateFsp: col.type.fsp })} />
      )}
    </>
  );
}

function ColumnEditor({ table, col }: { table: Table; col: Column }) {
  const content = useEditorStore(s => s.content)!;
  const apply = useEditorStore(s => s.apply);
  const commit = (patch: Partial<Omit<Column, 'id'>>) => apply(updateColumn(content, table.id, col.id, patch));
  const spec = specOf(col.type.base);
  const params = spec?.params ?? 'none';
  const typeOptions = CATEGORIES.flatMap(([cat]) => TYPES.filter(t => t.category === cat).map(t => t.base));
  return (
    <div className="px-3 pb-3 border-b border-[var(--panel-border)]">
      <TextField label="Name" mono value={col.name} onCommit={v => v.trim() && commit({ name: v.trim() })} />
      <label className="block text-[11px] text-[var(--muted)] mt-2">
        <span className="block mb-0.5">Type</span>
        <select value={col.type.base} aria-label={`type of ${col.name}`}
          className="w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-2 py-1 text-[12px] font-mono text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          onChange={e => commit({ type: seedType(e.target.value, col.type) })}>
          {CATEGORIES.map(([cat, label]) => (
            <optgroup key={cat} label={label}>
              {typeOptions.filter(b => specOf(b)?.category === cat).map(b => <option key={b} value={b}>{b}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {(params === 'length' || params === 'length-required') && (
        <NumField label="Length" min={0} value={col.type.length}
          onCommit={v => commit({ type: { ...col.type, length: v } })} />
      )}
      {params === 'precision-scale' && (
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Precision" min={1} value={col.type.precision}
            onCommit={v => commit({ type: { ...col.type, precision: v } })} />
          <NumField label="Scale" min={0} value={col.type.scale}
            onCommit={v => commit({ type: { ...col.type, scale: v } })} />
        </div>
      )}
      {params === 'fsp' && (
        <NumField label="Fractional seconds (0–6)" min={0} value={col.type.fsp}
          onCommit={v => commit({ type: { ...col.type, fsp: v } })} />
      )}
      {params === 'values' && (
        <ValuesEditor values={col.type.values ?? []} onCommit={v => commit({ type: { ...col.type, values: v } })} />
      )}
      {isSpatialType(col.type.base) && (
        <NumField label="SRID" min={0} value={col.type.srid}
          onCommit={v => commit({ type: { ...col.type, srid: v } })} />
      )}
      <div className="mt-1">
        <CheckRow label="NOT NULL" checked={!col.nullable} onToggle={() => commit({ nullable: !col.nullable })} />
        <CheckRow label="UNSIGNED" checked={!!col.unsigned} disabled={!supportsUnsigned(col.type.base)}
          onToggle={() => commit({ unsigned: !col.unsigned || undefined })} />
        <CheckRow label="ZEROFILL" checked={!!col.zerofill} disabled={!supportsUnsigned(col.type.base)}
          onToggle={() => commit({ zerofill: !col.zerofill || undefined })} />
        <CheckRow label="AUTO_INCREMENT" checked={!!col.autoIncrement} disabled={!supportsAutoIncrement(col.type.base)}
          onToggle={() => commit({ autoIncrement: !col.autoIncrement || undefined })} />
        <CheckRow label="Generated column" checked={!!col.generated}
          onToggle={() => commit({ generated: col.generated ? undefined : { expression: '', stored: false } })} />
      </div>
      {col.generated && (
        <>
          <TextField label="Generation expression" mono value={col.generated.expression}
            onCommit={v => commit({ generated: { ...col.generated!, expression: v } })} />
          <SelectField label="Storage" value={col.generated.stored ? 'stored' : 'virtual'}
            options={[['virtual', 'VIRTUAL'], ['stored', 'STORED']]}
            onCommit={v => commit({ generated: { ...col.generated!, stored: v === 'stored' } })} />
        </>
      )}
      {!col.generated && <DefaultEditor col={col} commit={commit} />}
      {supportsCharset(col.type.base) && (
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Charset" value={col.charset ?? ''}
            options={[['', 'table default'], ...Object.keys(CHARSETS).map(cs => [cs, cs] as [string, string])]}
            onCommit={v => commit({ charset: v || undefined, collation: v ? CHARSETS[v]?.[0] : undefined })} />
          <SelectField label="Collation" value={col.collation ?? ''} disabled={!col.charset}
            options={[['', 'default'], ...(CHARSETS[col.charset ?? ''] ?? []).map(cl => [cl, cl] as [string, string])]}
            onCommit={v => commit({ collation: v || undefined })} />
        </div>
      )}
      <TextField label="Comment" value={col.comment ?? ''} onCommit={v => commit({ comment: v || undefined })} />
      <div className="flex gap-1.5 mt-2.5">
        <button className="kbtn" title="move up" onClick={() => apply(moveColumn(content, table.id, col.id, -1))}>↑</button>
        <button className="kbtn" title="move down" onClick={() => apply(moveColumn(content, table.id, col.id, 1))}>↓</button>
        <button className="kbtn danger ml-auto" onClick={() => apply(deleteColumn(content, table.id, col.id))}>🗑 Delete</button>
      </div>
    </div>
  );
}

export function ColumnsTab({ table, expanded, onExpand }:
  { table: Table; expanded: string | null; onExpand: (id: string | null) => void }) {
  const content = useEditorStore(s => s.content)!;
  const apply = useEditorStore(s => s.apply);
  return (
    <div>
      {table.columns.map(col => (
        <div key={col.id}>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--panel-2)] text-[var(--ink)]"
            onClick={() => onExpand(expanded === col.id ? null : col.id)}>
            <span className="font-mono">{col.name}</span>
            <span className="ml-auto font-mono text-[11px] text-[var(--faint)]">{formatType(col.type)}</span>
            <span className="text-[var(--faint)]">{expanded === col.id ? '▾' : '▸'}</span>
          </button>
          {expanded === col.id && <ColumnEditor table={table} col={col} />}
        </div>
      ))}
      <button className="kbtn m-3"
        onClick={() => { const r = addColumn(content, table.id); apply(r.content); onExpand(r.columnId); }}>
        + Add column
      </button>
    </div>
  );
}
