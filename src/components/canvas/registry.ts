import type { Table } from '@/lib/schema/types';
import { estimateHeight } from '@/lib/layout/autoLayout';

const els = new Map<string, HTMLDivElement>();
export const registerNode = (id: string, el: HTMLDivElement | null) => { if (el) els.set(id, el); else els.delete(id); };
export const nodeEl = (id: string) => els.get(id);

export function nodeRect(t: Table): { x: number; y: number; w: number; h: number } {
  const el = els.get(t.id);
  if (!el) return { x: t.x, y: t.y, w: t.w, h: t.h ?? estimateHeight(t) };
  return {
    x: parseFloat(el.style.left) || t.x,
    y: parseFloat(el.style.top) || t.y,
    w: el.offsetWidth || t.w,
    h: el.offsetHeight || estimateHeight(t),
  };
}

const listeners = new Set<() => void>();
let scheduled = false;
export function scheduleEdgeRender() {
  if (scheduled) return;
  if (typeof requestAnimationFrame === 'undefined') { listeners.forEach(f => f()); return; }
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; listeners.forEach(f => f()); });
}
export function onEdgeRender(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
