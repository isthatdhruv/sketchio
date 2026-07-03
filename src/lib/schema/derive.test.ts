import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, tableById } from './ops/tables';
import { linkOneToMany, linkOneToOne, addLogicalEdge } from './ops/relations';
import { toggleUnique } from './ops/columns';
import { deriveEdges, columnBadges, adjacency, CARD_SYMBOLS } from './derive';

const pair = () => {
  let { content: c, tableId: p } = addTable(emptyContent(), 0, 0);
  c = renameTable(c, p, 'p');
  const r = addTable(c, 300, 0);
  return { c: renameTable(r.content, r.tableId, 'ch'), p, ch: r.tableId };
};

describe('deriveEdges', () => {
  it('derives m-1 for 1:N link and 1-1 for 1:1 link', () => {
    const { c, p, ch } = pair();
    const e1 = deriveEdges(linkOneToMany(c, p, ch).content);
    expect(e1.length).toBe(1);
    expect(e1[0]).toMatchObject({ kind: 'fk', fromTableId: ch, toTableId: p, cardinality: 'm-1' });
    const e2 = deriveEdges(linkOneToOne(c, p, ch).content);
    expect(e2[0].cardinality).toBe('1-1');
  });
  it('includes logical edges', () => {
    const { c, p, ch } = pair();
    const { content } = addLogicalEdge(c, { fromTableId: ch, toTableId: p, cardinality: 'm-m', label: 'x' });
    const edges = deriveEdges(content);
    expect(edges[0]).toMatchObject({ kind: 'logical', cardinality: 'm-m', label: 'x' });
  });
});

describe('columnBadges', () => {
  it('computes PK/AI/UN/NN and FK/UQ/IX membership', () => {
    let { c, p, ch } = pair();
    c = linkOneToMany(c, p, ch).content;
    let t = tableById(c, ch)!;
    const fkCol = t.columns.find(x => x.name === 'p_id')!;
    c = toggleUnique(c, ch, fkCol.id);
    t = tableById(c, ch)!;
    const badges = columnBadges(t);
    expect(badges.get(t.columns[0].id)).toEqual(['PK', 'NN', 'AI', 'UN']);
    expect(badges.get(fkCol.id)).toEqual(['FK', 'UQ', 'NN', 'UN', 'IX']);
  });
});

describe('adjacency + symbols', () => {
  it('maps both directions', () => {
    const { c, p, ch } = pair();
    const adj = adjacency(linkOneToMany(c, p, ch).content);
    expect(adj.get(p)!.has(ch)).toBe(true);
    expect(adj.get(ch)!.has(p)).toBe(true);
    expect(CARD_SYMBOLS['m-1']).toEqual(['N', '1']);
  });
});
