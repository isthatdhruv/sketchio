import type { ColumnType } from './types';

export type ParamShape = 'none' | 'length' | 'length-required' | 'precision-scale' | 'fsp' | 'values';
export interface TypeSpec {
  base: string;
  category: 'numeric' | 'string' | 'datetime' | 'json' | 'spatial';
  params: ParamShape;
  integer?: boolean;          // AUTO_INCREMENT candidates
  numeric?: boolean;          // UNSIGNED/ZEROFILL allowed
  text?: boolean;             // charset/collation allowed
  noLiteralDefault?: boolean; // default must be expression (TEXT/BLOB/JSON/spatial)
  timeDefault?: boolean;      // CURRENT_TIMESTAMP default/on-update allowed
}

const num = (base: string): TypeSpec => ({ base, category: 'numeric', params: 'length', integer: true, numeric: true });
const spa = (base: string): TypeSpec => ({ base, category: 'spatial', params: 'none', noLiteralDefault: true });

export const TYPES: TypeSpec[] = [
  num('tinyint'), num('smallint'), num('mediumint'), num('int'), num('bigint'),
  { base: 'decimal', category: 'numeric', params: 'precision-scale', numeric: true },
  { base: 'float', category: 'numeric', params: 'precision-scale', numeric: true },
  { base: 'double', category: 'numeric', params: 'precision-scale', numeric: true },
  { base: 'bit', category: 'numeric', params: 'length' },
  { base: 'char', category: 'string', params: 'length', text: true },
  { base: 'varchar', category: 'string', params: 'length-required', text: true },
  { base: 'tinytext', category: 'string', params: 'none', text: true, noLiteralDefault: true },
  { base: 'text', category: 'string', params: 'none', text: true, noLiteralDefault: true },
  { base: 'mediumtext', category: 'string', params: 'none', text: true, noLiteralDefault: true },
  { base: 'longtext', category: 'string', params: 'none', text: true, noLiteralDefault: true },
  { base: 'binary', category: 'string', params: 'length' },
  { base: 'varbinary', category: 'string', params: 'length-required' },
  { base: 'tinyblob', category: 'string', params: 'none', noLiteralDefault: true },
  { base: 'blob', category: 'string', params: 'none', noLiteralDefault: true },
  { base: 'mediumblob', category: 'string', params: 'none', noLiteralDefault: true },
  { base: 'longblob', category: 'string', params: 'none', noLiteralDefault: true },
  { base: 'enum', category: 'string', params: 'values', text: true },
  { base: 'set', category: 'string', params: 'values', text: true },
  { base: 'date', category: 'datetime', params: 'none' },
  { base: 'time', category: 'datetime', params: 'fsp' },
  { base: 'datetime', category: 'datetime', params: 'fsp', timeDefault: true },
  { base: 'timestamp', category: 'datetime', params: 'fsp', timeDefault: true },
  { base: 'year', category: 'datetime', params: 'none' },
  { base: 'json', category: 'json', params: 'none', noLiteralDefault: true },
  spa('geometry'), spa('point'), spa('linestring'), spa('polygon'),
  spa('multipoint'), spa('multilinestring'), spa('multipolygon'), spa('geometrycollection'),
];

export const TYPE_MAP = new Map(TYPES.map(t => [t.base, t]));

export const TYPE_ALIASES: Record<string, string> = {
  integer: 'int', int4: 'int', int8: 'bigint',
  dec: 'decimal', numeric: 'decimal', fixed: 'decimal',
  bool: 'tinyint', boolean: 'tinyint',
  'double precision': 'double', real: 'double',
  character: 'char', 'character varying': 'varchar', nvarchar: 'varchar', nchar: 'char',
};

export const specOf = (base: string): TypeSpec | undefined => TYPE_MAP.get(base);

const escVal = (v: string) => v.replace(/'/g, "''");

export function formatType(t: ColumnType): string {
  const spec = specOf(t.base);
  if (!spec) return t.base;
  switch (spec.params) {
    case 'length':
    case 'length-required':
      return t.length != null ? `${t.base}(${t.length})` : t.base;
    case 'precision-scale':
      if (t.precision == null) return t.base;
      return t.scale != null ? `${t.base}(${t.precision},${t.scale})` : `${t.base}(${t.precision})`;
    case 'fsp':
      return t.fsp != null && t.fsp > 0 ? `${t.base}(${t.fsp})` : t.base;
    case 'values':
      return `${t.base}(${(t.values ?? []).map(v => `'${escVal(v)}'`).join(',')})`;
    default:
      return t.base;
  }
}

export const supportsAutoIncrement = (b: string) => !!specOf(b)?.integer;
export const supportsUnsigned = (b: string) => !!specOf(b)?.numeric;
export const supportsCharset = (b: string) => !!specOf(b)?.text;
export const requiresExpressionDefault = (b: string) => !!specOf(b)?.noLiteralDefault;
export const isSpatialType = (b: string) => specOf(b)?.category === 'spatial';
export const supportsTimeDefault = (b: string) => !!specOf(b)?.timeDefault;

export const ENGINES = ['InnoDB', 'MyISAM', 'MEMORY', 'ARCHIVE', 'CSV'];

export const CHARSETS: Record<string, string[]> = {
  utf8mb4: ['utf8mb4_0900_ai_ci', 'utf8mb4_general_ci', 'utf8mb4_unicode_ci', 'utf8mb4_bin'],
  utf8mb3: ['utf8mb3_general_ci', 'utf8mb3_unicode_ci', 'utf8mb3_bin'],
  latin1: ['latin1_swedish_ci', 'latin1_general_ci', 'latin1_bin'],
  ascii: ['ascii_general_ci', 'ascii_bin'],
  binary: ['binary'],
};
