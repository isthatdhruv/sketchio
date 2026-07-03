'use client';
import { useSyncExternalStore } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { tableById } from '@/lib/schema/ops/tables';
import { togglePk, toggleNotNull, toggleAutoIncrement, toggleUnique, toggleIndex, deleteColumn } from '@/lib/schema/ops/columns';
import { columnBadges } from '@/lib/schema/derive';
import { supportsAutoIncrement } from '@/lib/schema/datatypes';

type PopState =
  | { kind: 'colmenu'; tableId: string; columnId: string; x: number; y: number }
  | { kind: 'edge'; edgeId: string; x: number; y: number }
  | null;

let state: PopState = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

const canvasPoint = (clientX: number, clientY: number) => {
  const r = document.getElementById('canvas')?.getBoundingClientRect();
  return { x: Math.max(8, Math.min((clientX - (r?.left ?? 0)) + 8, (r?.width ?? 600) - 220)),
           y: Math.max(8, Math.min((clientY - (r?.top ?? 0)) + 8, (r?.height ?? 400) - 260)) };
};

export function openColumnMenu(tableId: string, columnId: string, clientX: number, clientY: number) {
  state = { kind: 'colmenu', tableId, columnId, ...canvasPoint(clientX, clientY) };
  emit();
}
export function openEdgeMenu(edgeId: string, clientX: number, clientY: number) {
  state = { kind: 'edge', edgeId, ...canvasPoint(clientX, clientY) };
  emit();
}
export function closePopovers() { if (state) { state = null; emit(); } }
export function activePopover() { return state; }

function ColumnMenu({ s }: { s: Extract<PopState, { kind: 'colmenu' }> }) {
  const content = useEditorStore(st => st.content);
  const apply = useEditorStore(st => st.apply);
  const t = content && tableById(content, s.tableId);
  const col = t?.columns.find(x => x.id === s.columnId);
  if (!content || !t || !col) { return null; }
  const badges = columnBadges(t).get(col.id) ?? [];
  const toggles: Array<[string, boolean, () => typeof content, boolean]> = [
    ['PK', badges.includes('PK'), () => togglePk(content, s.tableId, s.columnId), true],
    ['NN', badges.includes('NN'), () => toggleNotNull(content, s.tableId, s.columnId), true],
    ['UQ', badges.includes('UQ'), () => toggleUnique(content, s.tableId, s.columnId), true],
    ['AI', badges.includes('AI'), () => toggleAutoIncrement(content, s.tableId, s.columnId), supportsAutoIncrement(col.type.base)],
    ['IX', badges.includes('IX'), () => toggleIndex(content, s.tableId, s.columnId), true],
  ];
  return (
    <div className="cpop panel" style={{ left: s.x, top: s.y }} data-popover>
      <p className="pt">{col.name}</p>
      <div className="grid2">
        {toggles.map(([label, on, op, enabled]) => (
          <button key={label} className={`kbtn${on ? ' cur' : ''}`} disabled={!enabled}
            style={enabled ? undefined : { opacity: .4, cursor: 'not-allowed' }}
            onClick={() => apply(op())}>{label}</button>
        ))}
        <button className="kbtn" onClick={() => {
          useEditorStore.getState().setSelection({ kind: 'table', tableId: s.tableId });
          window.dispatchEvent(new CustomEvent('open-inspector', { detail: { tableId: s.tableId, columnId: s.columnId } }));
          closePopovers();
        }}>Inspector →</button>
      </div>
      <button className="kbtn danger" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
        onClick={() => { apply(deleteColumn(content, s.tableId, s.columnId)); closePopovers(); }}>
        ✕ Delete column
      </button>
    </div>
  );
}

import { EdgeMenu } from './EdgeMenu';

export function PopoverHost() {
  const s = useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state, () => null);
  if (!s) return null;
  if (s.kind === 'colmenu') return <ColumnMenu s={s} />;
  return <EdgeMenu edgeId={s.edgeId} x={s.x} y={s.y} />;
}
