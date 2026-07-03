'use client';
import { memo, useEffect } from 'react';
import type { Table } from '@/lib/schema/types';
import { columnBadges } from '@/lib/schema/derive';
import { formatType } from '@/lib/schema/datatypes';
import { useEditorStore } from '@/store/editorStore';
import { registerNode, scheduleEdgeRender } from './registry';

export const TableNode = memo(function TableNode({ table }: { table: Table }) {
  const selected = useEditorStore(s => s.selection.kind === 'table' && s.selection.tableId === table.id);
  const isLinkSource = useEditorStore(s => s.linkSource === table.id);
  useEffect(() => { scheduleEdgeRender(); });
  const badges = columnBadges(table);
  return (
    <div className={`node${selected ? ' sel' : ''}${isLinkSource ? ' linksrc' : ''}`} data-node={table.id}
      ref={el => registerNode(table.id, el)}
      style={{ left: table.x, top: table.y, width: table.w, height: table.h || undefined,
        ...(table.color ? { ['--node-accent' as string]: table.color } : {}) }}>
      <div className="node-head" data-role="head">
        <div className="th-row">
          <span className="tname editable" contentEditable suppressContentEditableWarning
            data-commit="table-name" spellCheck={false}>{table.name}</span>
          <span className="hd-tools">
            <button data-act="delnode" title="delete table">🗑</button>
          </span>
        </div>
      </div>
      <div className="cols">
        {table.columns.map(col => (
          <div className={`col${badges.get(col.id)?.includes('PK') ? ' pk' : ''}`} key={col.id} data-col={col.id}>
            <span className="cn editable" contentEditable suppressContentEditableWarning
              data-commit="col-name" spellCheck={false}>{col.name}</span>
            <span className="badges">
              {(badges.get(col.id) ?? []).map(b => <span key={b} className={`tag t-${b.toLowerCase()}`}>{b}</span>)}
            </span>
            <span className="ct">{formatType(col.type)}{col.default ? <span className="cdef"> ≔</span> : null}</span>
            <button className="coledit" data-act="colmenu" title="column menu">▾</button>
          </div>
        ))}
        <button className="addcol" data-act="addcol">+ column</button>
      </div>
      <div className="rz" data-resize />
    </div>
  );
});
