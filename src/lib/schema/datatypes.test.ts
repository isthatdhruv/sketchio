import { describe, it, expect } from 'vitest';
import { TYPES, TYPE_MAP, TYPE_ALIASES, formatType, supportsAutoIncrement, supportsUnsigned,
         supportsCharset, requiresExpressionDefault, isSpatialType, supportsTimeDefault, CHARSETS } from './datatypes';

describe('datatype catalog', () => {
  it('contains all MySQL 8.0 bases', () => {
    const bases = TYPES.map(t => t.base);
    for (const b of ['tinyint','smallint','mediumint','int','bigint','decimal','float','double','bit',
      'char','varchar','tinytext','text','mediumtext','longtext','binary','varbinary',
      'tinyblob','blob','mediumblob','longblob','enum','set',
      'date','time','datetime','timestamp','year','json',
      'geometry','point','linestring','polygon','multipoint','multilinestring','multipolygon','geometrycollection'])
      expect(bases, b).toContain(b);
    expect(new Set(bases).size).toBe(bases.length);
  });
  it('aliases resolve to catalog bases', () => {
    for (const target of Object.values(TYPE_ALIASES)) expect(TYPE_MAP.has(target)).toBe(true);
    expect(TYPE_ALIASES['integer']).toBe('int');
    expect(TYPE_ALIASES['boolean']).toBe('tinyint');
    expect(TYPE_ALIASES['numeric']).toBe('decimal');
  });
  it('formats types', () => {
    expect(formatType({ base: 'varchar', length: 255 })).toBe('varchar(255)');
    expect(formatType({ base: 'decimal', precision: 12, scale: 2 })).toBe('decimal(12,2)');
    expect(formatType({ base: 'decimal', precision: 10 })).toBe('decimal(10)');
    expect(formatType({ base: 'enum', values: ["a", "b'c"] })).toBe("enum('a','b''c')");
    expect(formatType({ base: 'datetime', fsp: 3 })).toBe('datetime(3)');
    expect(formatType({ base: 'text' })).toBe('text');
    expect(formatType({ base: 'bit', length: 8 })).toBe('bit(8)');
  });
  it('gates attributes by type', () => {
    expect(supportsAutoIncrement('int')).toBe(true);
    expect(supportsAutoIncrement('varchar')).toBe(false);
    expect(supportsUnsigned('decimal')).toBe(true);
    expect(supportsUnsigned('date')).toBe(false);
    expect(supportsCharset('varchar')).toBe(true);
    expect(supportsCharset('int')).toBe(false);
    expect(supportsCharset('enum')).toBe(true);
    expect(requiresExpressionDefault('json')).toBe(true);
    expect(requiresExpressionDefault('varchar')).toBe(false);
    expect(isSpatialType('point')).toBe(true);
    expect(supportsTimeDefault('datetime')).toBe(true);
    expect(supportsTimeDefault('date')).toBe(false);
  });
  it('has utf8mb4 collations with default first', () => {
    expect(CHARSETS['utf8mb4'][0]).toBe('utf8mb4_0900_ai_ci');
  });
});
