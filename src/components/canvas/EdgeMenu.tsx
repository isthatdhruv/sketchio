'use client';
import { useEditorStore } from '@/store/editorStore';
import { deriveEdges } from '@/lib/schema/derive';
import { tableById } from '@/lib/schema/ops/tables';
import { updateForeignKey, deleteForeignKey } from '@/lib/schema/ops/keys';
import { updateLogicalEdge, deleteLogicalEdge } from '@/lib/schema/ops/relations';
import { confirmDanger } from '../ui/ConfirmDialog';
import { closePopovers } from './popovers';
import type { Cardinality, FkAction } from '@/lib/schema/types';

const ACTIONS: Array<FkAction | ''> = ['', 'RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'];
const CARDS: Array<[Cardinality, string]> = [['1-1', '1 – 1'], ['1-m', '1 – N'], ['m-1', 'N – 1'], ['m-m', 'N – N']];

export function EdgeMenu({ edgeId, x, y }: { edgeId: string; x: number; y: number }) {
  const content = useEditorStore(s => s.content);
  const apply = useEditorStore(s => s.apply);
  if (!content) return null;
  const edge = deriveEdges(content).find(e => e.id === edgeId);
  if (!edge) return null;
  const from = tableById(content, edge.fromTableId), to = tableById(content, edge.toTableId);

  if (edge.kind === 'fk') {
    const owner = tableById(content, edge.ownerTableId!);
    const fk = owner?.foreignKeys.find(f => f.id === edge.fkId);
    if (!owner || !fk) return null;
    return (
      <div className="cpop panel" style={{ left: x, top: y, minWidth: 220 }} data-popover>
        <p className="pt">{from?.name} → {to?.name}</p>
        <input defaultValue={fk.name} spellCheck={false} title="constraint name"
          onBlur={e => { const v = e.target.value.trim(); if (v && v !== fk.name) apply(updateForeignKey(content, owner.id, fk.id, { name: v })); }} />
        {(['onDelete', 'onUpdate'] as const).map(key => (
          <select key={key} value={fk[key] ?? ''} title={key === 'onDelete' ? 'ON DELETE' : 'ON UPDATE'}
            onChange={e => {
              const v = e.target.value as FkAction | '';
              apply(updateForeignKey(content, owner.id, fk.id, { [key]: v || undefined } as Partial<typeof fk>));
            }}>
            {ACTIONS.map(a => <option key={a} value={a}>{(key === 'onDelete' ? 'ON DELETE ' : 'ON UPDATE ') + (a || '—')}</option>)}
          </select>
        ))}
        <button className="kbtn danger" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={async () => {
            if (await confirmDanger(`Drop constraint \`${fk.name}\`? The FK columns stay.`, 'Drop')) {
              apply(deleteForeignKey(useEditorStore.getState().content!, owner.id, fk.id), { kind: 'none' });
              closePopovers();
            }
          }}>✕ Drop constraint</button>
      </div>
    );
  }

  const le = content.logicalEdges.find(l => l.id === edge.logicalId);
  if (!le) return null;
  return (
    <div className="cpop panel" style={{ left: x, top: y, minWidth: 200 }} data-popover>
      <p className="pt">{from?.name} ⇢ {to?.name} (logical)</p>
      <div className="grid2">
        {CARDS.map(([card, label]) => (
          <button key={card} className={`kbtn${le.cardinality === card ? ' cur' : ''}`}
            onClick={() => apply(updateLogicalEdge(content, le.id, { cardinality: card }))}>{label}</button>
        ))}
      </div>
      <input defaultValue={le.label ?? ''} placeholder="label (optional)" spellCheck={false}
        onBlur={e => { const v = e.target.value.trim(); if (v !== (le.label ?? '')) apply(updateLogicalEdge(content, le.id, { label: v || undefined })); }} />
      <button className="kbtn danger" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
        onClick={() => { apply(deleteLogicalEdge(content, le.id), { kind: 'none' }); closePopovers(); }}>
        ✕ Delete link</button>
    </div>
  );
}
