'use client';
import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { addTable } from '@/lib/schema/ops/tables';
import { TableNode } from './TableNode';
import { bindWorld, screenToWorld, setCamera, viewport, zoomAt } from './viewport';
import { useCanvasInteractions } from './interactions';
import { PopoverHost } from './popovers';
import { EdgeLayer } from './EdgeLayer';
import './canvas.css';

const TOOL_HINTS: Record<string, string> = {
  'link-1m': '1:N — click the parent table (the “1” side), then the child.',
  'link-11': '1:1 — click the parent table, then the child.',
  'link-mm': 'N:M — click the first table, then the second; a junction table is created.',
  'link-logical': 'Logical link — click the source table, then the target.',
};

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const content = useEditorStore(s => s.content);
  const tool = useEditorStore(s => s.tool);
  const setTool = useEditorStore(s => s.setTool);
  const setViewportContent = useEditorStore(s => s.setViewportContent);
  const loaded = !!content;

  useCanvasInteractions(canvasRef);

  useEffect(() => {
    if (!loaded) return;
    const c = useEditorStore.getState().content?.viewport;
    if (c) setCamera({ x: c.x, y: c.y, zoom: c.zoom });
  }, [loaded]);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    let commitTimer: ReturnType<typeof setTimeout>;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(el, ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => setViewportContent({ ...viewport }), 250);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const onDblClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      if (target.closest('.node') || target.closest('.panel') || target.closest('.cpop')) return;
      const st = useEditorStore.getState();
      if (!st.content || st.tool !== 'select') return;
      const p = screenToWorld(el, ev.clientX, ev.clientY);
      const r = addTable(st.content, p.x - 110, p.y - 20);
      st.apply(r.content, { kind: 'table', tableId: r.tableId });
    };
    el.addEventListener('dblclick', onDblClick);
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('dblclick', onDblClick); clearTimeout(commitTimer); };
  }, [setViewportContent, loaded]);

  if (!content) return null;
  return (
    <div id="canvas" ref={canvasRef} className={tool !== 'select' ? 'linking' : ''}>
      <div id="world" ref={bindWorld}>
        <EdgeLayer />
        {content.tables.map(t => <TableNode key={t.id} table={t} />)}
      </div>
      {content.tables.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-2xl border border-dashed border-[var(--panel-border)] px-8 py-6 text-center text-[13px] text-[var(--muted)]">
            Double-click the canvas or press <b className="text-[var(--ink)]">+ Table</b> to start designing
          </div>
        </div>
      )}
      {tool !== 'select' && (
        <div id="linkbanner" className="panel">
          <span><b>Link mode:</b> {TOOL_HINTS[tool]}</span>
          <span style={{ cursor: 'pointer', color: 'var(--muted)', fontWeight: 700 }} onClick={() => setTool('select')}>✕</span>
        </div>
      )}
      <PopoverHost />
    </div>
  );
}
