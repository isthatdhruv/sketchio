import { describe, it, expect } from 'vitest';
import { newId } from './id';

describe('newId', () => {
  it('returns 12-char lowercase alphanumeric ids', () => {
    const id = newId();
    expect(id).toMatch(/^[a-z0-9]{12}$/);
  });
  it('does not collide across 10k draws', () => {
    const seen = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(seen.size).toBe(10_000);
  });
});
