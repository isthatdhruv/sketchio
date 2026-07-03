export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(2, '0');
  return s.slice(0, 12);
}
