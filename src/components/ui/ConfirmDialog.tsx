'use client';
import { useSyncExternalStore } from 'react';

interface ConfirmState { message: string; okLabel: string; resolve: (b: boolean) => void }
let state: ConfirmState | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export function confirmDanger(message: string, okLabel = 'Confirm'): Promise<boolean> {
  return new Promise(res => {
    state?.resolve(false);
    state = { message, okLabel, resolve: res };
    emit();
  });
}
function close(v: boolean) { const s = state; state = null; emit(); s?.resolve(v); }

export function ConfirmHost() {
  const s = useSyncExternalStore(cb => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state, () => null);
  if (!s) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'color-mix(in srgb, #0b0f16 55%, transparent)' }}
      onPointerDown={e => { if (e.target === e.currentTarget) close(false); }}>
      <div className="panel" style={{ position: 'relative', padding: '20px 22px', maxWidth: 340, width: 'calc(100% - 40px)' }}>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.5 }}>{s.message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="kbtn" onClick={() => close(false)}>Cancel</button>
          <button className="kbtn danger" onClick={() => close(true)}>{s.okLabel}</button>
        </div>
      </div>
    </div>
  );
}
