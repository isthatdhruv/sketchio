// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Canvas } from './Canvas';
import { computeEdgePath } from './EdgeLayer';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';
import { linkOneToMany } from '@/lib/schema/ops/relations';

beforeEach(() => {
  let { content: c, tableId: users } = addTable(emptyContent(), 80, 80);
  c = renameTable(c, users, 'users');
  const r = addTable(c, 480, 160); c = renameTable(r.content, r.tableId, 'orders');
  c = linkOneToMany(c, users, r.tableId).content;
  useEditorStore.getState().initialize({ id: 'w', name: 'w', tableCount: 2, createdAt: 0, updatedAt: 0 }, c);
});

describe('EdgeLayer', () => {
  it('renders an fk edge with N/1 cardinality labels', () => {
    render(<Canvas />);
    expect(document.querySelector('.edge.edge-fk')).toBeTruthy();
    const labels = [...document.querySelectorAll('text.elabel')].map(t => t.textContent);
    expect(labels).toContain('N');
    expect(labels).toContain('1');
  });
});

describe('computeEdgePath', () => {
  it('anchors on facing borders for horizontal rects', () => {
    const a = { x: 0, y: 0, w: 100, h: 60 }, b = { x: 300, y: 0, w: 100, h: 60 };
    const { la, d } = computeEdgePath(a, b, false);
    expect(la.x).toBeGreaterThan(a.x + a.w - 1);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('Q');
  });
  it('self-loop uses a cubic out the right edge', () => {
    const a = { x: 0, y: 0, w: 100, h: 60 };
    const { d } = computeEdgePath(a, a, true);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('C');
  });
});
