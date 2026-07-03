'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { deriveEdges, CARD_SYMBOLS } from '@/lib/schema/derive';
import { tableById } from '@/lib/schema/ops/tables';
import { nodeRect, onEdgeRender } from './registry';
import { isEdgeKindHidden, onEdgeVisibility, edgeVisibilityVersion } from './edgeVisibility';

interface Rect { x: number; y: number; w: number; h: number }
interface Point { x: number; y: number }

function border(r: Rect, tx: number, ty: number): Point {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = Math.min(dx ? (r.w / 2) / Math.abs(dx) : Infinity, dy ? (r.h / 2) / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

export function computeEdgePath(a: Rect, b: Rect, selfLoop: boolean): { d: string; la: Point; lb: Point; mid: Point } {
  if (selfLoop) {
    const p1 = { x: a.x + a.w, y: a.y + 22 }, p2 = { x: a.x + a.w, y: a.y - 4 }, bow = 46;
    return {
      d: `M${p1.x} ${p1.y} C ${p1.x + bow} ${p1.y} ${p2.x + bow} ${p2.y} ${p2.x} ${p2.y}`,
      la: { x: p1.x + 13, y: p1.y }, lb: { x: p2.x + 13, y: p2.y },
      mid: { x: p1.x + bow, y: (p1.y + p2.y) / 2 },
    };
  }
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const A = border(a, cb.x, cb.y), B = border(b, ca.x, ca.y);
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
  const cv = Math.min(len * 0.10, 26), nx = -dy / len * cv, ny = dx / len * cv, ux = dx / len, uy = dy / len;
  return {
    d: `M${A.x} ${A.y} Q ${mx + nx} ${my + ny} ${B.x} ${B.y}`,
    la: { x: A.x + ux * 15 - uy * 7, y: A.y + uy * 15 + ux * 7 },
    lb: { x: B.x - ux * 17 - uy * 7, y: B.y - uy * 17 + ux * 7 },
    mid: { x: mx + nx * 2.2, y: my + ny * 2.2 },
  };
}

export function EdgeLayer() {
  const content = useEditorStore(s => s.content);
  const selection = useEditorStore(s => s.selection);
  useSyncExternalStore(onEdgeVisibility, edgeVisibilityVersion, edgeVisibilityVersion);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => onEdgeRender(() => {
    const svg = svgRef.current;
    const c = useEditorStore.getState().content;
    if (!svg || !c) return;
    for (const e of deriveEdges(c)) {
      const from = tableById(c, e.fromTableId), to = tableById(c, e.toTableId);
      if (!from || !to) continue;
      const geo = computeEdgePath(nodeRect(from), nodeRect(to), e.fromTableId === e.toTableId);
      const g = svg.querySelector(`[data-edge-group="${e.id}"]`);
      if (!g) continue;
      g.querySelectorAll('path').forEach(p => p.setAttribute('d', geo.d));
      const texts = g.querySelectorAll('text');
      const pts = [geo.la, geo.lb, geo.mid];
      texts.forEach((t, i) => { if (pts[i]) { t.setAttribute('x', String(pts[i].x)); t.setAttribute('y', String(pts[i].y)); } });
    }
  }), []);

  if (!content) return null;
  const edges = deriveEdges(content);
  return (
    <svg id="edges" ref={svgRef} width={6400} height={4000} viewBox="0 0 6400 4000">
      <defs>
        {(['fk', 'logical'] as const).map(k => (
          <marker key={k} id={`ar-${k}`} viewBox="0 0 10 10" refX="8.5" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 1 L9 5 L0 9 z" fill={`var(--edge-${k})`} />
          </marker>
        ))}
      </defs>
      {edges.map(e => {
        const from = tableById(content, e.fromTableId), to = tableById(content, e.toTableId);
        if (!from || !to) return null;
        const geo = computeEdgePath(nodeRect(from), nodeRect(to), e.fromTableId === e.toTableId);
        const sel = selection.kind === 'edge' && selection.edgeId === e.id;
        const [sa, sb] = CARD_SYMBOLS[e.cardinality];
        return (
          <g key={e.id} data-edge-group={e.id} className={isEdgeKindHidden(e.kind) ? 'edge-hidden' : undefined}>
            <path className="ehit" data-edge={e.id} d={geo.d} style={{ pointerEvents: 'stroke' }} />
            <path className={`edge edge-${e.kind}${sel ? ' sel' : ''}`} data-edge={e.id} d={geo.d}
              markerEnd={`url(#ar-${e.kind})`} />
            <text className="elabel" x={geo.la.x} y={geo.la.y}>{sa}</text>
            <text className="elabel" x={geo.lb.x} y={geo.lb.y}>{sb}</text>
            {e.kind === 'logical' && e.label
              ? <text className="elabel" x={geo.mid.x} y={geo.mid.y}>{e.label}</text>
              : null}
          </g>
        );
      })}
    </svg>
  );
}
