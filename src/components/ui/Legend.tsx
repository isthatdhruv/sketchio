'use client';
import { useSyncExternalStore } from 'react';
import { isEdgeKindHidden, onEdgeVisibility, toggleEdgeKind, edgeVisibilityVersion } from '@/components/canvas/edgeVisibility';

export function Legend() {
  useSyncExternalStore(onEdgeVisibility, edgeVisibilityVersion, edgeVisibilityVersion);
  return (
    <div className="panel" style={{ right: 14, bottom: 14, padding: '10px 12px', width: 230, fontSize: 11.5, zIndex: 110 }}>
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] mb-1.5">Relationships · click to toggle</h2>
      <button className={`flex items-center gap-2 py-0.5 w-full text-left ${isEdgeKindHidden('fk') ? 'opacity-40' : ''}`}
        onClick={() => toggleEdgeKind('fk')}>
        <span style={{ width: 22, borderTop: '2.5px solid var(--edge-fk)' }} />
        <span>Foreign key</span><span className="ml-auto text-[10px] text-[var(--faint)]">enforced</span>
      </button>
      <button className={`flex items-center gap-2 py-0.5 w-full text-left ${isEdgeKindHidden('logical') ? 'opacity-40' : ''}`}
        onClick={() => toggleEdgeKind('logical')}>
        <span style={{ width: 22, borderTop: '2.5px dashed var(--edge-logical)' }} />
        <span>Logical link</span><span className="ml-auto text-[10px] text-[var(--faint)]">no DDL</span>
      </button>
      <div className="mt-2 pt-2 border-t border-[var(--panel-border)] text-[10.5px] text-[var(--muted)] leading-relaxed">
        <b className="text-[var(--ink)]">1 / N</b> labels mark cardinality at line ends ·
        <b className="text-[var(--ink)]"> drag</b> pan · <b className="text-[var(--ink)]">scroll</b> zoom ·
        <b className="text-[var(--ink)]"> del</b> remove · <b className="text-[var(--ink)]">ctrl+z</b> undo
      </div>
    </div>
  );
}
