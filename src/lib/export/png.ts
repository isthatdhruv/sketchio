import { toPng } from 'html-to-image';
import type { Table } from '@/lib/schema/types';
import { estimateHeight } from '@/lib/layout/autoLayout';

export async function exportPng(worldEl: HTMLElement, tables: Table[]): Promise<Blob> {
  if (!tables.length) throw new Error('Nothing to export — the diagram is empty.');
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  for (const t of tables) {
    mnX = Math.min(mnX, t.x); mnY = Math.min(mnY, t.y);
    mxX = Math.max(mxX, t.x + t.w); mxY = Math.max(mxY, t.y + (t.h ?? estimateHeight(t)));
  }
  const pad = 60;
  const w = Math.ceil(mxX - mnX + pad * 2), h = Math.ceil(mxY - mnY + pad * 2);
  const prev = {
    transform: worldEl.style.transform,
    width: worldEl.style.width,
    height: worldEl.style.height,
  };
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#e9edf3';
  document.body.classList.add('exporting');
  try {
    worldEl.style.transform = `translate(${-mnX + pad}px, ${-mnY + pad}px) scale(1)`;
    worldEl.style.width = `${w + Math.max(0, mnX)}px`;
    worldEl.style.height = `${h + Math.max(0, mnY)}px`;
    const dataUrl = await toPng(worldEl, {
      width: w, height: h, pixelRatio: 2, backgroundColor: bg,
      style: { transform: `translate(${-mnX + pad}px, ${-mnY + pad}px) scale(1)` },
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  } finally {
    worldEl.style.transform = prev.transform;
    worldEl.style.width = prev.width;
    worldEl.style.height = prev.height;
    document.body.classList.remove('exporting');
  }
}
