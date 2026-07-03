import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';
import { linkOneToMany } from '@/lib/schema/ops/relations';
import { autoLayout, estimateHeight } from './autoLayout';

const build = () => {
  let c = emptyContent();
  const ids: Record<string, string> = {};
  for (const n of ['a', 'b', 'c', 'lonely']) {
    const r = addTable(c, 0, 0); c = renameTable(r.content, r.tableId, n); ids[n] = r.tableId;
  }
  c = linkOneToMany(c, ids.a, ids.b).content;
  c = linkOneToMany(c, ids.a, ids.c).content;
  return { c, ids };
};

describe('autoLayout', () => {
  it('is deterministic and separates layers', () => {
    const { c, ids } = build();
    const l1 = autoLayout(c), l2 = autoLayout(c);
    expect(JSON.stringify(l1.tables.map(t => [t.name, t.x, t.y])))
      .toBe(JSON.stringify(l2.tables.map(t => [t.name, t.x, t.y])));
    const at = (id: string, l: typeof l1) => l.tables.find(t => t.id === id)!;
    expect(at(ids.a, l1).x).toBeLessThan(at(ids.b, l1).x);
    expect(at(ids.b, l1).x).toBe(at(ids.c, l1).x);
  });
  it('produces no overlapping rectangles', () => {
    const { c } = build();
    const l = autoLayout(c);
    const rects = l.tables.map(t => ({ x: t.x, y: t.y, w: t.w, h: estimateHeight(t) }));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `tables ${i} and ${j} overlap`).toBe(false);
      }
  });
});
