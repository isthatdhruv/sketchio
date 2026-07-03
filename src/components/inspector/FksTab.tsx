'use client';
import { useState } from 'react';
import type { FkAction, ForeignKey, Table } from '@/lib/schema/types';
import { useEditorStore } from '@/store/editorStore';
import { addForeignKey, updateForeignKey, deleteForeignKey } from '@/lib/schema/ops/keys';
import { pkColumnsOf } from '@/lib/schema/ops/relations';
import { tableById } from '@/lib/schema/ops/tables';
import { confirmDanger } from '../ui/ConfirmDialog';
import { TextField, SelectField } from './fields';

const ACTIONS: Array<[string, string]> = [['', '—'], ['RESTRICT', 'RESTRICT'], ['CASCADE', 'CASCADE'], ['SET NULL', 'SET NULL'], ['NO ACTION', 'NO ACTION']];

function FkEditor({ table, fk }: { table: Table; fk: ForeignKey }) {
  const content = useEditorStore(s => s.content)!;
  const apply = useEditorStore(s => s.apply);
  const commit = (patch: Partial<Omit<ForeignKey, 'id'>>) => apply(updateForeignKey(content, table.id, fk.id, patch));
  const ref = tableById(content, fk.refTableId);
  const colSel = 'flex-1 rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-1.5 py-1 text-[11.5px] font-mono text-[var(--ink)]';
  return (
    <div className="px-3 pb-3 border-b border-[var(--panel-border)]">
      <TextField label="Constraint name" mono value={fk.name} onCommit={v => v.trim() && commit({ name: v.trim() })} />
      <SelectField label="References table" value={fk.refTableId}
        options={content.tables.map(t => [t.id, t.name])}
        onCommit={v => {
          const newRef = tableById(content, v);
          const pk = newRef ? pkColumnsOf(newRef) : [];
          commit({ refTableId: v, columnIds: fk.columnIds.slice(0, 1), refColumnIds: pk.slice(0, 1).map(c => c.id) });
        }} />
      <span className="block text-[11px] text-[var(--muted)] mt-2">Column pairs (local → referenced)</span>
      {fk.columnIds.map((cid, i) => (
        <div key={`${cid}-${i}`} className="flex items-center gap-1.5 mt-1">
          <select value={cid} aria-label="local column" className={colSel}
            onChange={e => commit({ columnIds: fk.columnIds.map((x, k) => k === i ? e.target.value : x) })}>
            {table.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="text-[var(--faint)]">→</span>
          <select value={fk.refColumnIds[i] ?? ''} aria-label="referenced column" className={colSel}
            onChange={e => commit({ refColumnIds: fk.columnIds.map((_, k) => k === i ? e.target.value : (fk.refColumnIds[k] ?? '')) })}>
            <option value="">—</option>
            {(ref?.columns ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="kbtn danger" title="remove pair"
            onClick={() => commit({
              columnIds: fk.columnIds.filter((_, k) => k !== i),
              refColumnIds: fk.refColumnIds.filter((_, k) => k !== i),
            })}>✕</button>
        </div>
      ))}
      {table.columns.length > fk.columnIds.length && (
        <button className="kbtn mt-1.5" onClick={() => {
          const unused = table.columns.find(c => !fk.columnIds.includes(c.id)) ?? table.columns[0];
          commit({ columnIds: [...fk.columnIds, unused.id], refColumnIds: [...fk.refColumnIds, ref?.columns[0]?.id ?? ''] });
        }}>+ add pair</button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <SelectField label="ON DELETE" value={fk.onDelete ?? ''} options={ACTIONS}
          onCommit={v => commit({ onDelete: (v || undefined) as FkAction | undefined })} />
        <SelectField label="ON UPDATE" value={fk.onUpdate ?? ''} options={ACTIONS}
          onCommit={v => commit({ onUpdate: (v || undefined) as FkAction | undefined })} />
      </div>
      <div className="flex mt-2.5">
        <button className="kbtn danger ml-auto" onClick={async () => {
          if (await confirmDanger(`Drop constraint \`${fk.name}\`? The FK columns stay.`, 'Drop')) {
            const cur = useEditorStore.getState();
            if (cur.content) cur.apply(deleteForeignKey(cur.content, table.id, fk.id));
          }
        }}>🗑 Drop constraint</button>
      </div>
    </div>
  );
}

export function FksTab({ table }: { table: Table; onOpenFkTab?: () => void }) {
  const content = useEditorStore(s => s.content)!;
  const apply = useEditorStore(s => s.apply);
  const [expanded, setExpanded] = useState<string | null>(null);
  const refName = (fk: ForeignKey) => tableById(content, fk.refTableId)?.name ?? '?';
  return (
    <div>
      {table.foreignKeys.map(fk => (
        <div key={fk.id}>
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--panel-2)] text-[var(--ink)]"
            onClick={() => setExpanded(expanded === fk.id ? null : fk.id)}>
            <span className="font-mono">{fk.name}</span>
            <span className="ml-auto font-mono text-[11px] text-[var(--faint)]">→ {refName(fk)}</span>
            <span className="text-[var(--faint)]">{expanded === fk.id ? '▾' : '▸'}</span>
          </button>
          {expanded === fk.id && <FkEditor table={table} fk={fk} />}
        </div>
      ))}
      <button className="kbtn m-3" disabled={table.columns.length === 0}
        onClick={() => {
          const target = content.tables.find(t => t.id !== table.id) ?? table;
          const pk = pkColumnsOf(target);
          if (!pk.length) return;
          const r = addForeignKey(content, table.id, {
            columnIds: [table.columns[0].id], refTableId: target.id, refColumnIds: [pk[0].id],
          });
          apply(r.content); setExpanded(r.fkId);
        }}>+ Add foreign key</button>
    </div>
  );
}
