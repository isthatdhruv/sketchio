export function uniqueName(desired: string, taken: Iterable<string>): string {
  const set = new Set(Array.from(taken, s => s.toLowerCase()));
  if (!set.has(desired.toLowerCase())) return desired;
  for (let n = 2; ; n++) {
    const candidate = `${desired}_${n}`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
}
