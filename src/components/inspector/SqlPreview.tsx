'use client';
import { useMemo, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { tableById } from '@/lib/schema/ops/tables';
import { generateTableSQL } from '@/lib/sql/generate';

export function SqlPreview({ tableId }: { tableId: string }) {
  const content = useEditorStore(s => s.content);
  const [copied, setCopied] = useState(false);
  const sql = useMemo(() => {
    const t = content && tableById(content, tableId);
    return t && content ? generateTableSQL(t, content) : '';
  }, [content, tableId]);
  if (!sql) return null;
  return (
    <div className="border-t border-[var(--panel-border)] max-h-[38%] flex flex-col">
      <div className="flex items-center px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">SQL preview</span>
        <button className="kbtn ml-auto" onClick={async () => {
          try { await navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* denied */ }
        }}>{copied ? '✓ copied' : '📋 copy'}</button>
      </div>
      <pre className="flex-1 overflow-auto px-3 pb-3 text-[10.5px] leading-relaxed font-mono text-[var(--ink)] whitespace-pre">
        {sql}
      </pre>
    </div>
  );
}
