'use client';
import { useMemo, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { validateContent } from '@/lib/schema/validate';

export function ValidationPanel() {
  const content = useEditorStore(s => s.content);
  const setSelection = useEditorStore(s => s.setSelection);
  const [open, setOpen] = useState(false);
  const issues = useMemo(() => (content ? validateContent(content) : []), [content]);
  if (!content || issues.length === 0) return null;
  const errors = issues.filter(i => i.level === 'error').length;
  return (
    <div className="panel" style={{ left: 14, bottom: 14, maxWidth: 340, zIndex: 130 }}>
      <button className="flex items-center gap-2 px-3 py-2 w-full text-left" onClick={() => setOpen(!open)}>
        <span style={{ color: errors ? 'var(--danger)' : 'var(--warn)', fontSize: 12, fontWeight: 700 }}>
          ⚠ {issues.length} issue{issues.length > 1 ? 's' : ''}
        </span>
        <span className="ml-auto text-[var(--faint)] text-[11px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto px-2 pb-2">
          {issues.map(i => (
            <button key={i.id}
              className="block w-full text-left text-[11px] rounded-md px-2 py-1 hover:bg-[var(--panel-2)]"
              style={{ color: i.level === 'error' ? 'var(--danger)' : 'var(--warn)' }}
              onClick={() => {
                if (i.tableId) {
                  setSelection({ kind: 'table', tableId: i.tableId });
                  if (i.columnId) window.dispatchEvent(new CustomEvent('open-inspector', { detail: { tableId: i.tableId, columnId: i.columnId } }));
                }
              }}>
              {i.message}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
