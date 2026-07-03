'use client';
import type { Table } from '@/lib/schema/types';
import { useEditorStore } from '@/store/editorStore';
import { updateTableOptions, duplicateTable, deleteTable } from '@/lib/schema/ops/tables';
import { ENGINES, CHARSETS } from '@/lib/schema/datatypes';
import { confirmDanger } from '../ui/ConfirmDialog';
import { TextField, NumField, SelectField } from './fields';

const COLORS = ['#0d9488', '#b45309', '#7c3aed', '#2563eb', '#e11d48', '#0e9f6e', '#c2410c', '#64748b'];

export function OptionsTab({ table }: { table: Table }) {
  const content = useEditorStore(s => s.content)!;
  const apply = useEditorStore(s => s.apply);
  const commit = (patch: Parameters<typeof updateTableOptions>[2]) =>
    apply(updateTableOptions(content, table.id, patch));
  return (
    <div className="px-3 pb-3">
      <SelectField label="Engine" value={table.engine ?? ''}
        options={[['', `workspace default (${content.settings.defaultEngine})`], ...ENGINES.map(e => [e, e] as [string, string])]}
        onCommit={v => commit({ engine: v || undefined })} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField label="Charset" value={table.charset ?? ''}
          options={[['', `default (${content.settings.defaultCharset})`], ...Object.keys(CHARSETS).map(cs => [cs, cs] as [string, string])]}
          onCommit={v => commit({ charset: v || undefined, collation: v ? CHARSETS[v]?.[0] : undefined })} />
        <SelectField label="Collation" value={table.collation ?? ''} disabled={!table.charset}
          options={[['', 'default'], ...(CHARSETS[table.charset ?? ''] ?? []).map(cl => [cl, cl] as [string, string])]}
          onCommit={v => commit({ collation: v || undefined })} />
      </div>
      <NumField label="AUTO_INCREMENT start" min={1} value={table.autoIncrementStart}
        onCommit={v => commit({ autoIncrementStart: v })} />
      <TextField label="Table comment" value={table.comment ?? ''} onCommit={v => commit({ comment: v || undefined })} />
      <span className="block text-[11px] text-[var(--muted)] mt-3 mb-1">Accent color</span>
      <div className="flex gap-1.5 flex-wrap">
        {COLORS.map(cl => (
          <button key={cl} title={cl}
            className={`w-5 h-5 rounded-md border ${table.color === cl ? 'ring-2 ring-[var(--accent)]' : 'border-[var(--panel-border)]'}`}
            style={{ background: cl }}
            onClick={() => commit({ color: table.color === cl ? undefined : cl })} />
        ))}
        <button className="kbtn" onClick={() => commit({ color: undefined })}>clear</button>
      </div>
      <div className="mt-4 pt-3 border-t border-[var(--panel-border)] flex gap-2">
        <button className="kbtn" onClick={() => {
          const r = duplicateTable(content, table.id);
          apply(r.content, { kind: 'table', tableId: r.tableId });
        }}>⧉ Duplicate</button>
        <button className="kbtn danger ml-auto" onClick={async () => {
          if (await confirmDanger(`Delete table \`${table.name}\` and its relationships?`, 'Delete table')) {
            const cur = useEditorStore.getState();
            if (cur.content) cur.apply(deleteTable(cur.content, table.id), { kind: 'none' });
          }
        }}>🗑 Delete table</button>
      </div>
    </div>
  );
}
