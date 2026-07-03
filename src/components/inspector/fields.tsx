'use client';
import { useState } from 'react';

const inputCls = 'w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-2 py-1 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]';

export function TextField({ label, value, onCommit, mono, placeholder }:
  { label: string; value: string; onCommit: (v: string) => void; mono?: boolean; placeholder?: string }) {
  return (
    <label className="block text-[11px] text-[var(--muted)] mt-2">
      <span className="block mb-0.5">{label}</span>
      <input key={value} defaultValue={value} spellCheck={false} placeholder={placeholder}
        className={`${inputCls} ${mono ? 'font-mono' : ''}`}
        onBlur={e => { if (e.target.value !== value) onCommit(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

export function NumField({ label, value, onCommit, min }:
  { label: string; value: number | undefined; onCommit: (v: number | undefined) => void; min?: number }) {
  const cur = value == null ? '' : String(value);
  return (
    <label className="block text-[11px] text-[var(--muted)] mt-2">
      <span className="block mb-0.5">{label}</span>
      <input key={cur} defaultValue={cur} type="number" min={min} className={inputCls}
        onBlur={e => {
          const v = e.target.value.trim() === '' ? undefined : Number(e.target.value);
          if (v !== value && !(v != null && Number.isNaN(v))) onCommit(v);
        }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

export function SelectField({ label, value, options, onCommit, disabled }:
  { label: string; value: string; options: Array<[string, string]>; onCommit: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block text-[11px] text-[var(--muted)] mt-2">
      <span className="block mb-0.5">{label}</span>
      <select value={value} disabled={disabled} className={inputCls}
        onChange={e => onCommit(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function CheckRow({ label, checked, disabled, onToggle }:
  { label: string; checked: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <label className={`flex items-center gap-2 text-[12px] mt-1.5 ${disabled ? 'opacity-40' : 'cursor-pointer'} text-[var(--ink)]`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle}
        className="accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export function ValuesEditor({ values, onCommit }: { values: string[]; onCommit: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onCommit(next);
  };
  return (
    <div className="mt-2">
      <span className="block text-[11px] text-[var(--muted)] mb-0.5">Values</span>
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="inline-flex items-center gap-1 rounded-md border border-[var(--panel-border)] bg-[var(--panel-2)] px-1.5 py-0.5 text-[11px] font-mono text-[var(--ink)]">
            <button title="move left" className="text-[var(--faint)] hover:text-[var(--accent)]" onClick={() => move(i, -1)}>‹</button>
            {v}
            <button title="move right" className="text-[var(--faint)] hover:text-[var(--accent)]" onClick={() => move(i, 1)}>›</button>
            <button title="remove" className="text-[var(--faint)] hover:text-[var(--danger)]"
              onClick={() => onCommit(values.filter((_, k) => k !== i))}>✕</button>
          </span>
        ))}
      </div>
      <input value={draft} spellCheck={false} placeholder="add value, press Enter"
        aria-label="add enum value"
        className={inputCls + ' mt-1 font-mono'}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && draft.trim()) {
            onCommit([...values, draft.trim()]);
            setDraft('');
          }
        }} />
    </div>
  );
}
