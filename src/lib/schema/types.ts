export type FkAction = 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'NO ACTION';
export type IndexKind = 'primary' | 'unique' | 'index' | 'fulltext' | 'spatial';
export type Cardinality = '1-1' | '1-m' | 'm-1' | 'm-m';

export interface ColumnType {
  base: string;               // canonical lowercase key into the datatype catalog
  length?: number;            // char/varchar/binary/varbinary/bit
  precision?: number;         // decimal/float/double
  scale?: number;
  fsp?: number;               // time/datetime/timestamp fractional seconds 0-6
  values?: string[];          // enum/set members (unescaped)
  srid?: number;              // spatial types
}

export interface ColumnDefault {
  kind: 'literal' | 'expression' | 'null' | 'current_timestamp';
  value?: string;             // literal text or expression body (without outer parens)
  fsp?: number;               // CURRENT_TIMESTAMP(fsp)
}

export interface Column {
  id: string; name: string;
  type: ColumnType;
  nullable: boolean;
  unsigned?: boolean; zerofill?: boolean;
  default?: ColumnDefault;
  onUpdateCurrentTimestamp?: boolean; onUpdateFsp?: number;
  autoIncrement?: boolean;
  charset?: string; collation?: string;
  comment?: string;
  generated?: { expression: string; stored: boolean };
}

export interface IndexColumn { columnId: string; length?: number; order?: 'ASC' | 'DESC' }

export interface TableIndex {
  id: string; name: string; kind: IndexKind;
  columns: IndexColumn[]; visible: boolean;
}

export interface ForeignKey {
  id: string; name: string;
  columnIds: string[];
  refTableId: string; refColumnIds: string[];
  onDelete?: FkAction; onUpdate?: FkAction;
}

export interface Table {
  id: string; name: string; comment?: string;
  engine?: string; charset?: string; collation?: string; autoIncrementStart?: number;
  columns: Column[]; indexes: TableIndex[]; foreignKeys: ForeignKey[];
  x: number; y: number; w: number; h?: number; color?: string;
}

export interface LogicalEdge {
  id: string;
  fromTableId: string; fromColumnId?: string;
  toTableId: string; toColumnId?: string;
  cardinality: Cardinality; label?: string;
}

export interface WorkspaceSettings { defaultEngine: string; defaultCharset: string; defaultCollation: string }
export interface Viewport { x: number; y: number; zoom: number }

export interface WorkspaceContent {
  schemaVersion: 1;
  settings: WorkspaceSettings;
  tables: Table[];
  logicalEdges: LogicalEdge[];
  viewport: Viewport;
}

export interface WorkspaceMeta {
  id: string; name: string; tableCount: number;
  createdAt: number; updatedAt: number;   // epoch millis
}
