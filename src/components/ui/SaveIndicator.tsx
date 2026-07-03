'use client';
import { useEditorStore } from '@/store/editorStore';

const LABELS: Record<string, [string, string]> = {
  idle: ['—', 'var(--faint)'],
  dirty: ['Unsaved', 'var(--warn)'],
  saving: ['Saving…', 'var(--muted)'],
  saved: ['Saved', 'var(--ai)'],
  offline: ['Offline — will sync', 'var(--warn)'],
  error: ['Save failed', 'var(--danger)'],
};

export function SaveIndicator() {
  const status = useEditorStore(s => s.saveStatus);
  const [label, color] = LABELS[status] ?? LABELS.idle;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color }} title={`save status: ${status}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
