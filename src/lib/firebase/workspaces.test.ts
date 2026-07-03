import { describe, it, expect } from 'vitest';
import { normalizeContent, contentByteSize } from './workspaces';
import { emptyContent, addTable } from '@/lib/schema/ops/tables';

describe('normalizeContent', () => {
  it('round-trips valid content', () => {
    const { content } = addTable(emptyContent(), 5, 6);
    const n = normalizeContent(JSON.parse(JSON.stringify(content)));
    expect(n.tables.length).toBe(1);
    expect(n.tables[0].x).toBe(5);
    expect(n.settings.defaultEngine).toBe('InnoDB');
  });
  it('fills defaults for partial tables', () => {
    const n = normalizeContent({ schemaVersion: 1, tables: [{ id: 't', name: 'x' }] });
    expect(n.tables[0]).toMatchObject({ w: 220, columns: [], indexes: [], foreignKeys: [] });
    expect(n.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });
  it('throws on garbage', () => {
    expect(() => normalizeContent(null)).toThrow(TypeError);
    expect(() => normalizeContent('x')).toThrow(TypeError);
    expect(() => normalizeContent({})).toThrow(TypeError);
  });
});

describe('contentByteSize', () => {
  it('measures encoded size', () => {
    expect(contentByteSize(emptyContent())).toBeGreaterThan(50);
  });
});
