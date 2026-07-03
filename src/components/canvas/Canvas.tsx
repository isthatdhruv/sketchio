'use client';
import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { TableNode } from './TableNode';
import { bindWorld, setCamera, viewport, zoomAt } from './viewport';
import './canvas.css';

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const content = useEditorStore(s => s.content);
  const setViewportContent = useEditorStore(s => s.setViewportContent);
  const loaded = !!content;

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
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(commitTimer); };
  }, [setViewportContent, loaded]);

  if (!content) return null;
  return (
    <div id="canvas" ref={canvasRef}>
      <div id="world" ref={bindWorld}>
        {content.tables.map(t => <TableNode key={t.id} table={t} />)}
      </div>
    </div>
  );
}
