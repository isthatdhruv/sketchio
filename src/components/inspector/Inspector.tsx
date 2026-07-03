'use client';
import { useEffect, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { tableById } from '@/lib/schema/ops/tables';
import { ColumnsTab } from './ColumnsTab';
import { IndexesTab } from './IndexesTab';
import { FksTab } from './FksTab';
import { OptionsTab } from './OptionsTab';
import { SqlPreview } from './SqlPreview';

const TABS = ['Columns', 'Indexes', 'Foreign keys', 'Options'] as const;

export function Inspector() {
  const selection = useEditorStore(s => s.selection);
  const content = useEditorStore(s => s.content);
  const setSelection = useEditorStore(s => s.setSelection);
  const [tab, setTab] = useState(0);
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { tableId?: string; columnId?: string } | undefined;
      setTab(0);
      if (detail?.columnId) setExpandedCol(detail.columnId);
    };
    window.addEventListener('open-inspector', onOpen);
    return () => window.removeEventListener('open-inspector', onOpen);
  }, []);

  const table = selection.kind === 'table' && content ? tableById(content, selection.tableId) : undefined;
  if (!table) return null;

  return (
    <aside className="absolute right-0 top-0 bottom-0 w-[360px] z-[120] flex flex-col
      border-l border-[var(--panel-border)] bg-[var(--panel)] shadow-[-8px_0_30px_-18px_var(--node-shadow)]">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-[var(--panel-border)]">
        <span className="font-mono text-[13px] font-semibold text-[var(--ink)]">{table.name}</span>
        <button className="ml-auto text-[var(--muted)] hover:text-[var(--danger)] text-[13px]"
          title="close" onClick={() => setSelection({ kind: 'none' })}>✕</button>
      </header>
      <nav className="flex border-b border-[var(--panel-border)]">
        {TABS.map((t, i) => (
          <button key={t}
            className={`flex-1 py-1.5 text-[11.5px] ${i === tab
              ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] font-semibold'
              : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            onClick={() => setTab(i)}>{t}</button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto">
        {tab === 0 && <ColumnsTab table={table} expanded={expandedCol} onExpand={setExpandedCol} />}
        {tab === 1 && <IndexesTab table={table} />}
        {tab === 2 && <FksTab table={table} onOpenFkTab={() => setTab(2)} />}
        {tab === 3 && <OptionsTab table={table} />}
      </div>
      <SqlPreview tableId={table.id} />
    </aside>
  );
}
