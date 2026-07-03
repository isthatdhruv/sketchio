import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDDL } from './parse';

const fixture = (name: string) => readFileSync(join(__dirname, '../../test/fixtures', name), 'utf8');

describe('parseDDL edge cases', () => {
  const { content, issues } = parseDDL(fixture('edgecases.sql'));
  const t = (name: string) => content.tables.find(x => x.name === name)!;
  const col = (tn: string, cn: string) => t(tn).columns.find(x => x.name === cn)!;

  it('maps tables and columns', () => {
    expect(content.tables.map(x => x.name).sort()).toEqual(['orders', 'users']);
    expect(col('users', 'active').type.base).toBe('tinyint');
    expect(col('orders', 'status').type.values).toEqual(['new', 'paid', 'shipped']);
    expect(col('orders', 'total')).toMatchObject({ type: { base: 'decimal', precision: 12, scale: 2 }, default: { kind: 'literal', value: '0.00' } });
    expect(col('orders', 'meta').default).toMatchObject({ kind: 'expression' });
    expect(col('orders', 'placed_at')).toMatchObject({
      type: { base: 'datetime', fsp: 3 },
      default: { kind: 'current_timestamp', fsp: 3 }, onUpdateCurrentTimestamp: true,
    });
    expect(col('orders', 'loc').type).toMatchObject({ base: 'point', srid: 4326 });
    expect(col('orders', 'cents').generated).toMatchObject({ stored: true });
    expect(col('orders', 'serial_col')).toMatchObject({ type: { base: 'bigint' }, unsigned: true, autoIncrement: true });
    expect(col('orders', 'note')).toBeTruthy();
  });
  it('maps indexes with prefix/desc/invisible and kinds', () => {
    const ix = t('orders').indexes.find(x => x.name === 'idx_status_prefix')!;
    expect(ix.visible).toBe(false);
    expect(ix.columns[1]).toMatchObject({ length: 10, order: 'DESC' });
    expect(t('orders').indexes.some(x => x.kind === 'fulltext')).toBe(true);
    expect(t('orders').indexes.some(x => x.kind === 'spatial')).toBe(true);
    expect(t('orders').indexes.some(x => x.name === 'idx_note')).toBe(true);
  });
  it('resolves fks, drops ghosts with issue', () => {
    const fks = t('orders').foreignKeys;
    expect(fks.map(f => f.name).sort()).toEqual(['fk_orders_users', 'fk_orders_users2']);
    expect(fks[0].onDelete).toBe('CASCADE');
    expect(issues.some(i => i.level === 'error' && /ghost_table/.test(i.message))).toBe(true);
  });
  it('table options land', () => {
    expect(t('orders').autoIncrementStart).toBe(1000);
    expect(t('orders').comment).toBe("order's");
  });
  it('logical comments resolve by name; unresolvable noted', () => {
    expect(content.logicalEdges.length).toBe(1);
    expect(content.logicalEdges[0]).toMatchObject({ cardinality: 'm-1', label: 'soft' });
    expect(issues.some(i => i.level === 'note' && /nowhere/.test(i.message))).toBe(true);
  });
  it('junk statement produces error issue but parsing continues', () => {
    expect(issues.some(i => i.level === 'error' && /TOTALLY NOT SQL/.test(i.statement))).toBe(true);
  });
});

describe('parseDDL on sakila', () => {
  const { content, issues } = parseDDL(fixture('sakila-schema.sql'));
  it('parses all 16 tables', () => {
    expect(content.tables.length).toBe(16);
    expect(issues.filter(i => i.level === 'error').length).toBe(0);
  });
  it('film.rating enum and film→language fk survive', () => {
    const film = content.tables.find(t => t.name === 'film')!;
    expect(film.columns.find(c => c.name === 'rating')!.type.values).toContain('PG-13');
    const lang = content.tables.find(t => t.name === 'language')!;
    expect(film.foreignKeys.some(fk => fk.refTableId === lang.id)).toBe(true);
  });
});
