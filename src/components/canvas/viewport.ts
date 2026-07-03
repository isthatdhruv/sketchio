import type { Table } from '@/lib/schema/types';
import { estimateHeight } from '@/lib/layout/autoLayout';

export const viewport = { x: 40, y: 40, zoom: 1 };
let worldEl: HTMLDivElement | null = null;
const subs = new Set<() => void>();
const apply = () => { if (worldEl) worldEl.style.transform = `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`; };

export function bindWorld(el: HTMLDivElement | null) { worldEl = el; apply(); }
export function setCamera(p: Partial<typeof viewport>) { Object.assign(viewport, p); apply(); subs.forEach(f => f()); }
export function onCamera(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }

export function zoomAt(canvas: HTMLElement, cx: number, cy: number, factor: number) {
  const nz = Math.min(2.4, Math.max(0.1, viewport.zoom * factor));
  const wx = (cx - viewport.x) / viewport.zoom, wy = (cy - viewport.y) / viewport.zoom;
  setCamera({ zoom: nz, x: cx - wx * nz, y: cy - wy * nz });
}

export function screenToWorld(canvas: HTMLElement, clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  return { x: (clientX - r.left - viewport.x) / viewport.zoom, y: (clientY - r.top - viewport.y) / viewport.zoom };
}

export function fitToContent(canvas: HTMLElement, tables: Table[], pad = 70) {
  if (!tables.length) { setCamera({ x: 40, y: 40, zoom: 1 }); return; }
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  for (const t of tables) {
    mnX = Math.min(mnX, t.x); mnY = Math.min(mnY, t.y);
    mxX = Math.max(mxX, t.x + t.w); mxY = Math.max(mxY, t.y + (t.h ?? estimateHeight(t)));
  }
  const W = canvas.clientWidth || 1200, H = canvas.clientHeight || 800;
  const zoom = Math.max(0.12, Math.min((W - pad * 2) / (mxX - mnX), (H - pad * 2) / (mxY - mnY), 1.15));
  setCamera({ zoom, x: (W - (mxX - mnX) * zoom) / 2 - mnX * zoom, y: (H - (mxY - mnY) * zoom) / 2 - mnY * zoom });
}
