import type { Table, WorkspaceContent } from '../schema/types';
import { adjacency } from '../schema/derive';

export const estimateHeight = (t: Table): number => 44 + t.columns.length * 22 + 26;

export function autoLayout(c: WorkspaceContent): WorkspaceContent {
  const out = structuredClone(c);
  const byId = new Map(out.tables.map(t => [t.id, t]));
  const adj = adjacency(out);
  const inDegree = new Map<string, number>(out.tables.map(t => [t.id, 0]));
  for (const t of out.tables)
    for (const fk of t.foreignKeys)
      inDegree.set(fk.refTableId, (inDegree.get(fk.refTableId) ?? 0) + 1);

  const seen = new Set<string>();
  const components: string[][] = [];
  const sortedIds = [...out.tables].sort((a, b) => a.name.localeCompare(b.name)).map(t => t.id);
  for (const start of sortedIds) {
    if (seen.has(start) || (adj.get(start)?.size ?? 0) === 0) continue;
    const comp: string[] = []; const q = [start]; seen.add(start);
    while (q.length) {
      const id = q.shift()!; comp.push(id);
      for (const n of [...(adj.get(id) ?? [])].sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name)))
        if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length ||
    byId.get(a[0])!.name.localeCompare(byId.get(b[0])!.name));

  let yBase = 60;
  for (const comp of components) {
    const root = [...comp].sort((a, b) =>
      (inDegree.get(b)! - inDegree.get(a)!) || byId.get(a)!.name.localeCompare(byId.get(b)!.name))[0];
    const layer = new Map<string, number>([[root, 0]]);
    const q = [root];
    while (q.length) {
      const id = q.shift()!;
      for (const n of [...(adj.get(id) ?? [])].sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name)))
        if (comp.includes(n) && !layer.has(n)) { layer.set(n, layer.get(id)! + 1); q.push(n); }
    }
    const layers = new Map<number, string[]>();
    for (const id of comp) {
      const l = layer.get(id) ?? 0;
      layers.set(l, [...(layers.get(l) ?? []), id]);
    }
    let compMaxY = yBase;
    for (const [l, ids] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
      let y = yBase;
      for (const id of ids.sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name))) {
        const t = byId.get(id)!;
        t.x = 60 + l * 320; t.y = y;
        y += estimateHeight(t) + 40;
      }
      compMaxY = Math.max(compMaxY, y);
    }
    yBase = compMaxY + 80;
  }

  const isolated = out.tables.filter(t => (adj.get(t.id)?.size ?? 0) === 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  let rowOffset = 0, col = 0, rowH = 0;
  for (const t of isolated) {
    t.x = 60 + col * 320; t.y = yBase + rowOffset;
    rowH = Math.max(rowH, estimateHeight(t) + 40);
    col++; if (col === 4) { col = 0; rowOffset += rowH; rowH = 0; }
  }
  return out;
}
