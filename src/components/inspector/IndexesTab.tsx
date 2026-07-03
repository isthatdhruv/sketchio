'use client';
import { useState } from 'react';
import type { IndexKind, Table, TableIndex } from '@/lib/schema/types';
import { useEditorStore } from '@/store/editorStore';
import { addIndex, updateIndex, deleteIndex } from '@/lib/schema/ops/keys';
import { specOf } from '@/lib/schema/datatypes';
import { TextField, SelectField, CheckRow, NumField } from './fields';

const KINDS: Array<[IndexKind, string]> = [
  ['primary', 'PRIMARY'], ['unique', 'UNIQUE'], ['index', 'INDEX'], ['fulltext', 'FULLTEXT'], ['spatial', 'SPATIAL'],
];

function IndexEditor({ table, ix }: { table: Table; ix: TableIndex }) {
  const content = useEditorStore(s => s.content)!;
  const apply = useEditorStore(s => s.apply);
  const commit = (patch: Partial<Pick<TableIndex, 'name' | 'kind' | 'columns' | 'visible'>>) =>
    apply(updateIndex(content, table.id, ix.id, patch));
  const otherPrimary = table.indexes.some(i => i.kind === 'primary' && i.id !== ix.id);
  const unused = table.columns.filter(c => !ix.columns.some(ic => ic.columnId === c.id));
  const colName = (id: string) => table.columns.find(c => c.id === id)?.name ?? '?';
  const prefixable = (id: string) => specOf(table.columns.find(c => c.id === id)?.type.base ?? '')?.category === 'string';
  return (
    <div className="px-3 pb-3 border-b border-[var(--panel-border)]">
      <TextField label="Name" mono value={ix.name} onCommit={v => v.trim() && commit({ name: v.trim() })} />
      <SelectField label="Kind" value={ix.kind}
        options={KINDS.filter(([k]) => k !== 'primary' || !otherPrimary).map(([k, l]) => [k, l])}
        onCommit={v => commit({ kind: v as IndexKind, ...(v === 'primary' ? { name: 'PRIMARY' } : {}) })} />
      <CheckRow label="Visible" checked={ix.visible !== false} onToggle={() => commit({ visible: !(ix.visible !== false) })} />
      <span className="block text-[11px] text-[var(--muted)] mt-2">Index columns (ordered)</span>
      {ix.columns.map((ic, i) => (
        <div key={`${ic.columnId}-${i}`} className="flex items-center gap-1.5 mt-1">
          <select value={ic.columnId} aria-label="index column"
            className="flex-1 rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-1.5 py-1 text-[11.5px] font-mono text-[var(--ink)]"
            onChange={e => commit({ columns: ix.columns.map((x, k) => k === i ? { ...x, columnId: e.target.value } : x) })}>
            <option value={ic.columnId}>{colName(ic.columnId)}</option>
            {unused.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {prefixable(ic.columnId) && (
            <input type="number" placeholder="len" title="prefix length" value={ic.length ?? ''}
              className="w-14 rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-1.5 py-1 text-[11.5px] text-[var(--ink)]"
              onChange={e => commit({ columns: ix.columns.map((x, k) => k === i ? { ...x, length: e.target.value ? Number(e.target.value) : undefined } : x) })} />
          )}
          <button className="kbtn" title="direction"
            onClick={() => commit({ columns: ix.columns.map((x, k) => k === i ? { ...x, order: x.order === 'DESC' ? undefined : 'DESC' } : x) })}>
            {ic.order === 'DESC' ? '↓' : '↑'}
          </button>
          <button className="kbtn danger" title="remove"
            onClick={() => commit({ columns: ix.columns.filter((_, k) => k !== i) })}>✕</button>
        </div>
      ))}
      {unused.length > 0 && (
        <button className="kbtn mt-1.5"
          onClick={() => commit({ columns: [...ix.columns, { columnId: unused[0].id }] })}>+ add column</button>
      )}
      <div className="flex mt-2.5">
        <button className="kbtn danger ml-auto" onClick={() => apply(deleteIndex(content, table.id, ix.id))}>🗑 Delete index</button>
      </div>
    </div>
  );
}

export function IndexesTab({ table }: { table: Table }) {
  const content = useEditorStore(s => s.content)!;
  const apply = useEditorStore(s => s.apply);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<IndexKind>('index');
  return (
    <div>
      {table.indexes.map(ix => (
        <div key={ix.id}>
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--panel-2)] text-[var(--ink)]"
            onClick={() => setExpanded(expanded === ix.id ? null : ix.id)}>
            <span className="font-mono">{ix.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--muted)] border border-[var(--panel-border)] rounded px-1">{ix.kind}</span>
            <span className="ml-auto font-mono text-[11px] text-[var(--faint)]">
              {ix.columns.map(ic => table.columns.find(c => c.id === ic.columnId)?.name ?? '?').join(', ')}
            </span>
            <span className="text-[var(--faint)]">{expanded === ix.id ? '▾' : '▸'}</span>
          </button>
          {expanded === ix.id && <IndexEditor table={table} ix={ix} />}
        </div>
      ))}
      <div className="flex items-center gap-2 m-3">
        <select value={newKind} aria-label="new index kind"
          className="rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-1.5 py-1 text-[11.5px] text-[var(--ink)]"
          onChange={e => setNewKind(e.target.value as IndexKind)}>
          {KINDS.filter(([k]) => k !== 'primary' || !table.indexes.some(i => i.kind === 'primary'))
            .map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="kbtn" onClick={() => {
          const r = addIndex(content, table.id, newKind);
          if (r.indexId) { apply(r.content); setExpanded(r.indexId); }
        }}>+ Add index</button>
      </div>
    </div>
  );
}
