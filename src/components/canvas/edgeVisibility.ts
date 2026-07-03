const hidden = new Set<'fk' | 'logical'>();
const subs = new Set<() => void>();
let version = 0;

export function toggleEdgeKind(kind: 'fk' | 'logical') {
  if (hidden.has(kind)) hidden.delete(kind); else hidden.add(kind);
  version++;
  subs.forEach(f => f());
}
export const isEdgeKindHidden = (kind: 'fk' | 'logical') => hidden.has(kind);
export const edgeVisibilityVersion = () => version;
export function onEdgeVisibility(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
