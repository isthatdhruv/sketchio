// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { downloadText, workspaceToJson, jsonToContent } from './files';
import { emptyContent, addTable } from '@/lib/schema/ops/tables';

const meta = { id: 'w', name: 'shop schema', tableCount: 1, createdAt: 0, updatedAt: 0 };

describe('workspace json round-trip', () => {
  it('preserves name and content', () => {
    const { content } = addTable(emptyContent(), 7, 8);
    const text = workspaceToJson(meta, content);
    const back = jsonToContent(text);
    expect(back.name).toBe('shop schema');
    expect(back.content.tables.length).toBe(1);
    expect(back.content.tables[0].x).toBe(7);
  });
  it('rejects non-workspace json with a readable message', () => {
    expect(() => jsonToContent('{}')).toThrow(/missing "content"/);
    expect(() => jsonToContent('not json')).toThrow(/Not valid JSON/);
    expect(() => jsonToContent('{"content": {"nope": 1}}')).toThrow(/invalid/);
  });
});

describe('downloadText', () => {
  it('creates and clicks an object-url anchor', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadText('a.sql', 'SELECT 1;');
    expect(createSpy).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    createSpy.mockRestore(); clickSpy.mockRestore();
  });
});
