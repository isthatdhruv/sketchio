# MySQL ER Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js web app where signed-in users design MySQL 8.0 schemas on a Workbench-style diagram canvas, with full datatype/key/relationship fidelity, autosaving workspaces to Firestore, and SQL DDL export + import.

**Architecture:** Client-heavy Next.js (App Router) deployed on Vercel; Firebase Auth + Firestore called directly from the browser (Spark plan, no server code). Pure-TypeScript domain core (`lib/schema`, `lib/sql`) with React/canvas/Firebase as thin shells around it. Canvas is a React port of the proven hand-rolled engine in `docs/reference/bodh-er-prototype.html` (world-transform pan/zoom, imperative pointer interactions, SVG edges — now drawn in world coordinates).

**Tech Stack:** Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS 4 · Zustand 5 + zundo 2 · Firebase JS SDK 12 (Auth, Firestore) · node-sql-parser 5.4 · html-to-image · Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-03-mysql-er-workspace-design.md` (spec says "Next.js 15"; 16 is current stable with identical App Router usage — plan targets 16).

## Global Constraints

- MySQL **8.0** is the DDL target for generation, parsing, and validation.
- Firebase **Spark plan only**: no Cloud Functions, no server-side Firebase Admin. All Firestore/Auth calls from the client; enforcement via `firestore.rules`.
- `src/lib/schema/**` and `src/lib/sql/**` MUST NOT import React, Zustand, Firebase, or anything from `components/`/`app/`. Pure TS + unit tests.
- All schema mutations are **pure functions** `(content, …) → content` (or `{content, …ids}`); UI never mutates content objects in place.
- Identifiers in generated SQL are always backtick-quoted; string literals single-quoted with `'` doubled and `\` escaped.
- Generated object names: FK constraints `fk_{child}_{parent}`, unique indexes `uq_{table}_{cols}`, plain indexes `idx_{table}_{cols}` — all collision-suffixed `_2`, `_3`, ….
- Import path alias: `@/*` → `src/*`.
- Every task ends with all tests green (`npm test`) and a git commit. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Node 22 / npm. Package versions pinned by `package-lock.json` at scaffold time (majors: next 16, react 19, zustand 5, zundo 2, firebase 12, node-sql-parser 5, vitest 4).
- Firestore document layout: `users/{uid}/workspaces/{wid}` (metadata) + `users/{uid}/workspaces/{wid}/content/schema` (blob). Serialized content > 800 KB triggers a UI warning.

## File Structure

```
src/
  app/
    layout.tsx globals.css page.tsx        # shell, theme vars, auth redirect
    login/page.tsx register/page.tsx reset/page.tsx
    dashboard/page.tsx
    w/[id]/page.tsx                        # editor route (client)
  lib/schema/
    types.ts        # all domain types (single source of truth)
    id.ts           # newId()
    datatypes.ts    # MySQL 8.0 type catalog + predicates + formatType
    naming.ts       # uniqueName helper shared by ops
    ops/tables.ts ops/columns.ts ops/keys.ts ops/relations.ts
    derive.ts       # edges from FKs, badges, adjacency
    validate.ts     # schema lint
    equal.ts        # canonicalize + semantic equality (round-trip tests)
  lib/sql/
    generate.ts     # model → DDL
    split.ts        # statement splitter + preprocess (SRID/serial/BINARY) + logical-comment extraction
    parse.ts        # node-sql-parser AST → model
  lib/layout/autoLayout.ts
  lib/firebase/app.ts auth.ts workspaces.ts
  store/editorStore.ts
  components/
    canvas/canvas.css Canvas.tsx TableNode.tsx EdgeLayer.tsx
    canvas/registry.ts interactions.ts popovers.tsx
    inspector/Inspector.tsx ColumnsTab.tsx IndexesTab.tsx FksTab.tsx OptionsTab.tsx SqlPreview.tsx ValidationPanel.tsx
    ui/Topbar.tsx Legend.tsx ConfirmDialog.tsx SaveIndicator.tsx ImportDialog.tsx ExportMenu.tsx AuthGate.tsx
  test/fixtures/   sakila-schema.sql edgecases.sql
docs/reference/bodh-er-prototype.html      # committed copy of the prototype
firestore.rules  .env.local.example  vercel: zero-config
```

Parser bake-off (already run, see spec §6): **node-sql-parser 5.4** chosen — 18/20 features vs 14/20 for sql-ddl-to-json-schema; Sakila parses 16/16 tables after preprocessing. Preprocessing must handle: `SRID n` (capture+strip), `serial` → `bigint unsigned not null auto_increment unique`, legacy `VARCHAR(n) BINARY` (strip + note). AST facts verified: single-statement `astify` returns a bare object (normalize to array); `ON UPDATE CURRENT_TIMESTAMP` without DEFAULT lands in `create_definitions[i].reference_definition.on_action`; generated columns in `.generated{expr,storage_type}`; index prefix length is `definition[j].suffix` string `"(20)"`; INVISIBLE in `index_options[{type:'invisible'}]`; expression ASTs are turned back into text by sqlify-ing a wrapper SELECT and stripping `SELECT `.

---

## Phase 0 — Scaffold

### Task 1: Scaffold Next.js app, test tooling, theme foundation

**Files:**
- Create: entire Next.js scaffold at repo root (`src/app/*`, configs), `vitest.config.mts`, `src/test/smoke.test.ts`, `src/app/globals.css` (replace), `src/app/layout.tsx` (replace)
- Already present: `docs/`, `.claude/`, `.git/` — must survive untouched

**Interfaces:**
- Produces: working `npm run dev|build|test`; CSS variables consumed by every later UI task; `@/*` alias.

- [ ] **Step 1: Scaffold into a temp dir and merge into repo root**

```bash
cd /home/babayaga/Projects/er-diagram-maker
npx create-next-app@latest _scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --turbopack --yes
rm -rf _scaffold/.git
cp -a _scaffold/. .
rm -rf _scaffold
git status   # expect: new scaffold files, docs/ and .claude/ untouched
```

- [ ] **Step 2: Install runtime + dev dependencies**

```bash
npm i zustand zundo firebase node-sql-parser html-to-image
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom
```

- [ ] **Step 3: Add vitest config and scripts**

Create `vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

In `package.json` scripts add: `"test": "vitest run", "test:watch": "vitest"`.

Create `src/test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('toolchain', () => { it('runs', () => expect(1 + 1).toBe(2)); });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` → expect `1 passed`.

- [ ] **Step 5: Replace `src/app/globals.css` with theme variables (ported from prototype)**

```css
@import "tailwindcss";

:root {
  --bg:#e9edf3; --grid:rgba(58,72,96,.10);
  --panel:#ffffff; --panel-2:#f4f7fb; --panel-border:#d0d8e4;
  --node-bg:#ffffff; --node-border:#cfd8e5; --node-shadow:rgba(20,30,50,.10);
  --ink:#1d2531; --muted:#6a7688; --faint:#95a0b2;
  --accent:#0d9488; --accent-soft:rgba(13,148,136,.10);
  --edge-fk:#0d9488; --edge-logical:#64748b;
  --pk:#c2410c; --uq:#7c3aed; --ix:#2563eb; --ai:#0e9f6e; --danger:#e11d48; --warn:#c97a0c;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg:#0c0f15; --grid:rgba(150,170,200,.06);
  --panel:#141a23; --panel-2:#0f141b; --panel-border:#28313f;
  --node-bg:#131922; --node-border:#2a3442; --node-shadow:rgba(0,0,0,.45);
  --ink:#e6ecf4; --muted:#8b97a9; --faint:#5d697b;
  --accent:#2dd4bf; --accent-soft:rgba(45,212,191,.12);
  --edge-fk:#2dd4bf; --edge-logical:#8794a8;
  --pk:#fb923c; --uq:#c4b5fd; --ix:#60a5fa; --ai:#34d399; --danger:#fb7185; --warn:#fbbf24;
}}
:root[data-theme="dark"] {
  --bg:#0c0f15; --grid:rgba(150,170,200,.06);
  --panel:#141a23; --panel-2:#0f141b; --panel-border:#28313f;
  --node-bg:#131922; --node-border:#2a3442; --node-shadow:rgba(0,0,0,.45);
  --ink:#e6ecf4; --muted:#8b97a9; --faint:#5d697b;
  --accent:#2dd4bf; --accent-soft:rgba(45,212,191,.12);
  --edge-fk:#2dd4bf; --edge-logical:#8794a8;
  --pk:#fb923c; --uq:#c4b5fd; --ix:#60a5fa; --ai:#34d399; --danger:#fb7185; --warn:#fbbf24;
}
html, body { height: 100%; }
body { font-family: var(--sans); color: var(--ink); background: var(--bg); }
```

- [ ] **Step 6: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'ER Workspace', description: 'MySQL ER diagram workspace' };

const themeInit = `try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Verify dev server and build**

```bash
npm run build        # expect: compiled successfully
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with vitest and theme foundation"
```

---

## Phase 1 — Domain core (pure TS)

### Task 2: Domain types + id generator

**Files:**
- Create: `src/lib/schema/types.ts`, `src/lib/schema/id.ts`, `src/lib/schema/id.test.ts`

**Interfaces:**
- Produces (consumed by every later task):

```ts
// types.ts — exact contents
export type FkAction = 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'NO ACTION';
export type IndexKind = 'primary' | 'unique' | 'index' | 'fulltext' | 'spatial';
export type Cardinality = '1-1' | '1-m' | 'm-1' | 'm-m';

export interface ColumnType {
  base: string;               // canonical lowercase key into the datatype catalog
  length?: number;            // char/varchar/binary/varbinary/bit; int display width omitted
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
```

```ts
// id.ts
export function newId(): string
```

- [ ] **Step 1: Write the failing test** — `src/lib/schema/id.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (`Cannot find module './id'`).

- [ ] **Step 3: Implement** — `src/lib/schema/types.ts` exactly as in Interfaces above, and `src/lib/schema/id.ts`:

```ts
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(2, '0');
  return s.slice(0, 12);
}
```

- [ ] **Step 4: Run to verify pass** — `npm test` → all pass.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(schema): domain types and id generator"`

### Task 3: MySQL 8.0 datatype catalog

**Files:**
- Create: `src/lib/schema/datatypes.ts`, `src/lib/schema/datatypes.test.ts`

**Interfaces:**
- Consumes: `ColumnType` from `@/lib/schema/types`.
- Produces:

```ts
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
export const TYPES: TypeSpec[];
export const TYPE_MAP: Map<string, TypeSpec>;
export const TYPE_ALIASES: Record<string, string>;
export function specOf(base: string): TypeSpec | undefined;
export function formatType(t: ColumnType): string;      // 'varchar(255)', 'decimal(10,2)', "enum('a','b')", 'datetime(3)', 'point'
export function supportsAutoIncrement(base: string): boolean;
export function supportsUnsigned(base: string): boolean;
export function supportsCharset(base: string): boolean;
export function requiresExpressionDefault(base: string): boolean;
export function isSpatialType(base: string): boolean;
export function supportsTimeDefault(base: string): boolean;
export const ENGINES: string[];                          // ['InnoDB','MyISAM','MEMORY','ARCHIVE','CSV']
export const CHARSETS: Record<string, string[]>;         // charset -> common collations, first = default
```

- [ ] **Step 1: Write the failing test** — `src/lib/schema/datatypes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/schema/datatypes.ts`:

```ts
import type { ColumnType } from './types';

export type ParamShape = 'none' | 'length' | 'length-required' | 'precision-scale' | 'fsp' | 'values';
export interface TypeSpec {
  base: string;
  category: 'numeric' | 'string' | 'datetime' | 'json' | 'spatial';
  params: ParamShape;
  integer?: boolean;
  numeric?: boolean;
  text?: boolean;
  noLiteralDefault?: boolean;
  timeDefault?: boolean;
}

const num = (base: string, params: ParamShape = 'length', integer = true): TypeSpec =>
  ({ base, category: 'numeric', params, integer, numeric: true });
const spa = (base: string): TypeSpec =>
  ({ base, category: 'spatial', params: 'none', noLiteralDefault: true });

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
```

- [ ] **Step 4: Run to verify pass** — `npm test`.

- [ ] **Step 5: Commit** — `git commit -am "feat(schema): MySQL 8.0 datatype catalog"`

### Task 4: Table ops

**Files:**
- Create: `src/lib/schema/naming.ts`, `src/lib/schema/ops/tables.ts`, `src/lib/schema/ops/tables.test.ts`

**Interfaces:**
- Consumes: types (Task 2), `newId` (Task 2).
- Produces:

```ts
// naming.ts
export function uniqueName(desired: string, taken: Iterable<string>): string; // 'users' -> 'users_2' -> 'users_3'
// ops/tables.ts — every fn returns a NEW WorkspaceContent (structuredClone based)
export function emptyContent(): WorkspaceContent;   // schemaVersion 1, InnoDB/utf8mb4/utf8mb4_0900_ai_ci, viewport {x:0,y:0,zoom:1}
export function addTable(c: WorkspaceContent, x: number, y: number): { content: WorkspaceContent; tableId: string };
export function renameTable(c: WorkspaceContent, tableId: string, name: string): WorkspaceContent;
export function updateTableOptions(c: WorkspaceContent, tableId: string,
  patch: Partial<Pick<Table, 'engine'|'charset'|'collation'|'comment'|'autoIncrementStart'|'color'>>): WorkspaceContent;
export function deleteTable(c: WorkspaceContent, tableId: string): WorkspaceContent;
export function duplicateTable(c: WorkspaceContent, tableId: string): { content: WorkspaceContent; tableId: string };
export function moveTable(c: WorkspaceContent, tableId: string, x: number, y: number): WorkspaceContent;
export function resizeTable(c: WorkspaceContent, tableId: string, w: number, h: number): WorkspaceContent;
export function setViewport(c: WorkspaceContent, vp: Viewport): WorkspaceContent;
export function mutate(c: WorkspaceContent, fn: (draft: WorkspaceContent) => void): WorkspaceContent; // shared helper
export function tableById(c: WorkspaceContent, id: string): Table | undefined;
```

- `addTable`: name `table_1`… unique; one column `id` int unsigned NOT NULL AUTO_INCREMENT; PRIMARY index named `PRIMARY` on it; `w: 220`.
- `deleteTable`: also removes FKs in *other* tables referencing it, and logical edges touching it.
- `duplicateTable`: fresh ids for table/columns/indexes (columnId references remapped), name `{name}_copy` uniqued, FKs NOT copied, position offset +30/+30.

- [ ] **Step 1: Write the failing test** — `src/lib/schema/ops/tables.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, deleteTable, duplicateTable, moveTable, tableById } from './tables';
import { uniqueName } from '../naming';

describe('uniqueName', () => {
  it('suffixes collisions', () => {
    expect(uniqueName('t', [])).toBe('t');
    expect(uniqueName('t', ['t'])).toBe('t_2');
    expect(uniqueName('t', ['t', 't_2'])).toBe('t_3');
  });
});

describe('table ops', () => {
  it('addTable creates pk id column and unique names', () => {
    let { content: c, tableId: a } = addTable(emptyContent(), 10, 20);
    const r2 = addTable(c, 50, 60); c = r2.content;
    const t1 = tableById(c, a)!, t2 = tableById(c, r2.tableId)!;
    expect(t1.name).toBe('table_1');
    expect(t2.name).toBe('table_2');
    expect(t1.columns[0]).toMatchObject({ name: 'id', nullable: false, autoIncrement: true, unsigned: true });
    expect(t1.indexes[0]).toMatchObject({ kind: 'primary', name: 'PRIMARY' });
    expect(t1.indexes[0].columns[0].columnId).toBe(t1.columns[0].id);
    expect(t1.x).toBe(10);
  });
  it('is immutable', () => {
    const c0 = emptyContent();
    const { content: c1 } = addTable(c0, 0, 0);
    expect(c0.tables.length).toBe(0);
    expect(c1.tables.length).toBe(1);
  });
  it('deleteTable cascades fks and logical edges', () => {
    let { content: c, tableId: a } = addTable(emptyContent(), 0, 0);
    const rb = addTable(c, 0, 0); c = rb.content;
    const ta = tableById(c, a)!, tb = tableById(c, rb.tableId)!;
    c = { ...c, tables: c.tables.map(t => t.id !== tb.id ? t : { ...t, foreignKeys: [
      { id: 'f1', name: 'fk_x', columnIds: [t.columns[0].id], refTableId: a, refColumnIds: [ta.columns[0].id] },
    ]}), logicalEdges: [{ id: 'l1', fromTableId: a, toTableId: tb.id, cardinality: 'm-1' }] };
    c = deleteTable(c, a);
    expect(c.tables.length).toBe(1);
    expect(c.tables[0].foreignKeys.length).toBe(0);
    expect(c.logicalEdges.length).toBe(0);
  });
  it('duplicateTable remaps ids and drops fks', () => {
    let { content: c, tableId: a } = addTable(emptyContent(), 0, 0);
    const orig = tableById(c, a)!;
    const dup = duplicateTable(c, a);
    const copy = tableById(dup.content, dup.tableId)!;
    expect(copy.name).toBe('table_1_copy');
    expect(copy.columns[0].id).not.toBe(orig.columns[0].id);
    expect(copy.indexes[0].columns[0].columnId).toBe(copy.columns[0].id);
    expect(copy.foreignKeys.length).toBe(0);
  });
  it('rename + move', () => {
    let { content: c, tableId: a } = addTable(emptyContent(), 0, 0);
    c = renameTable(c, a, 'users');
    c = moveTable(c, a, 99, 77);
    expect(tableById(c, a)).toMatchObject({ name: 'users', x: 99, y: 77 });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (modules missing).

- [ ] **Step 3: Implement** — `src/lib/schema/naming.ts`:

```ts
export function uniqueName(desired: string, taken: Iterable<string>): string {
  const set = new Set(Array.from(taken, s => s.toLowerCase()));
  if (!set.has(desired.toLowerCase())) return desired;
  for (let n = 2; ; n++) {
    const candidate = `${desired}_${n}`;
    if (!set.has(candidate.toLowerCase())) return candidate;
  }
}
```

`src/lib/schema/ops/tables.ts`:

```ts
import type { Table, Viewport, WorkspaceContent } from '../types';
import { newId } from '../id';
import { uniqueName } from '../naming';

export const mutate = (c: WorkspaceContent, fn: (draft: WorkspaceContent) => void): WorkspaceContent => {
  const draft = structuredClone(c); fn(draft); return draft;
};
export const tableById = (c: WorkspaceContent, id: string) => c.tables.find(t => t.id === id);

export function emptyContent(): WorkspaceContent {
  return {
    schemaVersion: 1,
    settings: { defaultEngine: 'InnoDB', defaultCharset: 'utf8mb4', defaultCollation: 'utf8mb4_0900_ai_ci' },
    tables: [], logicalEdges: [], viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function addTable(c: WorkspaceContent, x: number, y: number): { content: WorkspaceContent; tableId: string } {
  const tableId = newId(); const colId = newId();
  const content = mutate(c, d => {
    const name = uniqueName(`table_${d.tables.length + 1}`, d.tables.map(t => t.name));
    d.tables.push({
      id: tableId, name, x: Math.round(x), y: Math.round(y), w: 220,
      columns: [{ id: colId, name: 'id', type: { base: 'int' }, nullable: false, unsigned: true, autoIncrement: true }],
      indexes: [{ id: newId(), name: 'PRIMARY', kind: 'primary', visible: true, columns: [{ columnId: colId }] }],
      foreignKeys: [],
    });
  });
  return { content, tableId };
}

export const renameTable = (c: WorkspaceContent, tableId: string, name: string) =>
  mutate(c, d => { const t = d.tables.find(t => t.id === tableId); if (t) t.name = name.trim() || t.name; });

export const updateTableOptions = (
  c: WorkspaceContent, tableId: string,
  patch: Partial<Pick<Table, 'engine' | 'charset' | 'collation' | 'comment' | 'autoIncrementStart' | 'color'>>,
) => mutate(c, d => { const t = d.tables.find(t => t.id === tableId); if (t) Object.assign(t, patch); });

export const deleteTable = (c: WorkspaceContent, tableId: string) => mutate(c, d => {
  d.tables = d.tables.filter(t => t.id !== tableId);
  for (const t of d.tables) t.foreignKeys = t.foreignKeys.filter(fk => fk.refTableId !== tableId);
  d.logicalEdges = d.logicalEdges.filter(e => e.fromTableId !== tableId && e.toTableId !== tableId);
});

export function duplicateTable(c: WorkspaceContent, tableId: string): { content: WorkspaceContent; tableId: string } {
  const src = tableById(c, tableId);
  if (!src) return { content: c, tableId };
  const copy = structuredClone(src);
  copy.id = newId();
  const idMap = new Map<string, string>();
  for (const col of copy.columns) { const nid = newId(); idMap.set(col.id, nid); col.id = nid; }
  for (const ix of copy.indexes) { ix.id = newId(); ix.columns = ix.columns.map(icol => ({ ...icol, columnId: idMap.get(icol.columnId) ?? icol.columnId })); }
  copy.foreignKeys = [];
  copy.x += 30; copy.y += 30;
  const content = mutate(c, d => {
    copy.name = uniqueName(`${src.name}_copy`, d.tables.map(t => t.name));
    d.tables.push(copy);
  });
  return { content, tableId: copy.id };
}

export const moveTable = (c: WorkspaceContent, tableId: string, x: number, y: number) =>
  mutate(c, d => { const t = d.tables.find(t => t.id === tableId); if (t) { t.x = Math.round(x); t.y = Math.round(y); } });
export const resizeTable = (c: WorkspaceContent, tableId: string, w: number, h: number) =>
  mutate(c, d => { const t = d.tables.find(t => t.id === tableId); if (t) { t.w = Math.max(200, Math.round(w)); t.h = Math.max(60, Math.round(h)); } });
export const setViewport = (c: WorkspaceContent, vp: Viewport) => mutate(c, d => { d.viewport = vp; });
```

- [ ] **Step 4: Run to verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(schema): table ops"`

### Task 5: Column ops + quick toggles

**Files:**
- Create: `src/lib/schema/ops/columns.ts`, `src/lib/schema/ops/columns.test.ts`

**Interfaces:**
- Consumes: `mutate`, `tableById` from `./tables`; catalog predicates from `../datatypes`; `uniqueName`.
- Produces:

```ts
export function addColumn(c: WorkspaceContent, tableId: string): { content: WorkspaceContent; columnId: string }; // 'new_column' uniqued, varchar(255) nullable
export function updateColumn(c: WorkspaceContent, tableId: string, columnId: string, patch: Partial<Omit<Column,'id'>>): WorkspaceContent;
export function deleteColumn(c: WorkspaceContent, tableId: string, columnId: string): WorkspaceContent;
export function moveColumn(c: WorkspaceContent, tableId: string, columnId: string, dir: -1 | 1): WorkspaceContent;
export function togglePk(c: WorkspaceContent, tableId: string, columnId: string): WorkspaceContent;
export function toggleNotNull(c: WorkspaceContent, tableId: string, columnId: string): WorkspaceContent;
export function toggleAutoIncrement(c: WorkspaceContent, tableId: string, columnId: string): WorkspaceContent;
export function toggleUnique(c: WorkspaceContent, tableId: string, columnId: string): WorkspaceContent;   // single-col uq_{table}_{col}
export function toggleIndex(c: WorkspaceContent, tableId: string, columnId: string): WorkspaceContent;    // single-col idx_{table}_{col}
```

Sanitization rules inside `updateColumn` (enforced, not optional): type change to non-numeric clears `unsigned`/`zerofill`/`autoIncrement`; to non-text clears `charset`/`collation`; to non-time clears `fsp`, `onUpdateCurrentTimestamp`, and `current_timestamp` defaults; setting `generated` clears `autoIncrement` and `default`; literal default on a `noLiteralDefault` type is converted to `{kind:'expression'}`. `deleteColumn` removes the column from all indexes (dropping indexes left empty) and removes FKs (in any table) whose `columnIds` or `refColumnIds` contain it. `togglePk` adds/removes membership in the `PRIMARY` index (creating/dropping it as needed) and forces `nullable:false` on add. `toggleAutoIncrement` forces `nullable:false`.

- [ ] **Step 1: Write the failing test** — `src/lib/schema/ops/columns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, tableById } from './tables';
import { addColumn, updateColumn, deleteColumn, moveColumn, togglePk, toggleNotNull,
         toggleAutoIncrement, toggleUnique, toggleIndex } from './columns';

const setup = () => {
  const { content, tableId } = addTable(emptyContent(), 0, 0);
  return { c: content, tid: tableId };
};

describe('column ops', () => {
  it('addColumn appends uniqued varchar', () => {
    let { c, tid } = setup();
    const r1 = addColumn(c, tid); c = r1.content;
    const r2 = addColumn(c, tid); c = r2.content;
    const t = tableById(c, tid)!;
    expect(t.columns[1]).toMatchObject({ name: 'new_column', nullable: true, type: { base: 'varchar', length: 255 } });
    expect(t.columns[2].name).toBe('new_column_2');
  });
  it('updateColumn sanitizes attributes on type change', () => {
    let { c, tid } = setup();
    const t0 = tableById(c, tid)!;
    c = updateColumn(c, tid, t0.columns[0].id, { type: { base: 'varchar', length: 40 } });
    const col = tableById(c, tid)!.columns[0];
    expect(col.unsigned).toBeUndefined();
    expect(col.autoIncrement).toBeUndefined();
  });
  it('literal default on json becomes expression', () => {
    let { c, tid } = setup();
    const r = addColumn(c, tid); c = r.content;
    c = updateColumn(c, tid, r.columnId, { type: { base: 'json' }, default: { kind: 'literal', value: 'json_array()' } });
    expect(tableById(c, tid)!.columns[1].default).toMatchObject({ kind: 'expression' });
  });
  it('deleteColumn cleans indexes and fks', () => {
    let { c, tid } = setup();
    const t0 = tableById(c, tid)!;
    const pkCol = t0.columns[0].id;
    const rb = addTable(c, 0, 0); c = rb.content;
    const child = tableById(c, rb.tableId)!;
    c = { ...c, tables: c.tables.map(t => t.id !== child.id ? t : { ...t, foreignKeys: [
      { id: 'f1', name: 'fk1', columnIds: [child.columns[0].id], refTableId: tid, refColumnIds: [pkCol] },
    ]}) };
    c = deleteColumn(c, tid, pkCol);
    const t = tableById(c, tid)!;
    expect(t.columns.length).toBe(0);
    expect(t.indexes.length).toBe(0);                               // PRIMARY dropped when emptied
    expect(tableById(c, rb.tableId)!.foreignKeys.length).toBe(0);   // referencing FK dropped
  });
  it('togglePk manages PRIMARY index and not-null', () => {
    let { c, tid } = setup();
    const r = addColumn(c, tid); c = r.content;
    c = togglePk(c, tid, r.columnId);
    let t = tableById(c, tid)!;
    expect(t.indexes.find(i => i.kind === 'primary')!.columns.length).toBe(2);
    expect(t.columns[1].nullable).toBe(false);
    c = togglePk(c, tid, r.columnId);
    c = togglePk(c, tid, t.columns[0].id);
    t = tableById(c, tid)!;
    expect(t.indexes.find(i => i.kind === 'primary')).toBeUndefined();
  });
  it('toggleUnique / toggleIndex create and remove named single-col indexes', () => {
    let { c, tid } = setup();
    const r = addColumn(c, tid); c = r.content;
    c = updateColumn(c, tid, r.columnId, { name: 'email' });
    c = toggleUnique(c, tid, r.columnId);
    c = toggleIndex(c, tid, r.columnId);
    let t = tableById(c, tid)!;
    expect(t.indexes.map(i => i.name)).toContain('uq_table_1_email');
    expect(t.indexes.map(i => i.name)).toContain('idx_table_1_email');
    c = toggleUnique(c, tid, r.columnId);
    t = tableById(c, tid)!;
    expect(t.indexes.map(i => i.name)).not.toContain('uq_table_1_email');
  });
  it('toggleNotNull flips, toggleAutoIncrement forces not-null, moveColumn reorders', () => {
    let { c, tid } = setup();
    const r = addColumn(c, tid); c = r.content;
    c = toggleNotNull(c, tid, r.columnId);
    expect(tableById(c, tid)!.columns[1].nullable).toBe(false);
    c = updateColumn(c, tid, r.columnId, { type: { base: 'int' }, nullable: true });
    c = toggleAutoIncrement(c, tid, r.columnId);
    expect(tableById(c, tid)!.columns[1]).toMatchObject({ autoIncrement: true, nullable: false });
    c = moveColumn(c, tid, r.columnId, -1);
    expect(tableById(c, tid)!.columns[0].id).toBe(r.columnId);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/schema/ops/columns.ts`:

```ts
import type { Column, Table, WorkspaceContent } from '../types';
import { newId } from '../id';
import { uniqueName } from '../naming';
import { requiresExpressionDefault, supportsAutoIncrement, supportsCharset, supportsTimeDefault, supportsUnsigned, specOf } from '../datatypes';
import { mutate } from './tables';

const tbl = (d: WorkspaceContent, id: string) => d.tables.find(t => t.id === id);
const col = (t: Table, id: string) => t.columns.find(c => c.id === id);

export function addColumn(c: WorkspaceContent, tableId: string): { content: WorkspaceContent; columnId: string } {
  const columnId = newId();
  const content = mutate(c, d => {
    const t = tbl(d, tableId); if (!t) return;
    t.columns.push({
      id: columnId,
      name: uniqueName('new_column', t.columns.map(x => x.name)),
      type: { base: 'varchar', length: 255 }, nullable: true,
    });
  });
  return { content, columnId };
}

export function sanitizeColumn(x: Column): void {
  const base = x.type.base;
  if (!supportsUnsigned(base)) { delete x.unsigned; delete x.zerofill; }
  if (!supportsAutoIncrement(base)) delete x.autoIncrement;
  if (!supportsCharset(base)) { delete x.charset; delete x.collation; }
  if (specOf(base)?.params !== 'fsp') delete x.type.fsp;
  if (!supportsTimeDefault(base)) {
    delete x.onUpdateCurrentTimestamp; delete x.onUpdateFsp;
    if (x.default?.kind === 'current_timestamp') delete x.default;
  }
  if (specOf(base)?.params !== 'values') delete x.type.values;
  if (x.generated) { delete x.autoIncrement; delete x.default; }
  if (x.default?.kind === 'literal' && requiresExpressionDefault(base))
    x.default = { kind: 'expression', value: x.default.value };
  if (x.autoIncrement) { x.nullable = false; delete x.default; }
}

export const updateColumn = (c: WorkspaceContent, tableId: string, columnId: string, patch: Partial<Omit<Column, 'id'>>) =>
  mutate(c, d => {
    const t = tbl(d, tableId); const x = t && col(t, columnId); if (!x) return;
    Object.assign(x, structuredClone(patch));
    sanitizeColumn(x);
  });

export const deleteColumn = (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
  const t = tbl(d, tableId); if (!t) return;
  t.columns = t.columns.filter(x => x.id !== columnId);
  t.indexes = t.indexes
    .map(ix => ({ ...ix, columns: ix.columns.filter(ic => ic.columnId !== columnId) }))
    .filter(ix => ix.columns.length > 0);
  for (const anyT of d.tables)
    anyT.foreignKeys = anyT.foreignKeys.filter(fk =>
      !fk.columnIds.includes(columnId) && !fk.refColumnIds.includes(columnId));
});

export const moveColumn = (c: WorkspaceContent, tableId: string, columnId: string, dir: -1 | 1) => mutate(c, d => {
  const t = tbl(d, tableId); if (!t) return;
  const i = t.columns.findIndex(x => x.id === columnId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= t.columns.length) return;
  [t.columns[i], t.columns[j]] = [t.columns[j], t.columns[i]];
});

export const togglePk = (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
  const t = tbl(d, tableId); if (!t) return;
  let pk = t.indexes.find(ix => ix.kind === 'primary');
  const member = pk?.columns.some(ic => ic.columnId === columnId);
  if (member) {
    pk!.columns = pk!.columns.filter(ic => ic.columnId !== columnId);
    if (pk!.columns.length === 0) t.indexes = t.indexes.filter(ix => ix !== pk);
  } else {
    if (!pk) { pk = { id: newId(), name: 'PRIMARY', kind: 'primary', visible: true, columns: [] }; t.indexes.unshift(pk); }
    pk.columns.push({ columnId });
    const x = col(t, columnId); if (x) x.nullable = false;
  }
});

export const toggleNotNull = (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
  const t = tbl(d, tableId); const x = t && col(t, columnId); if (x) x.nullable = !x.nullable;
});

export const toggleAutoIncrement = (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
  const t = tbl(d, tableId); const x = t && col(t, columnId); if (!x) return;
  if (x.autoIncrement) delete x.autoIncrement;
  else if (supportsAutoIncrement(x.type.base)) { x.autoIncrement = true; x.nullable = false; delete x.default; }
});

const toggleSingleColIndex = (kind: 'unique' | 'index', prefix: string) =>
  (c: WorkspaceContent, tableId: string, columnId: string) => mutate(c, d => {
    const t = tbl(d, tableId); if (!t) return;
    const existing = t.indexes.find(ix => ix.kind === kind && ix.columns.length === 1 && ix.columns[0].columnId === columnId);
    if (existing) { t.indexes = t.indexes.filter(ix => ix !== existing); return; }
    const x = col(t, columnId); if (!x) return;
    t.indexes.push({
      id: newId(),
      name: uniqueName(`${prefix}_${t.name}_${x.name}`, t.indexes.map(ix => ix.name)),
      kind, visible: true, columns: [{ columnId }],
    });
  });

export const toggleUnique = toggleSingleColIndex('unique', 'uq');
export const toggleIndex = toggleSingleColIndex('index', 'idx');
```

- [ ] **Step 4: Run to verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(schema): column ops with catalog-driven sanitization"`

### Task 6: Index + FK ops

**Files:**
- Create: `src/lib/schema/ops/keys.ts`, `src/lib/schema/ops/keys.test.ts`

**Interfaces:**
- Consumes: `mutate`, `tableById`, `uniqueName`, `newId`, types.
- Produces:

```ts
export function addIndex(c: WorkspaceContent, tableId: string, kind: IndexKind): { content: WorkspaceContent; indexId: string };
export function updateIndex(c: WorkspaceContent, tableId: string, indexId: string,
  patch: Partial<Pick<TableIndex, 'name'|'kind'|'columns'|'visible'>>): WorkspaceContent;
export function deleteIndex(c: WorkspaceContent, tableId: string, indexId: string): WorkspaceContent;
export function addForeignKey(c: WorkspaceContent, tableId: string,
  fk: { columnIds: string[]; refTableId: string; refColumnIds: string[]; onDelete?: FkAction; onUpdate?: FkAction; name?: string }
): { content: WorkspaceContent; fkId: string };
export function updateForeignKey(c: WorkspaceContent, tableId: string, fkId: string,
  patch: Partial<Omit<ForeignKey, 'id'>>): WorkspaceContent;
export function deleteForeignKey(c: WorkspaceContent, tableId: string, fkId: string): WorkspaceContent;
```

Rules: `addIndex('primary')` returns content unchanged if a primary already exists; auto-names `PRIMARY`/`uq_{table}_N`/`idx_{table}_N`/`ft_{table}_N`/`sp_{table}_N` uniqued; new non-primary indexes start with empty `columns` (UI fills them). `addForeignKey` auto-names `fk_{childName}_{parentName}` uniqued across ALL tables' FK names (MySQL constraint names are schema-global).

- [ ] **Step 1: Write the failing test** — `src/lib/schema/ops/keys.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, tableById } from './tables';
import { addIndex, updateIndex, deleteIndex, addForeignKey, updateForeignKey, deleteForeignKey } from './keys';

const setup2 = () => {
  let { content: c, tableId: a } = addTable(emptyContent(), 0, 0);
  const rb = addTable(c, 300, 0);
  return { c: rb.content, a, b: rb.tableId };
};

describe('index ops', () => {
  it('addIndex names by kind and refuses second primary', () => {
    let { c, a } = setup2();
    const r1 = addIndex(c, a, 'unique'); c = r1.content;
    const r2 = addIndex(c, a, 'fulltext'); c = r2.content;
    const t = tableById(c, a)!;
    expect(t.indexes.map(i => i.name)).toEqual(['PRIMARY', 'uq_table_1_1', 'ft_table_1_1']);
    const r3 = addIndex(c, a, 'primary');
    expect(r3.content).toBe(c); // unchanged reference: refused
  });
  it('update/delete index', () => {
    let { c, a } = setup2();
    const r = addIndex(c, a, 'index'); c = r.content;
    const t0 = tableById(c, a)!;
    c = updateIndex(c, a, r.indexId, { name: 'idx_custom', columns: [{ columnId: t0.columns[0].id, length: 10, order: 'DESC' }], visible: false });
    const ix = tableById(c, a)!.indexes.find(i => i.id === r.indexId)!;
    expect(ix).toMatchObject({ name: 'idx_custom', visible: false });
    expect(ix.columns[0]).toMatchObject({ length: 10, order: 'DESC' });
    c = deleteIndex(c, a, r.indexId);
    expect(tableById(c, a)!.indexes.find(i => i.id === r.indexId)).toBeUndefined();
  });
});

describe('fk ops', () => {
  it('addForeignKey auto-names globally unique constraints', () => {
    let { c, a, b } = setup2();
    const ta = tableById(c, a)!, tb = tableById(c, b)!;
    const r1 = addForeignKey(c, b, { columnIds: [tb.columns[0].id], refTableId: a, refColumnIds: [ta.columns[0].id] });
    c = r1.content;
    const r2 = addForeignKey(c, b, { columnIds: [tb.columns[0].id], refTableId: a, refColumnIds: [ta.columns[0].id] });
    c = r2.content;
    const names = tableById(c, b)!.foreignKeys.map(f => f.name);
    expect(names).toEqual(['fk_table_2_table_1', 'fk_table_2_table_1_2']);
  });
  it('update and delete fk', () => {
    let { c, a, b } = setup2();
    const ta = tableById(c, a)!, tb = tableById(c, b)!;
    const r = addForeignKey(c, b, { columnIds: [tb.columns[0].id], refTableId: a, refColumnIds: [ta.columns[0].id] });
    c = r.content;
    c = updateForeignKey(c, b, r.fkId, { onDelete: 'CASCADE', onUpdate: 'SET NULL' });
    expect(tableById(c, b)!.foreignKeys[0]).toMatchObject({ onDelete: 'CASCADE', onUpdate: 'SET NULL' });
    c = deleteForeignKey(c, b, r.fkId);
    expect(tableById(c, b)!.foreignKeys.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/schema/ops/keys.ts`:

```ts
import type { FkAction, ForeignKey, IndexKind, TableIndex, WorkspaceContent } from '../types';
import { newId } from '../id';
import { uniqueName } from '../naming';
import { mutate, tableById } from './tables';

const PREFIX: Record<IndexKind, string> = { primary: 'PRIMARY', unique: 'uq', index: 'idx', fulltext: 'ft', spatial: 'sp' };

export function addIndex(c: WorkspaceContent, tableId: string, kind: IndexKind): { content: WorkspaceContent; indexId: string } {
  const t0 = tableById(c, tableId);
  if (!t0) return { content: c, indexId: '' };
  if (kind === 'primary' && t0.indexes.some(ix => ix.kind === 'primary')) return { content: c, indexId: '' };
  const indexId = newId();
  const content = mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId)!;
    const name = kind === 'primary' ? 'PRIMARY'
      : uniqueName(`${PREFIX[kind]}_${t.name}_1`, t.indexes.map(ix => ix.name));
    t.indexes.push({ id: indexId, name, kind, visible: true, columns: [] });
  });
  return { content, indexId };
}

export const updateIndex = (c: WorkspaceContent, tableId: string, indexId: string,
  patch: Partial<Pick<TableIndex, 'name' | 'kind' | 'columns' | 'visible'>>) =>
  mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId);
    const ix = t?.indexes.find(i => i.id === indexId);
    if (ix) Object.assign(ix, structuredClone(patch));
  });

export const deleteIndex = (c: WorkspaceContent, tableId: string, indexId: string) =>
  mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId);
    if (t) t.indexes = t.indexes.filter(i => i.id !== indexId);
  });

export function addForeignKey(c: WorkspaceContent, tableId: string,
  fk: { columnIds: string[]; refTableId: string; refColumnIds: string[]; onDelete?: FkAction; onUpdate?: FkAction; name?: string },
): { content: WorkspaceContent; fkId: string } {
  const fkId = newId();
  const content = mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId); if (!t) return;
    const parent = d.tables.find(x => x.id === fk.refTableId);
    const allNames = d.tables.flatMap(x => x.foreignKeys.map(f => f.name));
    const name = fk.name ?? uniqueName(`fk_${t.name}_${parent?.name ?? 'ref'}`, allNames);
    const rec: ForeignKey = { id: fkId, name, columnIds: [...fk.columnIds], refTableId: fk.refTableId, refColumnIds: [...fk.refColumnIds] };
    if (fk.onDelete) rec.onDelete = fk.onDelete;
    if (fk.onUpdate) rec.onUpdate = fk.onUpdate;
    t.foreignKeys.push(rec);
  });
  return { content, fkId };
}

export const updateForeignKey = (c: WorkspaceContent, tableId: string, fkId: string, patch: Partial<Omit<ForeignKey, 'id'>>) =>
  mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId);
    const fk = t?.foreignKeys.find(f => f.id === fkId);
    if (fk) Object.assign(fk, structuredClone(patch));
  });

export const deleteForeignKey = (c: WorkspaceContent, tableId: string, fkId: string) =>
  mutate(c, d => {
    const t = d.tables.find(x => x.id === tableId);
    if (t) t.foreignKeys = t.foreignKeys.filter(f => f.id !== fkId);
  });
```

- [ ] **Step 4: Run to verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(schema): index and foreign key ops"`

### Task 7: Relationship tools (1:N, 1:1, N:M, logical)

**Files:**
- Create: `src/lib/schema/ops/relations.ts`, `src/lib/schema/ops/relations.test.ts`

**Interfaces:**
- Consumes: tables/columns/keys ops, types, `newId`, `uniqueName`.
- Produces:

```ts
export function linkOneToMany(c: WorkspaceContent, parentId: string, childId: string): { content: WorkspaceContent; fkId: string };
export function linkOneToOne(c: WorkspaceContent, parentId: string, childId: string): { content: WorkspaceContent; fkId: string };
export function linkManyToMany(c: WorkspaceContent, aId: string, bId: string): { content: WorkspaceContent; junctionTableId: string };
export function addLogicalEdge(c: WorkspaceContent, e: Omit<LogicalEdge, 'id'>): { content: WorkspaceContent; edgeId: string };
export function updateLogicalEdge(c: WorkspaceContent, edgeId: string, patch: Partial<Omit<LogicalEdge, 'id'>>): WorkspaceContent;
export function deleteLogicalEdge(c: WorkspaceContent, edgeId: string): WorkspaceContent;
export function pkColumnsOf(t: Table): Column[];   // PRIMARY index columns in index order; fallback [first column]; [] if no columns
```

Semantics (spec §5): FK columns in child named `{parent.name}_{pkcol.name}` uniqued, copying `type`+`unsigned`, `nullable:false`; plain index `idx_{child}_{cols}` on them (1:N) or unique `uq_{child}_{cols}` (1:1); FK constraint via the same naming as `addForeignKey`. Self-reference (parent === child) allowed. N:M junction named `{a.name}_{b.name}` uniqued, placed at the midpoint of A and B, containing FK columns to both PKs, a composite PRIMARY over all of them, a plain index over the B-side columns, and two FK constraints. Multi-word col list in index names joins with `_`.

- [ ] **Step 1: Write the failing test** — `src/lib/schema/ops/relations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, tableById } from './tables';
import { togglePk, addColumn, updateColumn } from './columns';
import { linkOneToMany, linkOneToOne, linkManyToMany, addLogicalEdge, deleteLogicalEdge } from './relations';

const twoTables = () => {
  let { content: c, tableId: users } = addTable(emptyContent(), 0, 0);
  c = renameTable(c, users, 'users');
  const r = addTable(c, 400, 0);
  c = renameTable(r.content, r.tableId, 'orders');
  return { c, users, orders: r.tableId };
};

describe('relationship tools', () => {
  it('1:N creates typed fk column, index, constraint', () => {
    const { c, users, orders } = twoTables();
    const { content } = linkOneToMany(c, users, orders);
    const child = tableById(content, orders)!;
    const fkCol = child.columns.find(x => x.name === 'users_id')!;
    expect(fkCol).toMatchObject({ nullable: false, unsigned: true, type: { base: 'int' } });
    expect(child.indexes.some(ix => ix.kind === 'index' && ix.columns[0].columnId === fkCol.id)).toBe(true);
    expect(child.foreignKeys[0]).toMatchObject({ refTableId: users, name: 'fk_orders_users' });
    expect(child.foreignKeys[0].columnIds).toEqual([fkCol.id]);
  });
  it('1:1 uses a unique index instead', () => {
    const { c, users, orders } = twoTables();
    const { content } = linkOneToOne(c, users, orders);
    const child = tableById(content, orders)!;
    const fkCol = child.columns.find(x => x.name === 'users_id')!;
    expect(child.indexes.some(ix => ix.kind === 'unique' && ix.columns[0].columnId === fkCol.id)).toBe(true);
  });
  it('composite parent pk produces one column per pk col', () => {
    let { c, users, orders } = twoTables();
    const r = addColumn(c, users); c = r.content;
    c = updateColumn(c, users, r.columnId, { name: 'tenant', type: { base: 'varchar', length: 20 } });
    c = togglePk(c, users, r.columnId);
    const { content } = linkOneToMany(c, users, orders);
    const child = tableById(content, orders)!;
    expect(child.columns.map(x => x.name)).toContain('users_id');
    expect(child.columns.map(x => x.name)).toContain('users_tenant');
    expect(child.foreignKeys[0].columnIds.length).toBe(2);
  });
  it('self-reference uniquifies the column name', () => {
    const { c, users } = twoTables();
    const { content } = linkOneToMany(c, users, users);
    const t = tableById(content, users)!;
    expect(t.columns.some(x => x.name === 'users_id')).toBe(true);
    expect(t.foreignKeys[0].refTableId).toBe(users);
  });
  it('N:M creates junction with composite pk and two fks', () => {
    const { c, users, orders } = twoTables();
    const { content, junctionTableId } = linkManyToMany(c, users, orders);
    const j = tableById(content, junctionTableId)!;
    expect(j.name).toBe('users_orders');
    expect(j.columns.map(x => x.name)).toEqual(['users_id', 'orders_id']);
    const pk = j.indexes.find(ix => ix.kind === 'primary')!;
    expect(pk.columns.length).toBe(2);
    expect(j.foreignKeys.length).toBe(2);
    expect(j.x).toBe(200); // midpoint of 0 and 400
  });
  it('logical edges add and delete', () => {
    const { c, users, orders } = twoTables();
    const { content, edgeId } = addLogicalEdge(c, { fromTableId: orders, toTableId: users, cardinality: 'm-1', label: 'soft ref' });
    expect(content.logicalEdges[0]).toMatchObject({ cardinality: 'm-1', label: 'soft ref' });
    expect(deleteLogicalEdge(content, edgeId).logicalEdges.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/schema/ops/relations.ts`:

```ts
import type { Column, LogicalEdge, Table, WorkspaceContent } from '../types';
import { newId } from '../id';
import { uniqueName } from '../naming';
import { mutate, tableById } from './tables';
import { addForeignKey } from './keys';

export function pkColumnsOf(t: Table): Column[] {
  const pk = t.indexes.find(ix => ix.kind === 'primary');
  if (pk && pk.columns.length) {
    return pk.columns
      .map(ic => t.columns.find(c => c.id === ic.columnId))
      .filter((c): c is Column => !!c);
  }
  return t.columns.length ? [t.columns[0]] : [];
}

/** Adds FK columns mirroring parent's PK into `child` (mutates draft table), returns new column ids. */
function materializeFkColumns(draftChild: Table, parent: Table): string[] {
  const ids: string[] = [];
  for (const pkCol of pkColumnsOf(parent)) {
    const id = newId();
    const colRec: Column = {
      id,
      name: uniqueName(`${parent.name}_${pkCol.name}`, draftChild.columns.map(c => c.name)),
      type: structuredClone(pkCol.type),
      nullable: false,
    };
    if (pkCol.unsigned) colRec.unsigned = true;
    delete (colRec as Column).autoIncrement;
    draftChild.columns.push(colRec);
    ids.push(id);
  }
  return ids;
}

function link(c: WorkspaceContent, parentId: string, childId: string, unique: boolean):
  { content: WorkspaceContent; fkId: string } {
  const parent0 = tableById(c, parentId), child0 = tableById(c, childId);
  if (!parent0 || !child0 || pkColumnsOf(parent0).length === 0) return { content: c, fkId: '' };
  let newColIds: string[] = [];
  let content = mutate(c, d => {
    const child = d.tables.find(t => t.id === childId)!;
    const parent = d.tables.find(t => t.id === parentId)!;
    newColIds = materializeFkColumns(child, parent);
    const colNames = newColIds.map(id => child.columns.find(x => x.id === id)!.name).join('_');
    child.indexes.push({
      id: newId(),
      name: uniqueName(`${unique ? 'uq' : 'idx'}_${child.name}_${colNames}`, child.indexes.map(ix => ix.name)),
      kind: unique ? 'unique' : 'index', visible: true,
      columns: newColIds.map(columnId => ({ columnId })),
    });
  });
  const parentNow = tableById(content, parentId)!;
  const refIds = pkColumnsOf(parentNow).map(x => x.id);
  const r = addForeignKey(content, childId, { columnIds: newColIds, refTableId: parentId, refColumnIds: refIds });
  return { content: r.content, fkId: r.fkId };
}

export const linkOneToMany = (c: WorkspaceContent, parentId: string, childId: string) => link(c, parentId, childId, false);
export const linkOneToOne = (c: WorkspaceContent, parentId: string, childId: string) => link(c, parentId, childId, true);

export function linkManyToMany(c: WorkspaceContent, aId: string, bId: string):
  { content: WorkspaceContent; junctionTableId: string } {
  const a0 = tableById(c, aId), b0 = tableById(c, bId);
  if (!a0 || !b0 || !pkColumnsOf(a0).length || !pkColumnsOf(b0).length) return { content: c, junctionTableId: '' };
  const junctionTableId = newId();
  let aColIds: string[] = [], bColIds: string[] = [];
  let content = mutate(c, d => {
    const a = d.tables.find(t => t.id === aId)!, b = d.tables.find(t => t.id === bId)!;
    const junction: Table = {
      id: junctionTableId,
      name: uniqueName(`${a.name}_${b.name}`, d.tables.map(t => t.name)),
      x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) + 40, w: 220,
      columns: [], indexes: [], foreignKeys: [],
    };
    aColIds = materializeFkColumns(junction, a);
    bColIds = materializeFkColumns(junction, b);
    junction.indexes.push({
      id: newId(), name: 'PRIMARY', kind: 'primary', visible: true,
      columns: [...aColIds, ...bColIds].map(columnId => ({ columnId })),
    });
    const bNames = bColIds.map(id => junction.columns.find(x => x.id === id)!.name).join('_');
    junction.indexes.push({
      id: newId(), name: uniqueName(`idx_${junction.name}_${bNames}`, junction.indexes.map(i => i.name)),
      kind: 'index', visible: true, columns: bColIds.map(columnId => ({ columnId })),
    });
    d.tables.push(junction);
  });
  const aNow = tableById(content, aId)!, bNow = tableById(content, bId)!;
  content = addForeignKey(content, junctionTableId, { columnIds: aColIds, refTableId: aId, refColumnIds: pkColumnsOf(aNow).map(x => x.id) }).content;
  content = addForeignKey(content, junctionTableId, { columnIds: bColIds, refTableId: bId, refColumnIds: pkColumnsOf(bNow).map(x => x.id) }).content;
  return { content, junctionTableId };
}

export function addLogicalEdge(c: WorkspaceContent, e: Omit<LogicalEdge, 'id'>): { content: WorkspaceContent; edgeId: string } {
  const edgeId = newId();
  return { content: mutate(c, d => { d.logicalEdges.push({ id: edgeId, ...structuredClone(e) }); }), edgeId };
}
export const updateLogicalEdge = (c: WorkspaceContent, edgeId: string, patch: Partial<Omit<LogicalEdge, 'id'>>) =>
  mutate(c, d => { const e = d.logicalEdges.find(x => x.id === edgeId); if (e) Object.assign(e, structuredClone(patch)); });
export const deleteLogicalEdge = (c: WorkspaceContent, edgeId: string) =>
  mutate(c, d => { d.logicalEdges = d.logicalEdges.filter(x => x.id !== edgeId); });
```

- [ ] **Step 4: Run to verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(schema): Workbench-style relationship tools"`

### Task 8: Derived data (edges, badges, adjacency)

**Files:**
- Create: `src/lib/schema/derive.ts`, `src/lib/schema/derive.test.ts`

**Interfaces:**
- Consumes: types, ops for test setup.
- Produces:

```ts
export interface DerivedEdge {
  id: string;                    // `fk:${fk.id}` | `log:${edge.id}`
  kind: 'fk' | 'logical';
  fkId?: string; ownerTableId?: string;   // for fk edges: table holding the constraint
  logicalId?: string;
  fromTableId: string; toTableId: string; // fk: from=child, to=parent
  fromColumnIds: string[]; toColumnIds: string[];
  cardinality: Cardinality; label?: string;
}
export function deriveEdges(c: WorkspaceContent): DerivedEdge[];
export function columnBadges(t: Table): Map<string, string[]>;    // colId -> subset of ['PK','FK','UQ','NN','AI','UN','IX'] in that order
export function adjacency(c: WorkspaceContent): Map<string, Set<string>>;
export const CARD_SYMBOLS: Record<Cardinality, [string, string]>; // {'1-1':['1','1'],'1-m':['1','N'],'m-1':['N','1'],'m-m':['N','N']}
```

FK edge cardinality: `'m-1'` unless some `primary`/`unique` index's column-id set is a subset of the FK's column-id set → `'1-1'`. Badges: `UQ` = member of any single-or-multi unique index; `IX` = member of any plain/fulltext/spatial index; `FK` = member of any FK's `columnIds`.

- [ ] **Step 1: Write the failing test** — `src/lib/schema/derive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, tableById } from './ops/tables';
import { linkOneToMany, linkOneToOne, addLogicalEdge } from './ops/relations';
import { toggleUnique, toggleIndex } from './ops/columns';
import { deriveEdges, columnBadges, adjacency, CARD_SYMBOLS } from './derive';

const pair = () => {
  let { content: c, tableId: p } = addTable(emptyContent(), 0, 0);
  c = renameTable(c, p, 'p');
  const r = addTable(c, 300, 0);
  return { c: renameTable(r.content, r.tableId, 'ch'), p, ch: r.tableId };
};

describe('deriveEdges', () => {
  it('derives m-1 for 1:N link and 1-1 for 1:1 link', () => {
    const { c, p, ch } = pair();
    const e1 = deriveEdges(linkOneToMany(c, p, ch).content);
    expect(e1.length).toBe(1);
    expect(e1[0]).toMatchObject({ kind: 'fk', fromTableId: ch, toTableId: p, cardinality: 'm-1' });
    const e2 = deriveEdges(linkOneToOne(c, p, ch).content);
    expect(e2[0].cardinality).toBe('1-1');
  });
  it('includes logical edges', () => {
    const { c, p, ch } = pair();
    const { content } = addLogicalEdge(c, { fromTableId: ch, toTableId: p, cardinality: 'm-m', label: 'x' });
    const edges = deriveEdges(content);
    expect(edges[0]).toMatchObject({ kind: 'logical', cardinality: 'm-m', label: 'x' });
  });
});

describe('columnBadges', () => {
  it('computes PK/AI/UN/NN and FK/UQ/IX membership', () => {
    let { c, p, ch } = pair();
    c = linkOneToMany(c, p, ch).content;
    let t = tableById(c, ch)!;
    const fkCol = t.columns.find(x => x.name === 'p_id')!;
    c = toggleUnique(c, ch, fkCol.id);
    t = tableById(c, ch)!;
    const badges = columnBadges(t);
    expect(badges.get(t.columns[0].id)).toEqual(['PK', 'NN', 'AI', 'UN']);
    expect(badges.get(fkCol.id)).toEqual(['FK', 'UQ', 'NN', 'UN', 'IX']);
  });
});

describe('adjacency + symbols', () => {
  it('maps both directions', () => {
    const { c, p, ch } = pair();
    const adj = adjacency(linkOneToMany(c, p, ch).content);
    expect(adj.get(p)!.has(ch)).toBe(true);
    expect(adj.get(ch)!.has(p)).toBe(true);
    expect(CARD_SYMBOLS['m-1']).toEqual(['N', '1']);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/schema/derive.ts`:

```ts
import type { Cardinality, Table, WorkspaceContent } from './types';

export interface DerivedEdge {
  id: string; kind: 'fk' | 'logical';
  fkId?: string; ownerTableId?: string; logicalId?: string;
  fromTableId: string; toTableId: string;
  fromColumnIds: string[]; toColumnIds: string[];
  cardinality: Cardinality; label?: string;
}

export const CARD_SYMBOLS: Record<Cardinality, [string, string]> =
  { '1-1': ['1', '1'], '1-m': ['1', 'N'], 'm-1': ['N', '1'], 'm-m': ['N', 'N'] };

const fkIsUnique = (t: Table, fkColIds: string[]): boolean => {
  const fkSet = new Set(fkColIds);
  return t.indexes.some(ix =>
    (ix.kind === 'primary' || ix.kind === 'unique') &&
    ix.columns.length > 0 &&
    ix.columns.every(ic => fkSet.has(ic.columnId)));
};

export function deriveEdges(c: WorkspaceContent): DerivedEdge[] {
  const edges: DerivedEdge[] = [];
  for (const t of c.tables)
    for (const fk of t.foreignKeys)
      edges.push({
        id: `fk:${fk.id}`, kind: 'fk', fkId: fk.id, ownerTableId: t.id,
        fromTableId: t.id, toTableId: fk.refTableId,
        fromColumnIds: [...fk.columnIds], toColumnIds: [...fk.refColumnIds],
        cardinality: fkIsUnique(t, fk.columnIds) ? '1-1' : 'm-1',
      });
  for (const e of c.logicalEdges)
    edges.push({
      id: `log:${e.id}`, kind: 'logical', logicalId: e.id,
      fromTableId: e.fromTableId, toTableId: e.toTableId,
      fromColumnIds: e.fromColumnId ? [e.fromColumnId] : [], toColumnIds: e.toColumnId ? [e.toColumnId] : [],
      cardinality: e.cardinality, label: e.label,
    });
  return edges;
}

export function columnBadges(t: Table): Map<string, string[]> {
  const pkSet = new Set<string>(), uqSet = new Set<string>(), ixSet = new Set<string>(), fkSet = new Set<string>();
  for (const ix of t.indexes)
    for (const ic of ix.columns) {
      if (ix.kind === 'primary') pkSet.add(ic.columnId);
      else if (ix.kind === 'unique') uqSet.add(ic.columnId);
      else ixSet.add(ic.columnId);
    }
  for (const fk of t.foreignKeys) for (const id of fk.columnIds) fkSet.add(id);
  const out = new Map<string, string[]>();
  for (const col of t.columns) {
    const b: string[] = [];
    if (pkSet.has(col.id)) b.push('PK');
    if (fkSet.has(col.id)) b.push('FK');
    if (uqSet.has(col.id)) b.push('UQ');
    if (!col.nullable) b.push('NN');
    if (col.autoIncrement) b.push('AI');
    if (col.unsigned) b.push('UN');
    if (ixSet.has(col.id)) b.push('IX');
    out.set(col.id, b);
  }
  return out;
}

export function adjacency(c: WorkspaceContent): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>(c.tables.map(t => [t.id, new Set<string>()]));
  for (const e of deriveEdges(c)) {
    adj.get(e.fromTableId)?.add(e.toTableId);
    adj.get(e.toTableId)?.add(e.fromTableId);
  }
  return adj;
}
```

- [ ] **Step 4: Run to verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(schema): derived edges, badges, adjacency"`

### Task 9: Schema validation

**Files:**
- Create: `src/lib/schema/validate.ts`, `src/lib/schema/validate.test.ts`

**Interfaces:**
- Consumes: types, datatypes.
- Produces:

```ts
export interface ValidationIssue {
  id: string;                 // stable rule+target key, e.g. 'dup-table:users'
  level: 'error' | 'warning';
  message: string;
  tableId?: string; columnId?: string;
}
export function validateContent(c: WorkspaceContent): ValidationIssue[];
```

Rules (spec §5): duplicate table names (error); duplicate column names within a table (error); duplicate index names within a table + duplicate FK names schema-wide (error); FK column-count mismatch or column type/unsigned mismatch vs referenced column (warning); table without primary key (warning); AUTO_INCREMENT column not part of any key (error); >1 AUTO_INCREMENT per table (error); empty ENUM/SET values (error); identifier length > 64 chars for table/column/index/FK names (error); FULLTEXT index on non-text column or SPATIAL index on non-spatial/nullable column (warning).

- [ ] **Step 1: Write the failing test** — `src/lib/schema/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, tableById } from './ops/tables';
import { addColumn, updateColumn, togglePk } from './ops/columns';
import { validateContent } from './validate';

const has = (issues: ReturnType<typeof validateContent>, idPrefix: string) =>
  issues.some(i => i.id.startsWith(idPrefix));

describe('validateContent', () => {
  it('accepts a clean schema', () => {
    const { content } = addTable(emptyContent(), 0, 0);
    expect(validateContent(content)).toEqual([]);
  });
  it('flags duplicate table names', () => {
    let { content: c, tableId } = addTable(emptyContent(), 0, 0);
    const r = addTable(c, 0, 0); c = r.content;
    c = renameTable(c, r.tableId, 'table_1');
    expect(has(validateContent(c), 'dup-table')).toBe(true);
  });
  it('flags missing pk and duplicate columns', () => {
    let { content: c, tableId } = addTable(emptyContent(), 0, 0);
    const t = tableById(c, tableId)!;
    c = togglePk(c, tableId, t.columns[0].id);          // removes PRIMARY
    const r = addColumn(c, tableId); c = r.content;
    c = updateColumn(c, tableId, r.columnId, { name: 'id' });
    const issues = validateContent(c);
    expect(has(issues, 'no-pk')).toBe(true);
    expect(has(issues, 'dup-col')).toBe(true);
  });
  it('flags AI not in key and empty enum', () => {
    let { content: c, tableId } = addTable(emptyContent(), 0, 0);
    const r = addColumn(c, tableId); c = r.content;
    c = updateColumn(c, tableId, r.columnId, { name: 'n', type: { base: 'int' }, autoIncrement: true });
    const r2 = addColumn(c, tableId); c = r2.content;
    c = updateColumn(c, tableId, r2.columnId, { name: 'e', type: { base: 'enum', values: [] } });
    const issues = validateContent(c);
    expect(has(issues, 'ai-no-key')).toBe(true);
    expect(has(issues, 'multi-ai')).toBe(true);
    expect(has(issues, 'enum-empty')).toBe(true);
  });
  it('flags fk type mismatch', () => {
    let { content: c, tableId: p } = addTable(emptyContent(), 0, 0);
    const rb = addTable(c, 0, 0); c = rb.content;
    const child = tableById(c, rb.tableId)!;
    const parent = tableById(c, p)!;
    c = updateColumn(c, rb.tableId, child.columns[0].id, { type: { base: 'varchar', length: 36 }, autoIncrement: undefined });
    c = { ...c, tables: c.tables.map(t => t.id !== rb.tableId ? t : { ...t, foreignKeys: [
      { id: 'f', name: 'fk_bad', columnIds: [child.columns[0].id], refTableId: p, refColumnIds: [parent.columns[0].id] },
    ]}) };
    expect(has(validateContent(c), 'fk-mismatch')).toBe(true);
  });
  it('flags 64+ char identifiers', () => {
    let { content: c, tableId } = addTable(emptyContent(), 0, 0);
    c = renameTable(c, tableId, 'x'.repeat(65));
    expect(has(validateContent(c), 'name-too-long')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/schema/validate.ts`:

```ts
import type { WorkspaceContent } from './types';
import { isSpatialType, specOf } from './datatypes';

export interface ValidationIssue {
  id: string; level: 'error' | 'warning'; message: string;
  tableId?: string; columnId?: string;
}

export function validateContent(c: WorkspaceContent): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (id: string, level: 'error' | 'warning', message: string, tableId?: string, columnId?: string) =>
    issues.push({ id, level, message, tableId, columnId });

  const tnames = new Map<string, number>();
  for (const t of c.tables) tnames.set(t.name.toLowerCase(), (tnames.get(t.name.toLowerCase()) ?? 0) + 1);
  for (const t of c.tables) {
    if ((tnames.get(t.name.toLowerCase()) ?? 0) > 1)
      push(`dup-table:${t.id}`, 'error', `Duplicate table name \`${t.name}\``, t.id);
    if (t.name.length > 64) push(`name-too-long:${t.id}`, 'error', `Table name \`${t.name.slice(0, 20)}…\` exceeds 64 chars`, t.id);

    const cnames = new Map<string, number>();
    for (const col of t.columns) cnames.set(col.name.toLowerCase(), (cnames.get(col.name.toLowerCase()) ?? 0) + 1);
    for (const col of t.columns) {
      if ((cnames.get(col.name.toLowerCase()) ?? 0) > 1)
        push(`dup-col:${t.id}:${col.id}`, 'error', `Duplicate column \`${col.name}\` in \`${t.name}\``, t.id, col.id);
      if (col.name.length > 64) push(`name-too-long:${t.id}:${col.id}`, 'error', `Column name exceeds 64 chars`, t.id, col.id);
      if ((col.type.base === 'enum' || col.type.base === 'set') && !(col.type.values?.length))
        push(`enum-empty:${t.id}:${col.id}`, 'error', `\`${col.name}\` has no ${col.type.base.toUpperCase()} values`, t.id, col.id);
    }

    const pk = t.indexes.find(ix => ix.kind === 'primary');
    if (!pk && t.columns.length) push(`no-pk:${t.id}`, 'warning', `Table \`${t.name}\` has no primary key`, t.id);

    const keyed = new Set<string>();
    for (const ix of t.indexes) if (ix.columns.length) keyed.add(ix.columns[0].columnId); // MySQL: AI col must be FIRST col of some key
    const ai = t.columns.filter(x => x.autoIncrement);
    if (ai.length > 1) push(`multi-ai:${t.id}`, 'error', `Table \`${t.name}\` has ${ai.length} AUTO_INCREMENT columns`, t.id);
    for (const col of ai)
      if (!keyed.has(col.id))
        push(`ai-no-key:${t.id}:${col.id}`, 'error', `AUTO_INCREMENT \`${col.name}\` must be the first column of a key`, t.id, col.id);

    const inames = new Map<string, number>();
    for (const ix of t.indexes) inames.set(ix.name.toLowerCase(), (inames.get(ix.name.toLowerCase()) ?? 0) + 1);
    for (const ix of t.indexes) {
      if ((inames.get(ix.name.toLowerCase()) ?? 0) > 1)
        push(`dup-index:${t.id}:${ix.id}`, 'error', `Duplicate index name \`${ix.name}\` in \`${t.name}\``, t.id);
      if (ix.name.length > 64) push(`name-too-long:ix:${ix.id}`, 'error', `Index name exceeds 64 chars`, t.id);
      for (const ic of ix.columns) {
        const colRec = t.columns.find(x => x.id === ic.columnId); if (!colRec) continue;
        const cat = specOf(colRec.type.base)?.category;
        if (ix.kind === 'fulltext' && !(cat === 'string' && specOf(colRec.type.base)?.text))
          push(`ft-nontext:${ix.id}`, 'warning', `FULLTEXT \`${ix.name}\` on non-text column \`${colRec.name}\``, t.id, colRec.id);
        if (ix.kind === 'spatial' && (!isSpatialType(colRec.type.base) || colRec.nullable))
          push(`sp-invalid:${ix.id}`, 'warning', `SPATIAL \`${ix.name}\` requires NOT NULL spatial column`, t.id, colRec.id);
      }
    }
  }

  const fknames = new Map<string, number>();
  for (const t of c.tables) for (const fk of t.foreignKeys)
    fknames.set(fk.name.toLowerCase(), (fknames.get(fk.name.toLowerCase()) ?? 0) + 1);
  for (const t of c.tables) for (const fk of t.foreignKeys) {
    if ((fknames.get(fk.name.toLowerCase()) ?? 0) > 1)
      push(`dup-fk:${fk.id}`, 'error', `Duplicate constraint name \`${fk.name}\``, t.id);
    if (fk.name.length > 64) push(`name-too-long:fk:${fk.id}`, 'error', `Constraint name exceeds 64 chars`, t.id);
    const ref = c.tables.find(x => x.id === fk.refTableId);
    if (!ref) { push(`fk-dangling:${fk.id}`, 'error', `\`${fk.name}\` references a missing table`, t.id); continue; }
    if (fk.columnIds.length !== fk.refColumnIds.length || fk.columnIds.length === 0) {
      push(`fk-mismatch:${fk.id}`, 'warning', `\`${fk.name}\` column count mismatch`, t.id); continue;
    }
    for (let i = 0; i < fk.columnIds.length; i++) {
      const a = t.columns.find(x => x.id === fk.columnIds[i]);
      const b = ref.columns.find(x => x.id === fk.refColumnIds[i]);
      if (!a || !b) { push(`fk-dangling:${fk.id}:${i}`, 'error', `\`${fk.name}\` references a missing column`, t.id); continue; }
      if (a.type.base !== b.type.base || !!a.unsigned !== !!b.unsigned)
        push(`fk-mismatch:${fk.id}:${i}`, 'warning',
          `\`${fk.name}\`: \`${a.name}\` (${a.type.base}${a.unsigned ? ' unsigned' : ''}) vs \`${ref.name}.${b.name}\` (${b.type.base}${b.unsigned ? ' unsigned' : ''})`,
          t.id, a.id);
    }
  }
  return issues;
}
```

- [ ] **Step 4: Run to verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(schema): validation lint"`

---

## Phase 2 — SQL engine

### Task 10: DDL generator

**Files:**
- Create: `src/lib/sql/generate.ts`, `src/lib/sql/generate.test.ts`

**Interfaces:**
- Consumes: types, `formatType`, `isSpatialType`.
- Produces:

```ts
export function escapeId(s: string): string;    // backticks, ` doubled
export function escapeStr(s: string): string;   // \ and ' escaped
export function generateColumnSQL(col: Column): string;                       // no leading indent, no trailing comma
export function generateIndexSQL(ix: TableIndex, t: Table): string;
export function generateFkSQL(fk: ForeignKey, t: Table, c: WorkspaceContent): string;
export function generateTableSQL(t: Table, c: WorkspaceContent): string;      // full CREATE TABLE …;
export function generateScript(c: WorkspaceContent): string;                  // header + FK_CHECKS wrapper + tables + logical comments
```

Clause order within a column: name, type, `unsigned`, `zerofill`, `CHARACTER SET`, `COLLATE`, `GENERATED ALWAYS AS (expr) STORED|VIRTUAL`, `NULL`/`NOT NULL`, `SRID n`, `DEFAULT …`, `ON UPDATE CURRENT_TIMESTAMP[(fsp)]`, `AUTO_INCREMENT`, `COMMENT '…'`. Defaults: literal → quoted string; expression → parenthesized; `current_timestamp` → bare with optional fsp. Generated columns never emit DEFAULT/AUTO_INCREMENT. Indexes with zero columns are skipped. Table options: `ENGINE=` (table override or workspace default), `AUTO_INCREMENT=` when set, `DEFAULT CHARSET=`, `COLLATE=`, `COMMENT='…'` when set. Logical edges append as `-- logical: {"from":"t.col","to":"t2.col","cardinality":"m-1","label":"…"}` lines (column part omitted when unset).

- [ ] **Step 1: Write the failing test** — `src/lib/sql/generate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { WorkspaceContent } from '@/lib/schema/types';
import { generateTableSQL, generateScript, escapeId, escapeStr } from './generate';

const content: WorkspaceContent = {
  schemaVersion: 1,
  settings: { defaultEngine: 'InnoDB', defaultCharset: 'utf8mb4', defaultCollation: 'utf8mb4_0900_ai_ci' },
  viewport: { x: 0, y: 0, zoom: 1 },
  logicalEdges: [{ id: 'l1', fromTableId: 't1', fromColumnId: 'c2', toTableId: 't2', cardinality: 'm-1', label: 'soft' }],
  tables: [
    {
      id: 't1', name: 'orders', x: 0, y: 0, w: 220, comment: "order's table", autoIncrementStart: 1000,
      columns: [
        { id: 'c1', name: 'id', type: { base: 'bigint' }, nullable: false, unsigned: true, autoIncrement: true },
        { id: 'c2', name: 'user_id', type: { base: 'int' }, nullable: false, unsigned: true },
        { id: 'c3', name: 'status', type: { base: 'enum', values: ['new', 'paid'] }, nullable: false, default: { kind: 'literal', value: 'new' } },
        { id: 'c4', name: 'meta', type: { base: 'json' }, nullable: true, default: { kind: 'expression', value: 'json_object()' } },
        { id: 'c5', name: 'placed_at', type: { base: 'datetime', fsp: 3 }, nullable: false,
          default: { kind: 'current_timestamp', fsp: 3 }, onUpdateCurrentTimestamp: true, onUpdateFsp: 3 },
        { id: 'c6', name: 'note', type: { base: 'varchar', length: 255 }, nullable: true,
          charset: 'utf8mb4', collation: 'utf8mb4_bin', comment: 'free text', default: { kind: 'null' } },
        { id: 'c7', name: 'loc', type: { base: 'point', srid: 4326 }, nullable: false },
        { id: 'c8', name: 'cents', type: { base: 'bigint' }, nullable: true, generated: { expression: '`id` * 100', stored: true } },
      ],
      indexes: [
        { id: 'i1', name: 'PRIMARY', kind: 'primary', visible: true, columns: [{ columnId: 'c1' }] },
        { id: 'i2', name: 'uq_orders_user', kind: 'unique', visible: true, columns: [{ columnId: 'c2' }, { columnId: 'c3' }] },
        { id: 'i3', name: 'idx_note', kind: 'index', visible: false, columns: [{ columnId: 'c6', length: 20, order: 'DESC' }] },
        { id: 'i4', name: 'sp_loc', kind: 'spatial', visible: true, columns: [{ columnId: 'c7' }] },
        { id: 'i5', name: 'empty', kind: 'index', visible: true, columns: [] },
      ],
      foreignKeys: [
        { id: 'f1', name: 'fk_orders_users', columnIds: ['c2'], refTableId: 't2', refColumnIds: ['u1'], onDelete: 'CASCADE', onUpdate: 'RESTRICT' },
      ],
    },
    {
      id: 't2', name: 'users', x: 0, y: 0, w: 220,
      columns: [{ id: 'u1', name: 'id', type: { base: 'int' }, nullable: false, unsigned: true, autoIncrement: true }],
      indexes: [{ id: 'iu', name: 'PRIMARY', kind: 'primary', visible: true, columns: [{ columnId: 'u1' }] }],
      foreignKeys: [],
    },
  ],
};

describe('escapes', () => {
  it('escapes identifiers and strings', () => {
    expect(escapeId('we`ird')).toBe('`we``ird`');
    expect(escapeStr("it's a \\ test")).toBe("it''s a \\\\ test");
  });
});

describe('generateTableSQL', () => {
  it('emits the exact CREATE TABLE', () => {
    expect(generateTableSQL(content.tables[0], content)).toBe(
`CREATE TABLE \`orders\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`user_id\` int unsigned NOT NULL,
  \`status\` enum('new','paid') NOT NULL DEFAULT 'new',
  \`meta\` json NULL DEFAULT (json_object()),
  \`placed_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  \`note\` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL COMMENT 'free text',
  \`loc\` point NOT NULL SRID 4326,
  \`cents\` bigint GENERATED ALWAYS AS (\`id\` * 100) STORED NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_orders_user\` (\`user_id\`, \`status\`),
  KEY \`idx_note\` (\`note\`(20) DESC) INVISIBLE,
  SPATIAL KEY \`sp_loc\` (\`loc\`),
  CONSTRAINT \`fk_orders_users\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=1000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='order''s table';`);
  });
});

describe('generateScript', () => {
  it('wraps with FK checks and appends logical comments', () => {
    const s = generateScript(content);
    expect(s.startsWith('-- Generated by ER Workspace — MySQL 8.0\nSET FOREIGN_KEY_CHECKS=0;')).toBe(true);
    expect(s).toContain('SET FOREIGN_KEY_CHECKS=1;');
    expect(s).toContain('-- logical: {"from":"orders.user_id","to":"users","cardinality":"m-1","label":"soft"}');
    expect(s.indexOf('CREATE TABLE `orders`')).toBeLessThan(s.indexOf('CREATE TABLE `users`'));
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/sql/generate.ts`:

```ts
import type { Column, ForeignKey, Table, TableIndex, WorkspaceContent } from '../schema/types';
import { formatType, isSpatialType } from '../schema/datatypes';

export const escapeId = (s: string) => '`' + s.replace(/`/g, '``') + '`';
export const escapeStr = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "''");

const colName = (t: Table, id: string) => t.columns.find(c => c.id === id)?.name ?? '?';

export function generateColumnSQL(col: Column): string {
  const parts: string[] = [escapeId(col.name), formatType(col.type)];
  if (col.unsigned) parts.push('unsigned');
  if (col.zerofill) parts.push('zerofill');
  if (col.charset) parts.push(`CHARACTER SET ${col.charset}`);
  if (col.collation) parts.push(`COLLATE ${col.collation}`);
  if (col.generated)
    parts.push(`GENERATED ALWAYS AS (${col.generated.expression}) ${col.generated.stored ? 'STORED' : 'VIRTUAL'}`);
  parts.push(col.nullable ? 'NULL' : 'NOT NULL');
  if (col.type.srid != null && isSpatialType(col.type.base)) parts.push(`SRID ${col.type.srid}`);
  if (col.default && !col.generated) {
    if (col.default.kind === 'null') parts.push('DEFAULT NULL');
    else if (col.default.kind === 'literal') parts.push(`DEFAULT '${escapeStr(col.default.value ?? '')}'`);
    else if (col.default.kind === 'expression') parts.push(`DEFAULT (${col.default.value ?? 'NULL'})`);
    else parts.push(`DEFAULT CURRENT_TIMESTAMP${col.default.fsp ? `(${col.default.fsp})` : ''}`);
  }
  if (col.onUpdateCurrentTimestamp)
    parts.push(`ON UPDATE CURRENT_TIMESTAMP${col.onUpdateFsp ? `(${col.onUpdateFsp})` : ''}`);
  if (col.autoIncrement && !col.generated) parts.push('AUTO_INCREMENT');
  if (col.comment) parts.push(`COMMENT '${escapeStr(col.comment)}'`);
  return parts.join(' ');
}

export function generateIndexSQL(ix: TableIndex, t: Table): string {
  const cols = ix.columns.map(ic => {
    let s = escapeId(colName(t, ic.columnId));
    if (ic.length != null) s += `(${ic.length})`;
    if (ic.order === 'DESC') s += ' DESC';
    return s;
  }).join(', ');
  const inv = ix.visible === false ? ' INVISIBLE' : '';
  switch (ix.kind) {
    case 'primary': return `PRIMARY KEY (${cols})`;
    case 'unique': return `UNIQUE KEY ${escapeId(ix.name)} (${cols})${inv}`;
    case 'fulltext': return `FULLTEXT KEY ${escapeId(ix.name)} (${cols})`;
    case 'spatial': return `SPATIAL KEY ${escapeId(ix.name)} (${cols})`;
    default: return `KEY ${escapeId(ix.name)} (${cols})${inv}`;
  }
}

export function generateFkSQL(fk: ForeignKey, t: Table, c: WorkspaceContent): string {
  const ref = c.tables.find(x => x.id === fk.refTableId);
  const local = fk.columnIds.map(id => escapeId(colName(t, id))).join(', ');
  const remote = fk.refColumnIds.map(id => (ref ? escapeId(colName(ref, id)) : '`?`')).join(', ');
  let s = `CONSTRAINT ${escapeId(fk.name)} FOREIGN KEY (${local}) REFERENCES ${escapeId(ref?.name ?? '?')} (${remote})`;
  if (fk.onDelete) s += ` ON DELETE ${fk.onDelete}`;
  if (fk.onUpdate) s += ` ON UPDATE ${fk.onUpdate}`;
  return s;
}

export function generateTableSQL(t: Table, c: WorkspaceContent): string {
  const lines = [
    ...t.columns.map(col => '  ' + generateColumnSQL(col)),
    ...t.indexes.filter(ix => ix.columns.length > 0).map(ix => '  ' + generateIndexSQL(ix, t)),
    ...t.foreignKeys.map(fk => '  ' + generateFkSQL(fk, t, c)),
  ];
  const opts = [`ENGINE=${t.engine ?? c.settings.defaultEngine}`];
  if (t.autoIncrementStart != null) opts.push(`AUTO_INCREMENT=${t.autoIncrementStart}`);
  opts.push(`DEFAULT CHARSET=${t.charset ?? c.settings.defaultCharset}`);
  opts.push(`COLLATE=${t.collation ?? c.settings.defaultCollation}`);
  if (t.comment) opts.push(`COMMENT='${escapeStr(t.comment)}'`);
  return `CREATE TABLE ${escapeId(t.name)} (\n${lines.join(',\n')}\n) ${opts.join(' ')};`;
}

export function generateScript(c: WorkspaceContent): string {
  const logical = c.logicalEdges.flatMap(e => {
    const from = c.tables.find(t => t.id === e.fromTableId);
    const to = c.tables.find(t => t.id === e.toTableId);
    if (!from || !to) return [];
    const fc = e.fromColumnId ? from.columns.find(x => x.id === e.fromColumnId)?.name : undefined;
    const tc = e.toColumnId ? to.columns.find(x => x.id === e.toColumnId)?.name : undefined;
    const payload: Record<string, string> = {
      from: fc ? `${from.name}.${fc}` : from.name,
      to: tc ? `${to.name}.${tc}` : to.name,
      cardinality: e.cardinality,
    };
    if (e.label) payload.label = e.label;
    return [`-- logical: ${JSON.stringify(payload)}`];
  });
  return [
    '-- Generated by ER Workspace — MySQL 8.0',
    'SET FOREIGN_KEY_CHECKS=0;',
    '',
    ...c.tables.map(t => generateTableSQL(t, c) + '\n'),
    'SET FOREIGN_KEY_CHECKS=1;',
    ...(logical.length ? ['', ...logical] : []),
    '',
  ].join('\n');
}
```

- [ ] **Step 4: Run to verify pass** — `npm test`. If the golden string differs, fix the GENERATOR (clause order is the contract), not the test.
- [ ] **Step 5: Commit** — `git commit -am "feat(sql): MySQL 8.0 DDL generator"`

### Task 11: Statement splitter + preprocessing

**Files:**
- Create: `src/lib/sql/split.ts`, `src/lib/sql/split.test.ts`

**Interfaces:**
- Produces:

```ts
export interface RawStatement { text: string; line: number }
export interface LogicalComment { line: number; json: string }
export function splitScript(sql: string): { statements: RawStatement[]; logicalLines: LogicalComment[] };
export interface PreprocessResult { text: string; srids: Map<string, number>; notes: string[] }
export function preprocessStatement(text: string): PreprocessResult;
```

`splitScript` is a character state machine: tracks single/double-quote strings (with `\` escapes), backtick identifiers, `--`/`#` line comments, `/* */` block comments, and line numbers. Splits on `;` outside all of those. `DELIMITER <tok>` lines switch the terminator to `<tok>` until `DELIMITER ;` (statements inside are still emitted — the parser stage classifies and skips them). `-- logical: {...}` comment lines are captured into `logicalLines` instead of being dropped. Comments are NOT included in statement text.

`preprocessStatement` (applied only to CREATE/ALTER TABLE text before astify):
1. `SRID <n>` — capture `{columnName → srid}` and strip. Regex on `` `?(\w+)`?\s+((?:geometry|point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection)\b[^,]*?)\s+SRID\s+(\d+)``/gis.
2. `\bserial\b` → `bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE` + note `serial expanded`.
3. Legacy `BINARY` type attribute after char/varchar/text types → stripped + note `legacy BINARY attribute removed`.

- [ ] **Step 1: Write the failing test** — `src/lib/sql/split.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { splitScript, preprocessStatement } from './split';

describe('splitScript', () => {
  it('splits on ; outside strings/comments/backticks', () => {
    const { statements } = splitScript(
      "CREATE TABLE a (x varchar(9) DEFAULT 'a;b');\n-- a comment; with semicolon\nCREATE TABLE `b;b` (y int); # tail; comment\n/* block;\nstill block */ INSERT INTO a VALUES (';');");
    expect(statements.length).toBe(3);
    expect(statements[0].text).toContain("'a;b'");
    expect(statements[1].text).toContain('`b;b`');
    expect(statements[1].line).toBe(3);
    expect(statements[2].text.startsWith('INSERT')).toBe(true);
  });
  it('captures logical comment lines', () => {
    const { statements, logicalLines } = splitScript('CREATE TABLE a (x int);\n-- logical: {"from":"a","to":"b","cardinality":"m-1"}\n');
    expect(statements.length).toBe(1);
    expect(logicalLines.length).toBe(1);
    expect(JSON.parse(logicalLines[0].json)).toMatchObject({ from: 'a', to: 'b' });
  });
  it('handles DELIMITER blocks without splitting on inner ;', () => {
    const { statements } = splitScript(
      'DELIMITER ;;\nCREATE TRIGGER tg BEFORE INSERT ON t FOR EACH ROW BEGIN SET @x = 1; END;;\nDELIMITER ;\nCREATE TABLE t2 (a int);');
    const trigger = statements.find(s => s.text.startsWith('CREATE TRIGGER'));
    expect(trigger).toBeDefined();
    expect(trigger!.text).toContain('SET @x = 1; END');
    expect(statements.some(s => s.text.startsWith('CREATE TABLE t2'))).toBe(true);
  });
  it('escaped quotes stay inside one statement', () => {
    const { statements } = splitScript("INSERT INTO t VALUES ('it\\'s; fine');");
    expect(statements.length).toBe(1);
  });
});

describe('preprocessStatement', () => {
  it('captures and strips SRID', () => {
    const r = preprocessStatement('CREATE TABLE t (`loc` point NOT NULL SRID 4326, g geometry SRID 0)');
    expect(r.srids.get('loc')).toBe(4326);
    expect(r.srids.get('g')).toBe(0);
    expect(r.text).not.toMatch(/SRID/i);
  });
  it('expands serial and strips legacy BINARY', () => {
    const r = preprocessStatement('CREATE TABLE t (id serial, pw varchar(40) BINARY DEFAULT NULL)');
    expect(r.text).toContain('bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE');
    expect(r.text).not.toMatch(/\bBINARY\b/);
    expect(r.notes.length).toBe(2);
  });
  it('does not touch varbinary/binary(n) types', () => {
    const r = preprocessStatement('CREATE TABLE t (a binary(16), b varbinary(32))');
    expect(r.text).toContain('binary(16)');
    expect(r.text).toContain('varbinary(32)');
    expect(r.notes.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/sql/split.ts`:

```ts
export interface RawStatement { text: string; line: number }
export interface LogicalComment { line: number; json: string }

export function splitScript(sql: string): { statements: RawStatement[]; logicalLines: LogicalComment[] } {
  const statements: RawStatement[] = [];
  const logicalLines: LogicalComment[] = [];
  let buf = '', bufStartLine = 1, line = 1, i = 0, delimiter = ';';
  type Mode = 'code' | 'sq' | 'dq' | 'bt' | 'line-comment' | 'block-comment';
  let mode: Mode = 'code';
  let commentBuf = '';

  const flush = () => {
    const text = buf.trim();
    if (text) statements.push({ text, line: bufStartLine });
    buf = '';
  };
  const atLineStart = () => /(^|\n)[ \t]*$/.test(buf);

  while (i < sql.length) {
    const ch = sql[i], next = sql[i + 1];
    if (ch === '\n') line++;
    switch (mode) {
      case 'sq': case 'dq': {
        buf += ch;
        const q = mode === 'sq' ? "'" : '"';
        if (ch === '\\' && next != null) { buf += next; if (next === '\n') line++; i += 2; continue; }
        if (ch === q) { if (next === q) { buf += next; i += 2; continue; } mode = 'code'; }
        i++; continue;
      }
      case 'bt': { buf += ch; if (ch === '`') mode = 'code'; i++; continue; }
      case 'line-comment': {
        if (ch === '\n') {
          const m = commentBuf.match(/^--\s*logical:\s*(\{.*\})\s*$/);
          if (m) logicalLines.push({ line: line - 1, json: m[1] });
          commentBuf = ''; mode = 'code'; buf += '\n';
        } else commentBuf += ch;
        i++; continue;
      }
      case 'block-comment': {
        if (ch === '*' && next === '/') { mode = 'code'; i += 2; continue; }
        i++; continue;
      }
      case 'code': {
        if (ch === "'") { mode = 'sq'; if (!buf.trim()) bufStartLine = line; buf += ch; i++; continue; }
        if (ch === '"') { mode = 'dq'; buf += ch; i++; continue; }
        if (ch === '`') { mode = 'bt'; buf += ch; i++; continue; }
        if (ch === '#' ) { mode = 'line-comment'; commentBuf = '#'; i++; continue; }
        if (ch === '-' && next === '-' && (sql[i + 2] === ' ' || sql[i + 2] === '\t' || sql[i + 2] === '\n' || sql[i + 2] == null)) {
          mode = 'line-comment'; commentBuf = '--'; i += 2; continue;
        }
        if (ch === '/' && next === '*') { mode = 'block-comment'; i += 2; continue; }
        if (atLineStart()) {
          const rest = sql.slice(i, sql.indexOf('\n', i) === -1 ? sql.length : sql.indexOf('\n', i));
          const dm = rest.match(/^DELIMITER\s+(\S+)/i);
          if (dm) { flush(); delimiter = dm[1]; i += dm[0].length; continue; }
        }
        if (sql.startsWith(delimiter, i)) {
          flush(); i += delimiter.length;
          if (delimiter !== ';' && sql.slice(i).match(/^\s*\n?\s*DELIMITER\s+;/i)) { /* handled by DELIMITER line rule */ }
          bufStartLine = line; continue;
        }
        if (!buf.trim() && !/\s/.test(ch)) bufStartLine = line;
        buf += ch; i++; continue;
      }
    }
  }
  if (mode === 'line-comment') {
    const m = commentBuf.match(/^--\s*logical:\s*(\{.*\})\s*$/);
    if (m) logicalLines.push({ line, json: m[1] });
  }
  flush();
  return { statements, logicalLines };
}

export interface PreprocessResult { text: string; srids: Map<string, number>; notes: string[] }

const SPATIAL_RE = 'geometry|point|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection';

export function preprocessStatement(text: string): PreprocessResult {
  const srids = new Map<string, number>();
  const notes: string[] = [];
  let out = text.replace(
    new RegExp('`?(\\w+)`?\\s+((?:' + SPATIAL_RE + ')\\b[^,]*?)\\s+SRID\\s+(\\d+)', 'gis'),
    (_m, col: string, mid: string, srid: string) => { srids.set(col, Number(srid)); return `\`${col}\` ${mid}`; },
  );
  if (/\bserial\b/i.test(out)) {
    out = out.replace(/\bserial\b/gi, 'bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE');
    notes.push('serial expanded to bigint unsigned NOT NULL AUTO_INCREMENT UNIQUE');
  }
  const legacyBinary = new RegExp('((?:var)?char\\s*\\(\\s*\\d+\\s*\\)|(?:tiny|medium|long)?text\\b)\\s+BINARY\\b', 'gi');
  if (legacyBinary.test(out)) {
    out = out.replace(legacyBinary, '$1');
    notes.push('legacy BINARY attribute removed (use a _bin collation instead)');
  }
  return { text: out, srids, notes };
}
```

- [ ] **Step 4: Run to verify pass** — `npm test`. The splitter is fiddly; if a case fails, debug the state machine — do not weaken tests.
- [ ] **Step 5: Commit** — `git commit -am "feat(sql): statement splitter and preprocessing"`

### Task 12: DDL parser (AST → model)

**Files:**
- Create: `src/lib/sql/parse.ts`, `src/lib/sql/parse.test.ts`
- Fixtures (already committed at plan time): `src/test/fixtures/sakila-schema.sql`, `src/test/fixtures/edgecases.sql`

**Interfaces:**
- Consumes: `splitScript`/`preprocessStatement`, types, `TYPE_MAP`/`TYPE_ALIASES`, `emptyContent`, `newId`, `uniqueName`.
- Produces:

```ts
export interface ParseIssue { line: number; statement: string; message: string; level: 'error' | 'skipped' | 'note' }
export function parseDDL(sql: string): { content: WorkspaceContent; issues: ParseIssue[] };
```

Behavior: CREATE TABLE and ALTER TABLE (ADD COLUMN / ADD INDEX-KEY-UNIQUE / ADD CONSTRAINT FK) are mapped; recognized non-DDL (INSERT/SET/USE/DROP/LOCK/UNLOCK/COMMIT/START/CREATE DATABASE|SCHEMA|VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT) skipped silently; anything else unparseable → issue `level:'error'` with line + first 60 chars, parsing continues. FKs resolved by table name (exact, then case-insensitive); missing ref table → drop FK + error issue; ref table found but a ref column missing → logical edge `m-1` + note issue. `-- logical:` lines resolved by `table[.column]` names → logical edges (unresolvable → note issue). Tables placed on a provisional grid `x=(i%5)*300+60, y=floor(i/5)*260+60`. AST field mapping (verified against node-sql-parser 5.4.0):

| Model field | AST source |
|---|---|
| statements array | `parser.astify(text, {database:'mysql'})` — WRAP: `Array.isArray(a) ? a : [a]` |
| column name | `def.column.column` (string) or `.column.expr.value` |
| base type | `def.definition.dataType.toLowerCase()` → alias-resolve; unknown base kept + note |
| length / precision,scale | `definition.length`(+`.scale`); for fsp types `length`→`fsp`; enum/set values from `definition.expr.value[].value` |
| unsigned/zerofill | `definition.suffix` array contains 'UNSIGNED'/'ZEROFILL' |
| nullable | `def.nullable?.type === 'not null'` → false |
| default literal | `default_val.value.type` in single/double_quote_string → literal; `number` → literal String; `null` → kind null; `bool` → literal '1'/'0'; `bit_string` → expression `` b'…' `` |
| default CURRENT_TIMESTAMP | `default_val.value.type==='function'` and name value uppercased is CURRENT_TIMESTAMP → kind current_timestamp, fsp = `args.value[0]?.value`; nested `value.over.type==='on update'` → onUpdateCurrentTimestamp (+fsp from `over.expr.value[0]?.value`) |
| default other expr | function/binary_expr etc → kind expression, value = `exprText(ast)` |
| ON UPDATE without DEFAULT | `def.reference_definition?.on_action[]` with type 'on update' |
| auto_increment | `def.auto_increment` truthy |
| charset/collation/comment | `def.character_set.value.value` / `def.collate.collate.name` / `def.comment.value.value` |
| generated | `def.generated` → expression `exprText(generated.expr)` (strip ONE outer paren pair), stored = `storage_type === 'stored'` |
| srid | preprocess map by column name |
| PRIMARY KEY | resource 'constraint', constraint_type 'primary key' |
| UNIQUE | constraint_type 'unique'/'unique key'/'unique index', name from `.index` |
| plain/fulltext/spatial index | resource 'index', `keyword` contains fulltext/spatial; name `.index`; per-col prefix `definition[j].suffix` string '(20)'; `order_by`; `index_options[]` type 'invisible' → visible=false |
| FK | constraint_type 'FOREIGN KEY': name `.constraint`, cols `definition[].column`, ref `reference_definition` (.table[0].table, .definition[].column, .on_action[] type 'on delete'/'on update', value.value uppercased; 'SET DEFAULT' → dropped + note) |
| table options | `ast.table_options[]` keyword: engine (InnoDB-case-normalized), auto_increment, 'default charset'/'charset'/'character set', collate, comment (value arrives WITH outer quotes — strip and un-double `''`) |
| ALTER … | `ast.type==='alter'`, items in `ast.expr[]` (or ast.expr object) with `.action==='add'`, `.resource` column/index/constraint — same sub-mappers; other actions → skipped issue |

`exprText(expr)` = `parser.sqlify({type:'select',columns:[{expr,as:null}],…nulls}, {database:'mysql'})` with `SELECT ` prefix stripped.

- [ ] **Step 1: Create the edge-case fixture** — `src/test/fixtures/edgecases.sql` (exact content):

```sql
-- schema fixture: exercises the whole mapping table
SET NAMES utf8mb4;
USE `shop`;

CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `active` boolean NOT NULL DEFAULT true,
  `bio` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orders (
  id bigint unsigned NOT NULL AUTO_INCREMENT,
  user_id int unsigned NOT NULL,
  status enum('new','paid','shipped') NOT NULL DEFAULT 'new',
  tags set('a','b') DEFAULT NULL,
  total decimal(12,2) NOT NULL DEFAULT '0.00',
  meta json DEFAULT (json_object()),
  placed_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  loc point NOT NULL SRID 4326,
  cents bigint GENERATED ALWAYS AS ((`total` * 100)) STORED,
  serial_col serial,
  legacy varchar(40) BINARY DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_status_prefix (status, legacy(10) DESC) INVISIBLE,
  FULLTEXT KEY ft_legacy (legacy),
  SPATIAL KEY sp_loc (loc),
  CONSTRAINT fk_orders_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_orders_ghost FOREIGN KEY (user_id) REFERENCES ghost_table (id)
) ENGINE=InnoDB AUTO_INCREMENT=1000 DEFAULT CHARSET=utf8mb4 COMMENT='order''s';

ALTER TABLE orders ADD COLUMN note varchar(64) DEFAULT NULL;
ALTER TABLE orders ADD INDEX idx_note (note);
ALTER TABLE `orders` ADD CONSTRAINT fk_orders_users2 FOREIGN KEY (user_id) REFERENCES `users` (`id`);

INSERT INTO users VALUES (1, 'a@b.c', 1, NULL);
TOTALLY NOT SQL %%%;

-- logical: {"from":"orders.status","to":"users","cardinality":"m-1","label":"soft"}
-- logical: {"from":"orders","to":"nowhere","cardinality":"1-1"}
```

- [ ] **Step 2: Write the failing test** — `src/lib/sql/parse.test.ts`:

```ts
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
    expect(col('users', 'active').type.base).toBe('tinyint');       // boolean alias
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
    expect(col('orders', 'note')).toBeTruthy();                     // ALTER ADD COLUMN
  });
  it('maps indexes with prefix/desc/invisible and kinds', () => {
    const ix = t('orders').indexes.find(x => x.name === 'idx_status_prefix')!;
    expect(ix.visible).toBe(false);
    expect(ix.columns[1]).toMatchObject({ length: 10, order: 'DESC' });
    expect(t('orders').indexes.some(x => x.kind === 'fulltext')).toBe(true);
    expect(t('orders').indexes.some(x => x.kind === 'spatial')).toBe(true);
    expect(t('orders').indexes.some(x => x.name === 'idx_note')).toBe(true);  // ALTER ADD INDEX
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
```

- [ ] **Step 3: Run to verify failure** — `npm test` → FAIL (`parse.ts` missing).

- [ ] **Step 4: Implement** — `src/lib/sql/parse.ts` (complete):

```ts
import { Parser } from 'node-sql-parser';
import type { Cardinality, Column, FkAction, IndexKind, Table, WorkspaceContent } from '../schema/types';
import { TYPE_ALIASES, TYPE_MAP, specOf } from '../schema/datatypes';
import { emptyContent } from '../schema/ops/tables';
import { newId } from '../schema/id';
import { uniqueName } from '../schema/naming';
import { splitScript, preprocessStatement, type RawStatement } from './split';

export interface ParseIssue { line: number; statement: string; message: string; level: 'error' | 'skipped' | 'note' }

const OPT = { database: 'mysql' } as const;
const SKIP_RE = /^(INSERT|REPLACE|SET|USE|DROP|LOCK|UNLOCK|COMMIT|START|BEGIN|GRANT|FLUSH|SOURCE|DELIMITER|CREATE\s+(DATABASE|SCHEMA|VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT|INDEX))\b/i;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ast = any;

const arr = (x: unknown): Ast[] => (Array.isArray(x) ? x : x == null ? [] : [x]);
const head = (s: string) => s.slice(0, 60).replace(/\s+/g, ' ');

interface PendingFk {
  childTable: string; name?: string; columns: string[];
  refTable: string; refColumns: string[];
  onDelete?: FkAction; onUpdate?: FkAction; line: number;
}

export function parseDDL(sql: string): { content: WorkspaceContent; issues: ParseIssue[] } {
  const parser = new Parser();
  const issues: ParseIssue[] = [];
  const content = emptyContent();
  const pendingFks: PendingFk[] = [];
  const { statements, logicalLines } = splitScript(sql);

  const exprText = (expr: Ast): string => {
    try {
      const s = parser.sqlify({ type: 'select', options: null, distinct: null, columns: [{ expr, as: null }],
        from: null, where: null, groupby: null, having: null, orderby: null, limit: null } as Ast, OPT);
      return s.replace(/^SELECT\s+/i, '');
    } catch { return '?'; }
  };
  const stripOuterParens = (s: string) => (s.startsWith('(') && s.endsWith(')') ? s.slice(1, -1) : s);
  const colRefName = (ref: Ast): string =>
    typeof ref === 'string' ? ref : typeof ref?.column === 'string' ? ref.column : ref?.column?.expr?.value ?? String(ref?.column ?? '?');
  const fkAction = (v: Ast): FkAction | undefined => {
    const up = String(v?.value?.value ?? v?.value ?? '').toUpperCase();
    return (['RESTRICT', 'CASCADE', 'SET NULL', 'NO ACTION'] as FkAction[]).find(a => a === up);
  };

  function mapColumn(def: Ast, srids: Map<string, number>, t: Table): Column {
    const name = colRefName(def.column);
    const rawBase = String(def.definition?.dataType ?? 'varchar').toLowerCase();
    const base = TYPE_MAP.has(rawBase) ? rawBase : TYPE_ALIASES[rawBase] ?? rawBase;
    if (!TYPE_MAP.has(base)) issues.push({ line: 0, statement: name, message: `Unknown type \`${rawBase}\` kept as-is`, level: 'note' });
    const col: Column = { id: newId(), name, type: { base }, nullable: def.nullable?.type !== 'not null' };
    const d = def.definition ?? {};
    const spec = specOf(base);
    if (spec?.params === 'precision-scale') { if (d.length != null) col.type.precision = d.length; if (d.scale != null) col.type.scale = d.scale; }
    else if (spec?.params === 'fsp') { if (d.length != null) col.type.fsp = d.length; }
    else if (d.length != null) col.type.length = d.length;
    if (spec?.params === 'values') col.type.values = arr(d.expr?.value).map((v: Ast) => String(v.value));
    const suffix: string[] = arr(d.suffix).map((s: Ast) => String(s).toUpperCase());
    if (suffix.includes('UNSIGNED')) col.unsigned = true;
    if (suffix.includes('ZEROFILL')) col.zerofill = true;
    if (def.auto_increment) col.autoIncrement = true;
    if (def.character_set?.value?.value) col.charset = String(def.character_set.value.value);
    if (def.collate?.collate?.name) col.collation = String(def.collate.collate.name);
    if (def.comment?.value?.value != null) col.comment = String(def.comment.value.value);
    if (def.generated) {
      col.generated = { expression: stripOuterParens(exprText(def.generated.expr)), stored: String(def.generated.storage_type).toLowerCase() === 'stored' };
    }
    const dv = def.default_val?.value;
    if (dv && !col.generated) {
      const kind = String(dv.type ?? '');
      if (kind === 'null') col.default = { kind: 'null' };
      else if (kind === 'single_quote_string' || kind === 'double_quote_string') col.default = { kind: 'literal', value: String(dv.value) };
      else if (kind === 'number') col.default = { kind: 'literal', value: String(dv.value) };
      else if (kind === 'bool') col.default = { kind: 'literal', value: dv.value ? '1' : '0' };
      else if (kind === 'bit_string') col.default = { kind: 'expression', value: `b'${dv.value}'` };
      else if (kind === 'function') {
        const fname = String(dv.name?.name?.[0]?.value ?? '').toUpperCase();
        if (fname === 'CURRENT_TIMESTAMP' || fname === 'NOW') {
          col.default = { kind: 'current_timestamp' };
          const fsp = dv.args?.value?.[0]?.value; if (fsp != null) col.default.fsp = Number(fsp);
        } else col.default = { kind: 'expression', value: stripOuterParens(exprText(dv)) };
        const over = dv.over;
        if (over?.type === 'on update') {
          col.onUpdateCurrentTimestamp = true;
          const ofsp = over.expr?.value?.[0]?.value; if (ofsp != null) col.onUpdateFsp = Number(ofsp);
        }
      } else col.default = { kind: 'expression', value: stripOuterParens(exprText(dv)) };
    }
    for (const act of arr(def.reference_definition?.on_action))
      if (act.type === 'on update') col.onUpdateCurrentTimestamp = true;
    const srid = srids.get(name); if (srid != null) col.type.srid = srid;
    if (col.autoIncrement) col.nullable = false;
    void t;
    return col;
  }

  function mapIndexDef(o: Ast, t: Table, kindHint?: IndexKind): void {
    const kw = String(o.keyword ?? o.constraint_type ?? '').toLowerCase();
    let kind: IndexKind = kindHint ?? 'index';
    if (kw.includes('primary')) kind = 'primary';
    else if (kw.includes('unique')) kind = 'unique';
    else if (kw.includes('fulltext')) kind = 'fulltext';
    else if (kw.includes('spatial')) kind = 'spatial';
    const visible = !arr(o.index_options).some((op: Ast) => String(op.type).toLowerCase() === 'invisible');
    const cols = arr(o.definition).map((cd: Ast) => {
      const rec: { columnId: string; length?: number; order?: 'ASC' | 'DESC' } = { columnId: '' };
      const cname = colRefName(cd);
      const target = t.columns.find(x => x.name === cname);
      rec.columnId = target?.id ?? '';
      const pm = String(cd.suffix ?? '').match(/\((\d+)\)/); if (pm) rec.length = Number(pm[1]);
      if (String(cd.order_by ?? '').toUpperCase() === 'DESC') rec.order = 'DESC';
      return rec;
    }).filter(rc => rc.columnId);
    if (!cols.length) return;
    const name = kind === 'primary' ? 'PRIMARY'
      : String(o.index ?? '') || uniqueName(`idx_${t.name}_${cols.length}`, t.indexes.map(i => i.name));
    t.indexes.push({ id: newId(), name, kind, visible, columns: cols });
  }

  function collectFk(o: Ast, childTable: string, line: number): void {
    const rd = o.reference_definition ?? {};
    const pending: PendingFk = {
      childTable, line,
      name: o.constraint ?? undefined,
      columns: arr(o.definition).map(colRefName),
      refTable: String(rd.table?.[0]?.table ?? ''),
      refColumns: arr(rd.definition).map(colRefName),
    };
    for (const act of arr(rd.on_action)) {
      const a = fkAction(act);
      const ty = String(act.type ?? '').toLowerCase();
      if (!a && act?.value) issues.push({ line, statement: pending.name ?? childTable, message: `Unsupported FK action dropped (${JSON.stringify(act.value?.value ?? act.value)})`, level: 'note' });
      if (ty === 'on delete' && a) pending.onDelete = a;
      if (ty === 'on update' && a) pending.onUpdate = a;
    }
    pendingFks.push(pending);
  }

  function mapCreateTable(ast: Ast, raw: RawStatement, srids: Map<string, number>): void {
    const name = String(ast.table?.[0]?.table ?? `table_${content.tables.length + 1}`);
    const i = content.tables.length;
    const t: Table = { id: newId(), name, x: (i % 5) * 300 + 60, y: Math.floor(i / 5) * 260 + 60, w: 220, columns: [], indexes: [], foreignKeys: [] };
    for (const def of arr(ast.create_definitions)) {
      if (def.resource === 'column') t.columns.push(mapColumn(def, srids, t));
      else if (def.resource === 'constraint' && String(def.constraint_type).toUpperCase() === 'FOREIGN KEY') collectFk(def, name, raw.line);
      else if (def.resource === 'constraint' || def.resource === 'index') mapIndexDef(def, t);
    }
    for (const op of arr(ast.table_options)) {
      const kw = String(op.keyword ?? '').toLowerCase();
      if (kw === 'engine') t.engine = String(op.value).toUpperCase() === 'INNODB' ? 'InnoDB' : String(op.value);
      else if (kw === 'auto_increment') t.autoIncrementStart = Number(op.value);
      else if (kw.includes('charset') || kw.includes('character set')) t.charset = String(op.value?.value ?? op.value);
      else if (kw === 'collate') t.collation = String(op.value?.value ?? op.value);
      else if (kw === 'comment') t.comment = String(op.value ?? '').replace(/^'(.*)'$/s, '$1').replace(/''/g, "'");
    }
    content.tables.push(t);
  }

  function mapAlter(ast: Ast, raw: RawStatement, srids: Map<string, number>): void {
    const tname = String(ast.table?.[0]?.table ?? '');
    const t = content.tables.find(x => x.name === tname) ?? content.tables.find(x => x.name.toLowerCase() === tname.toLowerCase());
    if (!t) { issues.push({ line: raw.line, statement: head(raw.text), message: `ALTER on unknown table \`${tname}\``, level: 'error' }); return; }
    for (const item of arr(ast.expr)) {
      if (item.action !== 'add') { issues.push({ line: raw.line, statement: head(raw.text), message: `ALTER ${item.action} skipped`, level: 'skipped' }); continue; }
      if (item.resource === 'column') t.columns.push(mapColumn(item, srids, t));
      else if (item.resource === 'constraint' && String((item.create_definitions ?? item).constraint_type).toUpperCase() === 'FOREIGN KEY')
        collectFk(item.create_definitions ?? item, t.name, raw.line);
      else if (item.resource === 'index' || item.resource === 'constraint') mapIndexDef(item.create_definitions ?? item, t);
    }
  }

  for (const raw of statements) {
    if (/^CREATE\s+TABLE/i.test(raw.text) || /^ALTER\s+TABLE/i.test(raw.text)) {
      const pre = preprocessStatement(raw.text);
      for (const n of pre.notes) issues.push({ line: raw.line, statement: head(raw.text), message: n, level: 'note' });
      try {
        for (const ast of arr(parser.astify(pre.text, OPT))) {
          if (ast.type === 'create' && ast.keyword === 'table') mapCreateTable(ast, raw, pre.srids);
          else if (ast.type === 'alter') mapAlter(ast, raw, pre.srids);
        }
      } catch (e) {
        issues.push({ line: raw.line, statement: head(raw.text), message: e instanceof Error ? e.message.slice(0, 160) : 'parse error', level: 'error' });
      }
    } else if (SKIP_RE.test(raw.text)) {
      /* silently skip recognized non-DDL */
    } else {
      issues.push({ line: raw.line, statement: head(raw.text), message: 'Unrecognized statement', level: 'error' });
    }
  }

  // resolve FKs
  for (const p of pendingFks) {
    const child = content.tables.find(x => x.name === p.childTable)!;
    const ref = content.tables.find(x => x.name === p.refTable) ?? content.tables.find(x => x.name.toLowerCase() === p.refTable.toLowerCase());
    if (!ref) { issues.push({ line: p.line, statement: p.name ?? p.childTable, message: `FK references missing table \`${p.refTable}\` — dropped`, level: 'error' }); continue; }
    const cols = p.columns.map(n => child.columns.find(x => x.name === n)?.id).filter((x): x is string => !!x);
    const refCols = p.refColumns.map(n => ref.columns.find(x => x.name === n)?.id).filter((x): x is string => !!x);
    if (cols.length !== p.columns.length || refCols.length !== p.refColumns.length || cols.length === 0) {
      content.logicalEdges.push({ id: newId(), fromTableId: child.id, toTableId: ref.id, cardinality: 'm-1', label: p.name });
      issues.push({ line: p.line, statement: p.name ?? p.childTable, message: `FK columns unresolved — kept as logical edge`, level: 'note' });
      continue;
    }
    const allNames = content.tables.flatMap(x => x.foreignKeys.map(f => f.name));
    child.foreignKeys.push({
      id: newId(), name: p.name ?? uniqueName(`fk_${child.name}_${ref.name}`, allNames),
      columnIds: cols, refTableId: ref.id, refColumnIds: refCols,
      ...(p.onDelete ? { onDelete: p.onDelete } : {}), ...(p.onUpdate ? { onUpdate: p.onUpdate } : {}),
    });
  }

  // resolve -- logical: lines
  for (const ll of logicalLines) {
    try {
      const j = JSON.parse(ll.json) as { from: string; to: string; cardinality: Cardinality; label?: string };
      const [ft, fc] = String(j.from).split('.'); const [tt, tc] = String(j.to).split('.');
      const from = content.tables.find(x => x.name === ft); const to = content.tables.find(x => x.name === tt);
      if (!from || !to) { issues.push({ line: ll.line, statement: ll.json.slice(0, 60), message: `logical edge endpoint not found`, level: 'note' }); continue; }
      content.logicalEdges.push({
        id: newId(), fromTableId: from.id, toTableId: to.id,
        fromColumnId: fc ? from.columns.find(x => x.name === fc)?.id : undefined,
        toColumnId: tc ? to.columns.find(x => x.name === tc)?.id : undefined,
        cardinality: (['1-1', '1-m', 'm-1', 'm-m'] as Cardinality[]).includes(j.cardinality) ? j.cardinality : 'm-1',
        label: j.label,
      });
    } catch { issues.push({ line: ll.line, statement: ll.json.slice(0, 60), message: 'invalid logical comment', level: 'note' }); }
  }

  return { content, issues };
}
```

- [ ] **Step 5: Run to verify pass** — `npm test`. Debug mapping against actual AST (`console.log(JSON.stringify(ast, null, 1))`) rather than changing test expectations — the fixtures encode the contract.
- [ ] **Step 6: Commit** — `git commit -am "feat(sql): DDL parser with per-statement recovery"`

### Task 13: Semantic equality + round-trip tests

**Files:**
- Create: `src/lib/schema/equal.ts`, `src/lib/sql/roundtrip.test.ts`

**Interfaces:**
- Produces:

```ts
export function canonicalize(c: WorkspaceContent): unknown;   // name-keyed, id/layout-free projection
export function semanticallyEqual(a: WorkspaceContent, b: WorkspaceContent): boolean;
```

Canonical form: tables sorted by name; per table `{name, comment ?? '', engine: t.engine ?? settings.defaultEngine, charset: …, collation: …, autoIncrementStart ?? null}`; columns in declared order projected to `{name, type: formatType(type), srid ?? null, unsigned: !!, zerofill: !!, nullable, default ?? null, onUpdateCurrentTimestamp: !!, onUpdateFsp ?? null, autoIncrement: !!, charset ?? null, collation ?? null, comment ?? '', generated ?? null}`; indexes sorted by `${kind}:${name}` with columns as `{name, length ?? null, order ?? 'ASC'}`; FKs sorted by name with column NAMES and ref table NAME; logicalEdges sorted by `${from}>${to}` as `{from: 'table[.col]', to, cardinality, label ?? ''}`. Comparison = `JSON.stringify` equality of canonical forms.

- [ ] **Step 1: Write the failing test** — `src/lib/sql/roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable, updateTableOptions, tableById } from '@/lib/schema/ops/tables';
import { addColumn, updateColumn, togglePk } from '@/lib/schema/ops/columns';
import { addIndex, updateIndex } from '@/lib/schema/ops/keys';
import { linkOneToMany, linkManyToMany, addLogicalEdge } from '@/lib/schema/ops/relations';
import { canonicalize, semanticallyEqual } from '@/lib/schema/equal';
import { generateScript } from './generate';
import { parseDDL } from './parse';

function richContent() {
  let { content: c, tableId: users } = addTable(emptyContent(), 0, 0);
  c = renameTable(c, users, 'users');
  let r = addColumn(c, users); c = r.content;
  c = updateColumn(c, users, r.columnId, {
    name: 'email', type: { base: 'varchar', length: 255 }, nullable: false,
    charset: 'utf8mb4', collation: 'utf8mb4_bin', comment: "user's email",
  });
  r = addColumn(c, users); c = r.content;
  c = updateColumn(c, users, r.columnId, { name: 'kind', type: { base: 'enum', values: ['a', 'b'] }, default: { kind: 'literal', value: 'a' } });
  r = addColumn(c, users); c = r.content;
  c = updateColumn(c, users, r.columnId, { name: 'joined', type: { base: 'datetime', fsp: 6 }, nullable: false,
    default: { kind: 'current_timestamp', fsp: 6 }, onUpdateCurrentTimestamp: true, onUpdateFsp: 6 });
  r = addColumn(c, users); c = r.content;
  c = updateColumn(c, users, r.columnId, { name: 'home', type: { base: 'point', srid: 4326 }, nullable: false });
  c = updateTableOptions(c, users, { comment: 'people', autoIncrementStart: 500 });
  const ordersR = addTable(c, 400, 0); c = ordersR.content;
  c = renameTable(c, ordersR.tableId, 'orders');
  c = linkOneToMany(c, users, ordersR.tableId).content;
  c = linkManyToMany(c, users, ordersR.tableId).content;
  const t = tableById(c, users)!;
  const ixR = addIndex(c, users, 'index'); c = ixR.content;
  c = updateIndex(c, users, ixR.indexId, { columns: [{ columnId: t.columns[1].id, length: 20, order: 'DESC' }], visible: false });
  c = addLogicalEdge(c, { fromTableId: ordersR.tableId, toTableId: users, cardinality: 'm-m', label: 'soft' }).content;
  return c;
}

describe('round-trip', () => {
  it('generate → parse yields a semantically equal model', () => {
    const original = richContent();
    const script = generateScript(original);
    const { content: reparsed, issues } = parseDDL(script);
    expect(issues.filter(i => i.level === 'error')).toEqual([]);
    expect(canonicalize(reparsed)).toEqual(canonicalize(original));
    expect(semanticallyEqual(original, reparsed)).toBe(true);
  });
  it('detects difference', () => {
    const a = richContent();
    const { content: b } = parseDDL(generateScript(a));
    b.tables[0].columns[0].nullable = !b.tables[0].columns[0].nullable;
    expect(semanticallyEqual(a, b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/schema/equal.ts`:

```ts
import type { WorkspaceContent } from './types';
import { formatType } from './datatypes';

export function canonicalize(c: WorkspaceContent): unknown {
  const tname = (id: string) => c.tables.find(t => t.id === id)?.name ?? '?';
  return {
    tables: [...c.tables].sort((a, b) => a.name.localeCompare(b.name)).map(t => {
      const cname = (id: string) => t.columns.find(x => x.id === id)?.name ?? '?';
      return {
        name: t.name, comment: t.comment ?? '',
        engine: t.engine ?? c.settings.defaultEngine,
        charset: t.charset ?? c.settings.defaultCharset,
        collation: t.collation ?? c.settings.defaultCollation,
        autoIncrementStart: t.autoIncrementStart ?? null,
        columns: t.columns.map(x => ({
          name: x.name, type: formatType(x.type), srid: x.type.srid ?? null,
          unsigned: !!x.unsigned, zerofill: !!x.zerofill, nullable: x.nullable,
          default: x.default ?? null,
          onUpdateCurrentTimestamp: !!x.onUpdateCurrentTimestamp, onUpdateFsp: x.onUpdateFsp ?? null,
          autoIncrement: !!x.autoIncrement,
          charset: x.charset ?? null, collation: x.collation ?? null,
          comment: x.comment ?? '', generated: x.generated ?? null,
        })),
        indexes: [...t.indexes].filter(ix => ix.columns.length)
          .map(ix => ({ name: ix.kind === 'primary' ? 'PRIMARY' : ix.name, kind: ix.kind, visible: ix.visible !== false,
            columns: ix.columns.map(ic => ({ name: cname(ic.columnId), length: ic.length ?? null, order: ic.order ?? 'ASC' })) }))
          .sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`)),
        foreignKeys: [...t.foreignKeys]
          .map(fk => {
            const ref = c.tables.find(x => x.id === fk.refTableId);
            return { name: fk.name, columns: fk.columnIds.map(cname),
              refTable: ref?.name ?? '?', refColumns: fk.refColumnIds.map(id => ref?.columns.find(x => x.id === id)?.name ?? '?'),
              onDelete: fk.onDelete ?? null, onUpdate: fk.onUpdate ?? null };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }),
    logicalEdges: [...c.logicalEdges].map(e => {
      const from = c.tables.find(t => t.id === e.fromTableId);
      const to = c.tables.find(t => t.id === e.toTableId);
      const fc = e.fromColumnId ? from?.columns.find(x => x.id === e.fromColumnId)?.name : undefined;
      const tc = e.toColumnId ? to?.columns.find(x => x.id === e.toColumnId)?.name : undefined;
      return { from: fc ? `${tname(e.fromTableId)}.${fc}` : tname(e.fromTableId),
               to: tc ? `${tname(e.toTableId)}.${tc}` : tname(e.toTableId),
               cardinality: e.cardinality, label: e.label ?? '' };
    }).sort((a, b) => `${a.from}>${a.to}`.localeCompare(`${b.from}>${b.to}`)),
  };
}

export const semanticallyEqual = (a: WorkspaceContent, b: WorkspaceContent) =>
  JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
```

- [ ] **Step 4: Run to verify pass** — `npm test`. Round-trip failures point at real generator/parser asymmetries — fix those modules, not the canonicalizer (except where the canonicalizer forgot a default-value normalization).
- [ ] **Step 5: Commit** — `git commit -am "test(sql): semantic equality and round-trip harness"`

### Task 14: Auto-layout

**Files:**
- Create: `src/lib/layout/autoLayout.ts`, `src/lib/layout/autoLayout.test.ts`

**Interfaces:**
- Consumes: types, `adjacency`/`deriveEdges` from `@/lib/schema/derive`.
- Produces:

```ts
export function estimateHeight(t: Table): number;         // 44 header + 22/column + 26 footer
export function autoLayout(c: WorkspaceContent): WorkspaceContent;  // returns copy with new x/y
```

Algorithm (deterministic): FK in-degree per table (# of FKs referencing it). Connected components over `adjacency` (FK + logical). Components sorted by size desc, then by min table name. Within a component: root = highest in-degree (tie → alphabetical); BFS with neighbors sorted by name; node layer = BFS depth; layer x = `60 + layer * 320`; tables within a layer stacked by cumulative `estimateHeight + 40`, sorted by name. Components stack vertically (`+80` gap after each component's max height). Tables with no edges go last, in a 4-per-row grid. Viewport untouched.

- [ ] **Step 1: Write the failing test** — `src/lib/layout/autoLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';
import { linkOneToMany } from '@/lib/schema/ops/relations';
import { autoLayout, estimateHeight } from './autoLayout';

const build = () => {
  let c = emptyContent();
  const ids: Record<string, string> = {};
  for (const n of ['a', 'b', 'c', 'lonely']) {
    const r = addTable(c, 0, 0); c = renameTable(r.content, r.tableId, n); ids[n] = r.tableId;
  }
  c = linkOneToMany(c, ids.a, ids.b).content;   // b -> a
  c = linkOneToMany(c, ids.a, ids.c).content;   // c -> a
  return { c, ids };
};

describe('autoLayout', () => {
  it('is deterministic and separates layers', () => {
    const { c, ids } = build();
    const l1 = autoLayout(c), l2 = autoLayout(c);
    expect(JSON.stringify(l1.tables.map(t => [t.name, t.x, t.y])))
      .toBe(JSON.stringify(l2.tables.map(t => [t.name, t.x, t.y])));
    const at = (id: string, l: typeof l1) => l.tables.find(t => t.id === id)!;
    expect(at(ids.a, l1).x).toBeLessThan(at(ids.b, l1).x);          // root layer left of children
    expect(at(ids.b, l1).x).toBe(at(ids.c, l1).x);                  // same BFS depth, same layer
  });
  it('produces no overlapping rectangles', () => {
    const { c } = build();
    const l = autoLayout(c);
    const rects = l.tables.map(t => ({ x: t.x, y: t.y, w: t.w, h: estimateHeight(t) }));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `tables ${i} and ${j} overlap`).toBe(false);
      }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/layout/autoLayout.ts`:

```ts
import type { Table, WorkspaceContent } from '../schema/types';
import { adjacency } from '../schema/derive';

export const estimateHeight = (t: Table): number => 44 + t.columns.length * 22 + 26;

export function autoLayout(c: WorkspaceContent): WorkspaceContent {
  const out = structuredClone(c);
  const byId = new Map(out.tables.map(t => [t.id, t]));
  const adj = adjacency(out);
  const inDegree = new Map<string, number>(out.tables.map(t => [t.id, 0]));
  for (const t of out.tables)
    for (const fk of t.foreignKeys)
      inDegree.set(fk.refTableId, (inDegree.get(fk.refTableId) ?? 0) + 1);

  const seen = new Set<string>();
  const components: string[][] = [];
  const sortedIds = [...out.tables].sort((a, b) => a.name.localeCompare(b.name)).map(t => t.id);
  for (const start of sortedIds) {
    if (seen.has(start) || (adj.get(start)?.size ?? 0) === 0) continue;
    const comp: string[] = []; const q = [start]; seen.add(start);
    while (q.length) {
      const id = q.shift()!; comp.push(id);
      for (const n of [...(adj.get(id) ?? [])].sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name)))
        if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    components.push(comp);
  }
  components.sort((a, b) => b.length - a.length ||
    byId.get(a[0])!.name.localeCompare(byId.get(b[0])!.name));

  let yBase = 60;
  for (const comp of components) {
    const root = [...comp].sort((a, b) =>
      (inDegree.get(b)! - inDegree.get(a)!) || byId.get(a)!.name.localeCompare(byId.get(b)!.name))[0];
    const layer = new Map<string, number>([[root, 0]]);
    const q = [root];
    while (q.length) {
      const id = q.shift()!;
      for (const n of [...(adj.get(id) ?? [])].sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name)))
        if (comp.includes(n) && !layer.has(n)) { layer.set(n, layer.get(id)! + 1); q.push(n); }
    }
    const layers = new Map<number, string[]>();
    for (const id of comp) {
      const l = layer.get(id) ?? 0;
      layers.set(l, [...(layers.get(l) ?? []), id]);
    }
    let compMaxY = yBase;
    for (const [l, ids] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
      let y = yBase;
      for (const id of ids.sort((a, b) => byId.get(a)!.name.localeCompare(byId.get(b)!.name))) {
        const t = byId.get(id)!;
        t.x = 60 + l * 320; t.y = y;
        y += estimateHeight(t) + 40;
      }
      compMaxY = Math.max(compMaxY, y);
    }
    yBase = compMaxY + 80;
  }

  const isolated = out.tables.filter(t => (adj.get(t.id)?.size ?? 0) === 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  let row = 0, col = 0, rowH = 0;
  for (const t of isolated) {
    t.x = 60 + col * 320; t.y = yBase + row;
    rowH = Math.max(rowH, estimateHeight(t) + 40);
    col++; if (col === 4) { col = 0; row += rowH; rowH = 0; }
  }
  return out;
}
```

Rename `row` → `rowOffset` when implementing (it accumulates pixels, not an index): `t.y = yBase + rowOffset; … if (col === 4) { col = 0; rowOffset += rowH; rowH = 0; }`.

- [ ] **Step 4: Run to verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(layout): deterministic layered auto-layout"`

---

## Phase 3 — Editor store

### Task 15: Zustand store with undo/redo

**Files:**
- Create: `src/store/editorStore.ts`, `src/store/editorStore.test.ts`

**Interfaces:**
- Consumes: types, ops (any), `zundo`.
- Produces (used by ALL canvas/inspector/page tasks):

```ts
import type { WorkspaceContent, WorkspaceMeta } from '@/lib/schema/types';
export type Selection = { kind: 'none' } | { kind: 'table'; tableId: string } | { kind: 'edge'; edgeId: string };
export type Tool = 'select' | 'link-1m' | 'link-11' | 'link-mm' | 'link-logical';
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error';

interface EditorState {
  meta: WorkspaceMeta | null;
  content: WorkspaceContent | null;
  selection: Selection;
  tool: Tool;
  linkSource: string | null;       // tableId picked as link source
  saveStatus: SaveStatus;
  initialize(meta: WorkspaceMeta, content: WorkspaceContent): void;  // resets undo history
  apply(next: WorkspaceContent, select?: Selection): void;           // THE mutation entry; marks dirty
  setSelection(s: Selection): void;
  setTool(t: Tool): void;          // also clears linkSource
  setLinkSource(id: string | null): void;
  setSaveStatus(s: SaveStatus): void;
  renameWorkspaceLocal(name: string): void;                          // meta.name only, marks dirty
  setViewportContent(vp: Viewport): void;   // updates content.viewport + marks dirty, NO undo entry
}
export const useEditorStore: UseBoundStore<…>;         // create<EditorState>()(temporal(...))
export function undo(): void; export function redo(): void;
```

zundo config: `temporal(fn, { partialize: s => ({ content: s.content }), limit: 50, equality: (a, b) => a.content?.tables === b.content?.tables && a.content?.logicalEdges === b.content?.logicalEdges })` — equality compares the `tables`/`logicalEdges` array REFERENCES, so `setViewportContent` (which replaces only `content.viewport`) never creates an undo entry, while every real schema edit (ops always produce fresh arrays via `structuredClone`) does. Usage pattern for components: `const next = someOp(store.content, …); store.apply(next.content ?? next, …)`.

**History-hygiene rule (binding for all canvas/inspector tasks):** the store is NEVER written during continuous gestures. Drags/resizes update the DOM directly and call ONE `apply(moveTable/resizeTable(...))` on pointerup; inline `contenteditable` text is uncontrolled and commits ONE `apply(renameTable/updateColumn(...))` on blur. Every `apply` is therefore exactly one undo step — no pause/resume machinery exists. `initialize` calls `useEditorStore.temporal.getState().clear()`.

- [ ] **Step 1: Write the failing test** — `src/store/editorStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, undo, redo } from './editorStore';
import { emptyContent, addTable, moveTable } from '@/lib/schema/ops/tables';

const meta = { id: 'w1', name: 'ws', tableCount: 0, createdAt: 0, updatedAt: 0 };

beforeEach(() => {
  useEditorStore.getState().initialize(meta, emptyContent());
});

describe('editor store', () => {
  it('apply mutates content, marks dirty, supports undo/redo', () => {
    const s = useEditorStore.getState();
    const { content } = addTable(s.content!, 10, 10);
    s.apply(content);
    expect(useEditorStore.getState().content!.tables.length).toBe(1);
    expect(useEditorStore.getState().saveStatus).toBe('dirty');
    undo();
    expect(useEditorStore.getState().content!.tables.length).toBe(0);
    redo();
    expect(useEditorStore.getState().content!.tables.length).toBe(1);
  });
  it('each apply is exactly one undo step', () => {
    const s = useEditorStore.getState();
    const { content, tableId } = addTable(s.content!, 0, 0);
    s.apply(content);
    useEditorStore.getState().apply(moveTable(useEditorStore.getState().content!, tableId, 100, 0));
    undo();
    expect(useEditorStore.getState().content!.tables[0].x).toBe(0);   // back to pre-drag commit
    undo();
    expect(useEditorStore.getState().content!.tables.length).toBe(0); // back to empty
  });
  it('initialize clears history', () => {
    const s = useEditorStore.getState();
    const { content } = addTable(s.content!, 0, 0);
    s.apply(content);
    s.initialize(meta, emptyContent());
    undo();
    expect(useEditorStore.getState().content!.tables.length).toBe(0);
  });
  it('selection and tool transitions', () => {
    const s = useEditorStore.getState();
    s.setTool('link-1m');
    s.setLinkSource('t1');
    s.setTool('select');
    expect(useEditorStore.getState().linkSource).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement** — `src/store/editorStore.ts`:

```ts
import { create } from 'zustand';
import { temporal } from 'zundo';
import type { WorkspaceContent, WorkspaceMeta } from '@/lib/schema/types';

export type Selection = { kind: 'none' } | { kind: 'table'; tableId: string } | { kind: 'edge'; edgeId: string };
export type Tool = 'select' | 'link-1m' | 'link-11' | 'link-mm' | 'link-logical';
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error';

interface EditorState {
  meta: WorkspaceMeta | null;
  content: WorkspaceContent | null;
  selection: Selection;
  tool: Tool;
  linkSource: string | null;
  saveStatus: SaveStatus;
  initialize(meta: WorkspaceMeta, content: WorkspaceContent): void;
  apply(next: WorkspaceContent, select?: Selection): void;
  setSelection(s: Selection): void;
  setTool(t: Tool): void;
  setLinkSource(id: string | null): void;
  setSaveStatus(s: SaveStatus): void;
  renameWorkspaceLocal(name: string): void;
}

export const useEditorStore = create<EditorState>()(
  temporal(
    (set) => ({
      meta: null, content: null,
      selection: { kind: 'none' }, tool: 'select', linkSource: null, saveStatus: 'idle',
      initialize: (meta, content) => {
        set({ meta, content, selection: { kind: 'none' }, tool: 'select', linkSource: null, saveStatus: 'idle' });
        useEditorStore.temporal.getState().clear();
      },
      apply: (next, select) =>
        set(s => ({ content: next, saveStatus: 'dirty', ...(select ? { selection: select } : {}), meta: s.meta })),
      setSelection: selection => set({ selection }),
      setTool: tool => set({ tool, linkSource: null }),
      setLinkSource: linkSource => set({ linkSource }),
      setSaveStatus: saveStatus => set({ saveStatus }),
      renameWorkspaceLocal: name => set(s => ({ meta: s.meta ? { ...s.meta, name } : null, saveStatus: 'dirty' })),
    }),
    {
      partialize: s => ({ content: s.content }),
      limit: 50,
      equality: (a, b) => a.content === b.content,
    },
  ),
);

export const undo = () => useEditorStore.temporal.getState().undo();
export const redo = () => useEditorStore.temporal.getState().redo();
```

- [ ] **Step 4: Run to verify pass** — `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(store): editor store with undo/redo"`

Also add to the Step 3 implementation (matching the interface above):

```ts
      setViewportContent: vp =>
        set(s => (s.content ? { content: { ...s.content, viewport: vp }, saveStatus: 'dirty' } : {})),
```

and the equality line in the temporal options must be exactly:

```ts
      equality: (a, b) => a.content?.tables === b.content?.tables && a.content?.logicalEdges === b.content?.logicalEdges,
```

with one extra test case appended to the describe block:

```ts
  it('viewport changes do not create undo entries', () => {
    const s = useEditorStore.getState();
    const { content } = addTable(s.content!, 0, 0);
    s.apply(content);
    useEditorStore.getState().setViewportContent({ x: 5, y: 5, zoom: 2 });
    expect(useEditorStore.getState().saveStatus).toBe('dirty');
    undo();
    expect(useEditorStore.getState().content!.tables.length).toBe(0);  // undo skipped the viewport change
  });
```

---

## Phase 4 — Canvas (the prototype port)

Reference for ALL of Phase 4: `docs/reference/bodh-er-prototype.html` (committed). Port its interaction semantics; differences from the prototype are called out per task. The canvas is always-editing (no view/edit mode split). The `#edges` SVG lives INSIDE the transformed world (world coordinates — pan/zoom never recomputes paths; only node move/resize/schema change does).

### Task 16: Canvas shell — world, pan/zoom, static table nodes, dev harness

**Files:**
- Create: `src/components/canvas/canvas.css`, `src/components/canvas/registry.ts`, `src/components/canvas/viewport.ts`, `src/components/canvas/TableNode.tsx`, `src/components/canvas/Canvas.tsx`, `src/app/dev/page.tsx`, `src/components/canvas/Canvas.test.tsx`

**Interfaces:**
- Consumes: store (Task 15), `columnBadges`/`formatType` (Tasks 3, 8).
- Produces:

```ts
// registry.ts
export function registerNode(tableId: string, el: HTMLDivElement | null): void;
export function nodeEl(tableId: string): HTMLDivElement | undefined;
export function nodeRect(t: Table): { x: number; y: number; w: number; h: number }; // DOM-measured, falls back to t.x/t.y/t.w/estimate
export function scheduleEdgeRender(): void;              // rAF-coalesced
export function onEdgeRender(fn: () => void): () => void;
// viewport.ts — screen-space camera, NOT React state
export const viewport: { x: number; y: number; zoom: number };
export function setCamera(p: Partial<typeof viewport>): void;   // applies transform + notifies
export function onCamera(fn: () => void): () => void;
export function bindWorld(el: HTMLDivElement | null): void;
export function zoomAt(canvas: HTMLElement, cx: number, cy: number, factor: number): void; // clamp 0.1–2.4
export function fitToContent(canvas: HTMLElement, tables: Table[], pad?: number): void;
export function screenToWorld(canvas: HTMLElement, clientX: number, clientY: number): { x: number; y: number };
// Canvas.tsx
export function Canvas(): JSX.Element;    // canvas root + world + nodes + (EdgeLayer from Task 18 slot)
// TableNode.tsx
export const TableNode: React.MemoExoticComponent<(props: { table: Table }) => JSX.Element>;
```

`canvas.css` ports the prototype's `.node/.node-head/.tname/.cols/.col/.cn/.ct/.badges/.tag/.rz/#world/#canvas` rules (lines 56–158 of the reference file) with these adaptations: tag color classes become `t-pk/t-fk/t-uq/t-nn/t-ai/t-un/t-ix` mapped to the Task 1 CSS variables; `.node` gets `border-top:3px solid var(--node-accent, var(--accent))` driven by inline `--node-accent` when `table.color` is set; add `.col.sel-row` highlight; world size 6400×4000 with the dotted-grid background. Import `canvas.css` from `Canvas.tsx`.

`TableNode` renders: header (`.tname` span `contentEditable suppressContentEditableWarning data-commit="table-name"`, delete button `data-act="delnode"`), column rows (`data-col={col.id}`: `.cn` span `contentEditable data-commit="col-name"`, badges from `columnBadges(table)`, `.ct` = `formatType` + default marker, `▾` button `data-act="colmenu"`), `+ column` button `data-act="addcol"`, resize handle `div.rz data-resize`. Ref callback → `registerNode`; a `useEffect` (every render) → `scheduleEdgeRender()`. All buttons are plain DOM targets — Task 17's single canvas-level pointer/click handlers dispatch on `data-*` attributes (prototype pattern), so `TableNode` itself binds NO handlers except nothing at all.

`Canvas` renders `#canvas > (#edges placeholder svg) + #world > TableNode*`, binds world ref, applies initial camera from `content.viewport` once, wires wheel-zoom (`{ passive: false }`, prototype `zoomAt` math) and canvas-drag panning (pointerdown on empty canvas → capture → move camera; pointerup → `setViewportContent({ ...viewport })`), wheel end also commits via 250 ms timeout. Dev harness `src/app/dev/page.tsx` ('use client'): on mount, `initialize(fakeMeta, demo())` where `demo()` builds two linked tables via ops, then renders `<Canvas/>` full-screen.

- [ ] **Step 1: Write the failing component test** — `src/components/canvas/Canvas.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Canvas } from './Canvas';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';

beforeEach(() => {
  let { content: c, tableId } = addTable(emptyContent(), 10, 10);
  c = renameTable(c, tableId, 'users');
  useEditorStore.getState().initialize({ id: 'w', name: 'w', tableCount: 1, createdAt: 0, updatedAt: 0 }, c);
});

describe('Canvas', () => {
  it('renders table nodes with pk badge and type', () => {
    render(<Canvas />);
    expect(screen.getByText('users')).toBeTruthy();
    expect(screen.getByText('id')).toBeTruthy();
    expect(screen.getByText('PK')).toBeTruthy();
    expect(screen.getByText('int')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL.
- [ ] **Step 3: Implement** all five files. Key code — `registry.ts`:

```ts
import type { Table } from '@/lib/schema/types';
import { estimateHeight } from '@/lib/layout/autoLayout';

const els = new Map<string, HTMLDivElement>();
export const registerNode = (id: string, el: HTMLDivElement | null) => { if (el) els.set(id, el); else els.delete(id); };
export const nodeEl = (id: string) => els.get(id);
export function nodeRect(t: Table): { x: number; y: number; w: number; h: number } {
  const el = els.get(t.id);
  if (!el) return { x: t.x, y: t.y, w: t.w, h: t.h ?? estimateHeight(t) };
  return { x: parseFloat(el.style.left) || t.x, y: parseFloat(el.style.top) || t.y, w: el.offsetWidth || t.w, h: el.offsetHeight || estimateHeight(t) };
}
const listeners = new Set<() => void>();
let scheduled = false;
export function scheduleEdgeRender() {
  if (scheduled || typeof requestAnimationFrame === 'undefined') { listeners.forEach(f => f()); return; }
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; listeners.forEach(f => f()); });
}
export function onEdgeRender(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
```

`viewport.ts`:

```ts
import type { Table } from '@/lib/schema/types';
import { estimateHeight } from '@/lib/layout/autoLayout';

export const viewport = { x: 40, y: 40, zoom: 1 };
let worldEl: HTMLDivElement | null = null;
const subs = new Set<() => void>();
const apply = () => { if (worldEl) worldEl.style.transform = `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`; };
export function bindWorld(el: HTMLDivElement | null) { worldEl = el; apply(); }
export function setCamera(p: Partial<typeof viewport>) { Object.assign(viewport, p); apply(); subs.forEach(f => f()); }
export function onCamera(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
export function zoomAt(canvas: HTMLElement, cx: number, cy: number, factor: number) {
  const nz = Math.min(2.4, Math.max(0.1, viewport.zoom * factor));
  const wx = (cx - viewport.x) / viewport.zoom, wy = (cy - viewport.y) / viewport.zoom;
  setCamera({ zoom: nz, x: cx - wx * nz, y: cy - wy * nz });
}
export function screenToWorld(canvas: HTMLElement, clientX: number, clientY: number) {
  const r = canvas.getBoundingClientRect();
  return { x: (clientX - r.left - viewport.x) / viewport.zoom, y: (clientY - r.top - viewport.y) / viewport.zoom };
}
export function fitToContent(canvas: HTMLElement, tables: Table[], pad = 70) {
  if (!tables.length) return setCamera({ x: 40, y: 40, zoom: 1 });
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  for (const t of tables) {
    mnX = Math.min(mnX, t.x); mnY = Math.min(mnY, t.y);
    mxX = Math.max(mxX, t.x + t.w); mxY = Math.max(mxY, t.y + (t.h ?? estimateHeight(t)));
  }
  const W = canvas.clientWidth || 1200, H = canvas.clientHeight || 800;
  const zoom = Math.max(0.12, Math.min((W - pad * 2) / (mxX - mnX), (H - pad * 2) / (mxY - mnY), 1.15));
  setCamera({ zoom, x: (W - (mxX - mnX) * zoom) / 2 - mnX * zoom, y: (H - (mxY - mnY) * zoom) / 2 - mnY * zoom });
}
```

`TableNode.tsx`:

```tsx
'use client';
import { memo, useEffect } from 'react';
import type { Table } from '@/lib/schema/types';
import { columnBadges } from '@/lib/schema/derive';
import { formatType } from '@/lib/schema/datatypes';
import { registerNode, scheduleEdgeRender } from './registry';

export const TableNode = memo(function TableNode({ table }: { table: Table }) {
  useEffect(() => { scheduleEdgeRender(); });
  const badges = columnBadges(table);
  return (
    <div className="node" data-node={table.id}
      ref={el => registerNode(table.id, el)}
      style={{ left: table.x, top: table.y, width: table.w, height: table.h || undefined,
        ...(table.color ? { ['--node-accent' as string]: table.color } : {}) }}>
      <div className="node-head" data-role="head">
        <div className="th-row">
          <span className="tname editable" contentEditable suppressContentEditableWarning
            data-commit="table-name" spellCheck={false}>{table.name}</span>
          <span className="hd-tools">
            <button data-act="delnode" title="delete table">🗑</button>
          </span>
        </div>
      </div>
      <div className="cols">
        {table.columns.map(col => (
          <div className={`col${badges.get(col.id)?.includes('PK') ? ' pk' : ''}`} key={col.id} data-col={col.id}>
            <span className="cn editable" contentEditable suppressContentEditableWarning
              data-commit="col-name" spellCheck={false}>{col.name}</span>
            <span className="badges">
              {(badges.get(col.id) ?? []).map(b => <span key={b} className={`tag t-${b.toLowerCase()}`}>{b}</span>)}
            </span>
            <span className="ct">{formatType(col.type)}{col.default ? <span className="cdef"> ≔</span> : null}</span>
            <button className="coledit" data-act="colmenu" title="column menu">▾</button>
          </div>
        ))}
        <button className="addcol" data-act="addcol">+ column</button>
      </div>
      <div className="rz" data-resize />
    </div>
  );
});
```

`Canvas.tsx` (shell for this task — Task 17 adds the pointer state machine, Task 18 mounts `EdgeLayer`):

```tsx
'use client';
import { useEffect, useRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { TableNode } from './TableNode';
import { bindWorld, setCamera, viewport, zoomAt } from './viewport';
import './canvas.css';

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const content = useEditorStore(s => s.content);
  const setViewportContent = useEditorStore(s => s.setViewportContent);

  useEffect(() => {
    const c = content?.viewport;
    if (c) setCamera({ x: c.x, y: c.y, zoom: c.zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content ? 'loaded' : 'empty']);

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    let commitTimer: ReturnType<typeof setTimeout>;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(el, ev.clientX - r.left, ev.clientY - r.top, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
      clearTimeout(commitTimer);
      commitTimer = setTimeout(() => setViewportContent({ ...viewport }), 250);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(commitTimer); };
  }, [setViewportContent]);

  if (!content) return null;
  return (
    <div id="canvas" ref={canvasRef}>
      <div id="world" ref={bindWorld}>
        {content.tables.map(t => <TableNode key={t.id} table={t} />)}
      </div>
    </div>
  );
}
```

`src/app/dev/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Canvas } from '@/components/canvas/Canvas';
import { useEditorStore } from '@/store/editorStore';
import { emptyContent, addTable, renameTable } from '@/lib/schema/ops/tables';
import { linkOneToMany } from '@/lib/schema/ops/relations';

export default function DevPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let { content: c, tableId: users } = addTable(emptyContent(), 80, 80);
    c = renameTable(c, users, 'users');
    const r = addTable(c, 480, 160); c = renameTable(r.content, r.tableId, 'orders');
    c = linkOneToMany(c, users, r.tableId).content;
    useEditorStore.getState().initialize({ id: 'dev', name: 'dev', tableCount: 2, createdAt: 0, updatedAt: 0 }, c);
    setReady(true);
  }, []);
  return ready ? <div style={{ position: 'fixed', inset: 0 }}><Canvas /></div> : null;
}
```

- [ ] **Step 4: Run to verify pass** — `npm test`, then `npm run dev` → open `http://localhost:3000/dev`: two styled table cards on dotted grid; wheel zooms at cursor. (Panning arrives in Task 17.)
- [ ] **Step 5: Commit** — `git commit -am "feat(canvas): world, camera, table nodes, dev harness"`

### Task 17: Pointer state machine — pan / drag / resize / inline edits / column quick menu

**Files:**
- Create: `src/components/canvas/interactions.ts`, `src/components/ui/ConfirmDialog.tsx`, `src/components/canvas/popovers.tsx` (column quick menu part)
- Modify: `src/components/canvas/Canvas.tsx` (wire handlers), `src/components/canvas/canvas.css` (popover/menu styles from prototype `.panel/#colpop/.fbtn` rules)

**Interfaces:**
- Produces:

```ts
// interactions.ts — attached by Canvas via useCanvasInteractions(canvasRef)
export function useCanvasInteractions(canvasRef: RefObject<HTMLDivElement | null>): void;
// exported pure-ish handlers for testing:
export function commitInlineEdit(target: HTMLElement): void;  // dispatch on data-commit: table-name | col-name
export function handleAction(target: HTMLElement, ev: { clientX: number; clientY: number }): void; // data-act dispatch
// ConfirmDialog.tsx
export function confirmDanger(message: string, okLabel: string): Promise<boolean>;
export function ConfirmHost(): JSX.Element;    // mount once in the editor screen / dev page
// popovers.tsx (this task: column quick menu)
export function openColumnMenu(tableId: string, columnId: string, x: number, y: number): void;
export function PopoverHost(): JSX.Element;    // renders active popover; mounted inside #canvas
```

Pointer state machine (port of prototype lines 507–524): single `pointerdown` on `#canvas` decides mode by `ev.target.closest()` — `[contenteditable]` → ignore; `[data-act],[data-commit]` buttons → ignore (click path); `[data-resize]`+node → `resize`; `[data-role="head"]`+node → `drag` (unless link tool active); `.node` → selection/link pick (click path); else `pan`. `setPointerCapture`; `pointermove` mutates DOM only (node `style.left/top` for drag using start snapshot + `dx/zoom`, `style.width/height` for resize min 200×60, camera for pan) + `scheduleEdgeRender()`; `pointerup` commits exactly one `apply(moveTable|resizeTable)` (drag/resize; skip if unmoved) or `setViewportContent` (pan). Drag brings node to front (`zIndex` counter module var). Inline edits: `blur` (capture-phase `focusout` on canvas) → `commitInlineEdit`: `table-name` → `apply(renameTable(...))`, `col-name` → `apply(updateColumn(tableId, colId, { name: text }))`; empty text restores previous (re-render from store). Enter key in contenteditable blurs. `click` handler dispatches `data-act`: `delnode` → `confirmDanger` → `apply(deleteTable, select none)`; `addcol` → `apply(addColumn…)` then focus+selectAll the new row's `.cn`; `colmenu` → `openColumnMenu`. Clicking a node (not in link mode) → `setSelection({kind:'table',tableId})` + `.sel` class via store-driven render (Canvas passes `selected` prop... simplest: TableNode reads `useEditorStore(s => s.selection)` itself — acceptable re-render cost).

Column quick menu popover: panel at click position listing toggle chips [PK, NN, UQ, AI, IX] (call the Task 5 toggles + `apply`), plus buttons "Inspector →" (`setSelection` table + set `window.dispatchEvent(new CustomEvent('open-inspector', {detail:{tableId, columnId}}))`) and "✕ Delete column" (`apply(deleteColumn…)`); closes on outside pointerdown or Escape.

`confirmDanger` implementation: module-level resolver + tiny zustand-free state in a `useSyncExternalStore` host component (message, okLabel, resolve); promise resolves false on cancel/backdrop.

- [ ] **Step 1: Write the failing test** (jsdom) — append to `src/components/canvas/Canvas.test.tsx`:

```tsx
import { fireEvent } from '@testing-library/react';
import { commitInlineEdit } from './interactions';

describe('inline commits', () => {
  it('renames table on blur commit', () => {
    render(<Canvas />);
    const name = screen.getByText('users');
    name.textContent = 'customers';
    commitInlineEdit(name as HTMLElement);
    expect(useEditorStore.getState().content!.tables[0].name).toBe('customers');
  });
  it('empty rename is rejected', () => {
    render(<Canvas />);
    const name = screen.getByText('users');
    name.textContent = '   ';
    commitInlineEdit(name as HTMLElement);
    expect(useEditorStore.getState().content!.tables[0].name).toBe('users');
  });
});
```

- [ ] **Step 2: Run to verify failure**, **Step 3: Implement** (state machine ~140 lines; port prototype geometry math verbatim: drag `n.x = start.x + (ev.clientX - start.mx) / viewport.zoom`), **Step 4: `npm test` + manual dev-page check:** pan by dragging empty canvas; drag node by header (edges lag until Task 18 — fine); resize via corner; rename table/column inline; add column; quick menu toggles PK/NN/UQ/AI/IX; delete table with confirm. **Step 5: Commit** — `git commit -am "feat(canvas): pointer interactions, inline edits, column quick menu"`

### Task 18: Edge layer — SVG relationships + hover trace

**Files:**
- Create: `src/components/canvas/EdgeLayer.tsx`
- Modify: `src/components/canvas/Canvas.tsx` (mount `<EdgeLayer/>` inside `#world` before nodes), `src/components/canvas/interactions.ts` (hover trace), `src/components/canvas/canvas.css` (edge styles from prototype lines 70–84 adapted: `.edge-fk` solid `var(--edge-fk)`, `.edge-logical` dashed `var(--edge-logical)`; `.elabel`; `.ehit`; `#canvas.focus` dimming)

**Interfaces:**
- Consumes: `deriveEdges`, `CARD_SYMBOLS`, `adjacency`, `nodeRect`, `onEdgeRender`, store selection.
- Produces:

```ts
export function EdgeLayer(): JSX.Element;
export function computeEdgePath(a: Rect, b: Rect, selfLoop: boolean): { d: string; la: Point; lb: Point; mid: Point };
// la/lb = label anchor points near each end; mid = label anchor for logical labels
```

Geometry (port of prototype lines 466–492, but in WORLD coordinates — no `w2s`): border-intersection anchor from rect center toward other center; quadratic curve with perpendicular bow `min(len*0.10, 26)`; self-loop cubic out the right edge; arrowhead markers `#ar-fk`/`#ar-logical` (`orient="auto-start-reverse"`, fill `var(--edge-…)`); cardinality labels: `CARD_SYMBOLS[e.cardinality]` — `[0]` near `from` end, `[1]` near `to` end, offset 15px along + 7px perpendicular; logical edges also render `e.label` at mid. SVG root: `<svg id="edges" width={6400} height={4000} viewBox="0 0 6400 4000">` absolutely positioned in world. Each edge = `<g data-edge={id}>` containing `.ehit` (strokeWidth 16, `pointerEvents: 'stroke'`) + `.edge` path + label `<text>`s. React re-renders on store content change; a `useEffect` subscribes `onEdgeRender` and imperatively recomputes ALL `d`/label positions from `nodeRect` during drags (both paths share `computeEdgePath`). `.ehit` click → `setSelection({kind:'edge', edgeId})` (popover in Task 19). Selected edge gets `.sel`.

Hover trace (interactions.ts): `pointerover/out` on world — on node hover add `focus` class to `#canvas`, add `.hi` to hovered+adjacent node els (via `nodeEl` + `adjacency`) and to edges touching the table (`svg [data-edge]` querySelector loop); remove on out (port lines 527–530).

- [ ] **Step 1: Write the failing test** — new `src/components/canvas/EdgeLayer.test.tsx` (jsdom): initialize store with the Task 16 demo pair (users←orders), `render(<Canvas/>)`, assert `document.querySelector('.edge.edge-fk')` exists, both `text.elabel` contents are `'N'` and `'1'`, and `computeEdgePath` unit cases: horizontal rects → anchors on facing borders (`la.x > a.x + a.w - 1`), self-loop `d` starts with `M` and contains `C`.
- [ ] **Step 2: Run to verify failure**, **Step 3: Implement** (~170 lines), **Step 4: `npm test` + manual dev check:** edge with N/1 labels renders between the two tables and follows a node drag live at 60fps; hovering `users` dims unrelated nodes. **Step 5: Commit** — `git commit -am "feat(canvas): world-space SVG edge layer with hover trace"`

### Task 19: Link tools, edge popover, keyboard, deletion flows

**Files:**
- Modify: `src/components/canvas/interactions.ts` (link picks, keyboard), `src/components/canvas/popovers.tsx` (edge popover), `src/app/dev/page.tsx` (temporary tool buttons)

**Interfaces:**
- Produces:

```ts
export function handleNodePick(tableId: string, x: number, y: number): void; // link-tool flow; exported for tests
// popovers: openEdgeMenu(edgeId, x, y) added to PopoverHost
```

`handleNodePick` (called from the click path when `tool !== 'select'`): first pick → `setLinkSource(tableId)` + `.linksrc` class; second pick → run op by tool (`link-1m` → `linkOneToMany(source, target)` — FIRST pick is the parent/**1** side; `link-11` likewise; `link-mm` → `linkManyToMany`; `link-logical` → `addLogicalEdge({from: source, to: target, cardinality: 'm-1'})`), then `apply(content, …)`, `setTool('select')`, and open the edge/junction result: mm → select junction table; logical → `openEdgeMenu` on the new edge. A hint banner (`.panel` div in Canvas, visible when `tool !== 'select'`): "Link mode: click the source table, then the target." Escape cancels.

Edge popover (`openEdgeMenu`): FK edges — title `child → parent`, constraint-name text input (commits `updateForeignKey` on blur), two selects ON DELETE / ON UPDATE (`—`, RESTRICT, CASCADE, SET NULL, NO ACTION → `updateForeignKey`), button "✕ Drop constraint" (`confirmDanger` → `deleteForeignKey`; note: keeps the FK columns). Logical edges — 2×2 cardinality grid (`updateLogicalEdge`), label input, "✕ Delete link" (`deleteLogicalEdge`, no confirm). Popover closes on outside-pointerdown/Escape (shared PopoverHost behavior from Task 17).

Keyboard (window listener in `useCanvasInteractions`, skipped when `ev.target` is contenteditable/input/select/textarea): `Ctrl/Cmd+Z` undo, `Ctrl+Shift+Z`/`Ctrl+Y` redo, `Delete`/`Backspace` → selected table (`confirmDanger` → `deleteTable`) or selected edge (fk → `confirmDanger` → `deleteForeignKey`; logical → delete straight), `Escape` → close popovers, clear link state (`setTool('select')`), clear selection.

- [ ] **Step 1: Write the failing test** — `src/components/canvas/linkflow.test.ts` (node env, no DOM): initialize store with demo pair; `setTool('link-1m')`; `handleNodePick(users, 0, 0)` → expect `linkSource === users`; `handleNodePick(orders, 0, 0)` → expect orders has 1 FK, `tool === 'select'`, `linkSource === null`. Same for `link-mm` (3 tables after) and `link-logical` (1 logicalEdge). Popover DOM parts are covered by the manual dev check.
- [ ] **Step 2: Run to verify failure**, **Step 3: Implement**, **Step 4: `npm test` + manual dev check:** all four tools draw; FK popover edits actions; Ctrl+Z undoes an entire link creation in ONE step; Delete removes a table after confirm; junction table appears for N:M with composite PK badges. **Step 5: Commit** — `git commit -am "feat(canvas): link tools, edge popover, keyboard flows"`

---

## Phase 5 — Inspector

### Task 20: Inspector shell + Columns tab

**Files:**
- Create: `src/components/inspector/Inspector.tsx`, `src/components/inspector/ColumnsTab.tsx`, `src/components/inspector/fields.tsx`, `src/components/inspector/ColumnsTab.test.tsx`
- Modify: `src/app/dev/page.tsx` (mount `<Inspector/>` right side)

**Interfaces:**
- Consumes: store, ops (columns/tables), datatypes catalog.
- Produces:

```ts
export function Inspector(): JSX.Element | null;
// renders when selection.kind === 'table': header (table name), tabs Columns|Indexes|FKs|Options
// (Indexes/FKs/Options panes are placeholder <div>s until Task 21), SqlPreview slot (Task 22)
// listens for CustomEvent 'open-inspector' {tableId, columnId} → selects table + expands that column
// fields.tsx small controlled primitives:
export function TextField(p: { label: string; value: string; onCommit: (v: string) => void; mono?: boolean }): JSX.Element;
export function NumField(p: { label: string; value: number | undefined; onCommit: (v: number | undefined) => void }): JSX.Element;
export function SelectField(p: { label: string; value: string; options: [string, string][]; onCommit: (v: string) => void }): JSX.Element;
export function CheckRow(p: { label: string; checked: boolean; disabled?: boolean; onToggle: () => void }): JSX.Element;
export function ValuesEditor(p: { values: string[]; onCommit: (v: string[]) => void }): JSX.Element; // ENUM/SET chips
```

`ColumnsTab`: list of column rows (name · type summary · expand chevron). Expanded row = full editor driven by the catalog `TypeSpec`:
- **Type select** grouped by category (`optgroup` per numeric/string/datetime/json/spatial). On change: `apply(updateColumn(tid, cid, { type: nextTypeDefaults }))` where `nextTypeDefaults` seeds required params (`varchar`→length 255, `decimal`→(10,2), `enum`→existing values or `[]`, `char/binary`→length 1) and relies on `sanitizeColumn` for attribute cleanup.
- **Param inputs by `spec.params`**: length (`NumField`), precision+scale (two `NumField`s), fsp (`SelectField` 0–6), `ValuesEditor` for enum/set (add chip on Enter, ✕ removes, reorder ←/→ buttons), SRID `NumField` for spatial.
- **Flags** (`CheckRow`s, disabled per predicates): NOT NULL, UNSIGNED, ZEROFILL, AUTO_INCREMENT, plus Generated (expression `TextField` mono + STORED/VIRTUAL select) — enabling Generated disables default/AI inputs.
- **Default editor**: `SelectField` kind (None / NULL / Literal / Expression / CURRENT_TIMESTAMP — last one only when `supportsTimeDefault`), value `TextField` for literal/expression, fsp select + "ON UPDATE CURRENT_TIMESTAMP" `CheckRow` for time types.
- **Charset/Collation** selects (only when `supportsCharset`; collation options from `CHARSETS[charset]`, charset change resets collation to first).
- **Comment** `TextField`.
- Row footer: ↑ ↓ (`moveColumn`), 🗑 (`deleteColumn`), all via `apply`.
- `+ Add column` button at bottom (`addColumn` + auto-expand new row).

All commits go through `apply(...)` — one undo step per field commit (commit on blur/change, never per keystroke).

- [ ] **Step 1: Write the failing test** — `src/components/inspector/ColumnsTab.test.tsx` (jsdom): initialize store with one table selected; render `<Inspector/>`; expand first column; change type select to `decimal` → expect store column type `{base:'decimal', precision:10, scale:2}` and UNSIGNED checkbox enabled; change to `varchar` → UNSIGNED checkbox disabled and store column has `length: 255`; change type to `enum`, add values via ValuesEditor input (fireEvent Enter with 'a') → store values `['a']`.
- [ ] **Step 2: Run to verify failure**, **Step 3: Implement** (Inspector ~90 lines, ColumnsTab ~220, fields ~120; styling: Tailwind + panel CSS vars, width 360px, `position:absolute right-0 top-0 bottom-0`, scrollable), **Step 4: `npm test` + manual dev check:** every catalog type selectable with correct contextual params; enum chips work; AI disabled on varchar. **Step 5: Commit** — `git commit -am "feat(inspector): shell and catalog-driven Columns tab"`

### Task 21: Indexes, Foreign Keys, Options tabs

**Files:**
- Create: `src/components/inspector/IndexesTab.tsx`, `src/components/inspector/FksTab.tsx`, `src/components/inspector/OptionsTab.tsx`, `src/components/inspector/keysTabs.test.tsx`
- Modify: `src/components/inspector/Inspector.tsx` (mount real tabs)

**Interfaces:** consumes keys ops (Task 6), `updateTableOptions`, `ENGINES`, `CHARSETS`.

`IndexesTab`: list (name · kind chip · column list). Expanded: name `TextField`, kind `SelectField` (primary disabled if another primary exists), VISIBLE `CheckRow`, and an index-columns editor — ordered rows of [column `SelectField` from table columns · prefix length `NumField` (only for text/blob bases) · ASC/DESC toggle · ✕], plus "+ add column" appending the first unused column. `+ Add index` footer (kind picker) → `addIndex`. Delete button per index (`deleteIndex`; PRIMARY delete allowed — validation flags no-pk).

`FksTab`: list per constraint (name · → ref table). Expanded: name `TextField`, ref-table `SelectField` (changing it resets column pairs), pair rows [local column select · → · ref column select · ✕], "+ add pair", ON DELETE/ON UPDATE selects, "✕ Drop constraint" (confirm). `+ Add foreign key` → `addForeignKey` seeded with `{columnIds: [first column], refTableId: first other table, refColumnIds: [its pk col]}` (button disabled when no other table exists). All via `apply(updateForeignKey(...))`.

`OptionsTab`: engine select (ENGINES), charset select (keys of CHARSETS + "workspace default" empty option), collation select (depends on charset), AUTO_INCREMENT start `NumField`, comment `TextField`, accent color — 8 fixed swatches + clear (sets `table.color`) — and a danger zone: Duplicate table (`duplicateTable` + select copy) / Delete table (confirm).

- [ ] **Step 1: Write the failing test** — `keysTabs.test.tsx` (jsdom): with users←orders demo: FksTab renders `fk_orders_users`; changing ON DELETE select to CASCADE updates store; IndexesTab "+ add index" creates `idx_…`; OptionsTab engine select to MyISAM sets `table.engine`.
- [ ] **Step 2–4:** implement (~150 lines each tab), `npm test`, manual dev check: build a composite PK via IndexesTab on a junction table; edit FK pairs; set table comment.
- [ ] **Step 5: Commit** — `git commit -am "feat(inspector): indexes, foreign keys, options tabs"`

### Task 22: SQL preview + validation panel

**Files:**
- Create: `src/components/inspector/SqlPreview.tsx`, `src/components/inspector/ValidationPanel.tsx`, `src/components/inspector/SqlPreview.test.tsx`
- Modify: `src/components/inspector/Inspector.tsx` (preview below tabs), `src/app/dev/page.tsx` (mount `<ValidationPanel/>` bottom-left)

**Interfaces:**

```ts
export function SqlPreview(p: { tableId: string }): JSX.Element;  // live generateTableSQL, 📋 copy button
export function ValidationPanel(): JSX.Element;                    // collapsible issue list from validateContent
```

`SqlPreview`: `<pre className="sqlpreview">` mono, subscribed to content — regenerates on every change; copy via `navigator.clipboard.writeText`. `ValidationPanel`: floating `.panel` bottom-left, header `⚠ N issues` (hidden when 0, collapsed by default), rows colored by level; clicking a row with `tableId` selects that table (and dispatches `open-inspector` when `columnId` present). Debounce validation with `useMemo` on content reference.

- [ ] **Steps 1–5:** failing test (SqlPreview renders `CREATE TABLE \`users\`` for demo table; ValidationPanel shows a duplicate-name issue after renaming both tables to the same name via store), implement (~70 lines each), `npm test`, manual check, commit `feat(inspector): live SQL preview and validation panel`.

---

## Phase 6 — Firebase, auth, workspaces

### Task 23: Firebase app + auth + auth pages

**Files:**
- Create: `src/lib/firebase/app.ts`, `src/lib/firebase/auth.ts`, `src/components/ui/AuthGate.tsx`, `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/reset/page.tsx`, `src/app/page.tsx` (replace), `firestore.rules`, `.env.local.example`
- Modify: `README.md` (Firebase setup section)

**Interfaces:**

```ts
// app.ts
export function firebaseApp(): FirebaseApp;      // lazy singleton from NEXT_PUBLIC_FIREBASE_* env
export function db(): Firestore;                 // initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
export function auth(): Auth;
// auth.ts
export function useAuthUser(): { user: User | null; loading: boolean };   // onAuthStateChanged
export function signInWithGoogle(): Promise<void>;                        // signInWithPopup(GoogleAuthProvider)
export function signUpWithEmail(email: string, password: string): Promise<void>;
export function signInWithEmail(email: string, password: string): Promise<void>;
export function sendReset(email: string): Promise<void>;
export function signOutUser(): Promise<void>;
export function authErrorMessage(e: unknown): string;   // maps auth/invalid-credential, auth/email-already-in-use, auth/weak-password, auth/popup-closed-by-user, else generic
// AuthGate.tsx
export function AuthGate(p: { children: ReactNode }): JSX.Element; // loading spinner → children when signed in → router.replace('/login') when not
```

`firebaseApp()` throws a descriptive error listing missing env vars. Env vars: `NEXT_PUBLIC_FIREBASE_API_KEY, _AUTH_DOMAIN, _PROJECT_ID, _APP_ID` (`.env.local.example` lists them with placeholders). `firestore.rules` (exact):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Pages (Tailwind, centered card, CSS-var theming): `/login` — Google button (`signInWithGoogle` → `router.replace('/dashboard')`), divider, email+password form (`signInWithEmail`), inline error via `authErrorMessage`, links to `/register` & `/reset`. `/register` — email/password/confirm, `signUpWithEmail` → dashboard. `/reset` — email, `sendReset` → success note. `/` (replace scaffold page) — `'use client'`; `useAuthUser` → `router.replace(user ? '/dashboard' : '/login')`, spinner meanwhile. README gains: create Firebase project (Spark) → enable Auth providers Google + Email/Password → create Firestore (production mode) → paste `firestore.rules` in console → copy web-app config into `.env.local`.

- [ ] **Step 1: Write the failing test** — `src/lib/firebase/auth.test.ts` (node): `authErrorMessage({ code: 'auth/email-already-in-use' })` → `'An account with this email already exists.'`; `authErrorMessage(new Error('x'))` → `'Something went wrong. Try again.'`; plus `firebaseApp` throws when env missing (`vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', '')` …).
- [ ] **Step 2–4:** implement, `npm test`, `npm run build` (pages compile without env at build time — all Firebase calls are inside `'use client'` components/effects; `firebaseApp()` must NOT be called at module top level anywhere).
- [ ] **Step 5: Commit** — `git commit -am "feat(auth): firebase auth, gate, login/register/reset pages"`

### Task 24: Workspace repository + dashboard

**Files:**
- Create: `src/lib/firebase/workspaces.ts`, `src/app/dashboard/page.tsx`, `src/lib/firebase/workspaces.test.ts`

**Interfaces:**

```ts
// workspaces.ts — all paths under users/{uid}/workspaces
export function listWorkspaces(uid: string): Promise<WorkspaceMeta[]>;            // orderBy updatedAt desc
export function createWorkspace(uid: string, name: string): Promise<string>;      // batch: meta {name, tableCount:0, createdAt/updatedAt: serverTimestamp} + content/schema {json: JSON.stringify(emptyContent())}
export function loadWorkspace(uid: string, id: string): Promise<{ meta: WorkspaceMeta; content: WorkspaceContent }>;
export function saveWorkspace(uid: string, id: string, content: WorkspaceContent, name: string): Promise<void>; // batch: content set + meta update {name, tableCount, updatedAt: serverTimestamp}
export function renameWorkspace(uid: string, id: string, name: string): Promise<void>;
export function deleteWorkspace(uid: string, id: string): Promise<void>;          // batch delete content/schema + meta
export function duplicateWorkspace(uid: string, id: string): Promise<string>;
export function watchMeta(uid: string, id: string, cb: (meta: WorkspaceMeta, fromServer: boolean) => void): Unsubscribe;
export function contentByteSize(content: WorkspaceContent): number;               // new TextEncoder().encode(JSON.stringify(content)).length
export function normalizeContent(raw: unknown): WorkspaceContent;                 // tolerant loader: fills missing fields, validates schemaVersion, throws TypeError on garbage
```

Content doc stores the workspace as ONE string field `json` (dodges Firestore's nested-array limits and key constraints). Timestamps → millis via `snap.get('updatedAt')?.toMillis?.() ?? 0`. `watchMeta` passes `fromServer = !snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache`.

Dashboard page: AuthGate-wrapped; header (app name, user email, theme toggle, sign out); "+ New workspace" (prompt-less: creates `untitled` + `router.push('/w/'+id)`); grid of cards (name, "N tables", relative updatedAt) with hover menu — Open / Rename (inline input) / Duplicate / Delete (confirmDanger). Empty state hero with a "Create your first workspace" button. Offline/error states render a message with retry.

- [ ] **Step 1: Write the failing test** — `workspaces.test.ts` (node, no emulator): unit-test `normalizeContent` (fills defaults for `{schemaVersion:1,tables:[…partial]}`, throws on `null`/`'x'`/missing tables) and `contentByteSize` (> 2 for empty content). Firestore calls themselves are covered by the Task 28 manual checklist against the real Spark project.
- [ ] **Step 2–4:** implement (repo ~140 lines, dashboard ~180), `npm test`, `npm run build`.
- [ ] **Step 5: Commit** — `git commit -am "feat(workspaces): firestore repository and dashboard"`

### Task 25: Editor page — load, autosave, topbar, conflict banner

**Files:**
- Create: `src/app/w/[id]/page.tsx`, `src/components/ui/Topbar.tsx`, `src/components/ui/SaveIndicator.tsx`, `src/lib/firebase/useAutosave.ts`, `src/lib/firebase/useAutosave.test.ts`
- Modify: none (dev page stays)

**Interfaces:**

```ts
// useAutosave.ts
export function useAutosave(uid: string, workspaceId: string): void;
// subscribes useEditorStore; when saveStatus === 'dirty': debounce 2000ms → setSaveStatus('saving') → saveWorkspace(...)
// → 'saved' (or 'error'); flushes pending save on visibilitychange hidden / beforeunload / unmount;
// navigator.onLine === false → status 'offline' (still attempts; firestore queues);
// contentByteSize > 800_000 → one-time console.warn + sets a sizeWarning flag exposed via useEditorStore meta? NO —
// dispatches CustomEvent('workspace-size-warning') consumed by Topbar badge.
// Topbar.tsx
export function Topbar(p: { onExport: () => void; onImport: () => void }): JSX.Element;
// brand (Sketchio), workspace name (inline contentEditable → renameWorkspaceLocal → autosave picks it up),
// SaveIndicator, sep, tools: [+ Table] [1:N] [1:1] [N:M] [Logical] (tool buttons reflect store.tool),
// [Tidy] (autoLayout+fit) [Fit] [zoom −/label/+] [↶ ↷] [Import] [Export ▾] [Theme] [avatar menu → dashboard / sign out]
```

`/w/[id]/page.tsx` (`'use client'`; `useParams()` for id): AuthGate → load flow: `loadWorkspace(uid, id)` → `initialize(meta, content)`; not-found/permission error → friendly screen + back link. Mounts: `<Topbar/>`, `<Canvas/>`, `<Inspector/>`, `<ValidationPanel/>`, `<PopoverHost/>`, `<ConfirmHost/>`, `<Legend/>` (Task 27 adds Legend — mount then). `useAutosave(uid, id)`. `watchMeta` subscription: if `fromServer` and `meta.updatedAt > lastAppliedUpdatedAt + 1500` and status isn't 'saving' → conflict banner "This workspace changed in another session — [Reload] [Keep mine]" (Reload: re-`loadWorkspace`+`initialize`; Keep mine: force `saveWorkspace` now). `+ Table` adds at viewport center (`screenToWorld` of canvas midpoint). Unsaved-changes guard: `beforeunload` preventDefault when dirty/saving.

- [ ] **Step 1: Write the failing test** — `useAutosave.test.ts` (jsdom, `vi.useFakeTimers`, `vi.mock('./workspaces')`): initialize store → `apply(addTable…)` (status dirty) → advance 2000ms → expect mocked `saveWorkspace` called once with latest content and status transitions dirty→saving→saved; second rapid apply within the window coalesces to one save; save rejection → status 'error'.
- [ ] **Step 2–4:** implement (autosave ~80 lines; topbar ~150; page ~140), `npm test`, `npm run build`; manual: full flow against a real Firebase project — login → dashboard → create → edit → hard-reload resumes → second tab shows conflict banner on concurrent edit.
- [ ] **Step 5: Commit** — `git commit -am "feat(editor): workspace page with autosave and conflict handling"`

---

## Phase 7 — Import/Export + polish

### Task 26: Export menu (SQL/JSON/PNG) + Import dialog (SQL/JSON)

**Files:**
- Create: `src/components/ui/ExportMenu.tsx`, `src/components/ui/ImportDialog.tsx`, `src/lib/export/files.ts`, `src/lib/export/png.ts`, `src/lib/export/files.test.ts`
- Modify: `src/components/ui/Topbar.tsx` (wire), `src/app/w/[id]/page.tsx` (dialog state)

**Interfaces:**

```ts
// files.ts
export function downloadText(filename: string, text: string, mime?: string): void; // Blob + a.click + revoke
export function workspaceToJson(meta: WorkspaceMeta, content: WorkspaceContent): string;  // {app:'sketchio', schemaVersion, name, content}
export function jsonToContent(text: string): { name: string; content: WorkspaceContent }; // validates via normalizeContent, throws with message
// png.ts
export async function exportPng(worldEl: HTMLElement, tables: Table[], theme: 'light' | 'dark'): Promise<Blob>;
// html-to-image toPng of worldEl cropped to content bbox+60px pad: temporarily set worldEl transform to
// translate(-minX+60,-minY+60) scale(1) and width/height to bbox+120, snapshot with pixelRatio 2 and
// backgroundColor var(--bg) resolved, restore prior inline styles in finally, convert dataURL → Blob.
```

`ExportMenu` (dropdown): "SQL script (.sql)" → `downloadText(name + '.sql', generateScript(content))`; "Workspace JSON" → `workspaceToJson`; "PNG image" → `exportPng` → object-URL download (hides `.sel`/popovers first via a `document.body.classList.add('exporting')` CSS rule). `ImportDialog` (modal): tabs SQL / JSON; SQL tab — textarea + file picker (`.sql`), Import button → **dynamic import** `const { parseDDL } = await import('@/lib/sql/parse')` (keeps node-sql-parser out of the main bundle) → issues list rendered grouped by level with line numbers → "Apply" states clearly: *replaces the current diagram* (confirmDanger when tables exist) → `apply(autoLayout(parsed.content))` + fit; JSON tab — file picker → `jsonToContent` → same replace flow (no autoLayout — JSON carries layout). Errors render inline, never throw past the dialog.

- [ ] **Step 1: failing test** — `files.test.ts` (jsdom): `workspaceToJson`→`jsonToContent` round-trips name+content; `jsonToContent('{}')` throws with readable message; `downloadText` creates and clicks an anchor (spy on `URL.createObjectURL` + `HTMLAnchorElement.prototype.click`).
- [ ] **Step 2–4:** implement, `npm test`; manual: export Sakila fixture → re-import → diagram identical modulo layout; PNG downloads and opens.
- [ ] **Step 5: Commit** — `git commit -am "feat(io): sql/json/png export and import dialog"`

### Task 27: Legend, hint bar, empty states, shortcuts — final canvas polish

**Files:**
- Create: `src/components/ui/Legend.tsx`
- Modify: `src/components/canvas/EdgeLayer.tsx` (kind visibility filter), `src/components/canvas/canvas.css`, `src/app/w/[id]/page.tsx` (mount Legend), delete `src/app/dev/page.tsx`

**Interfaces:** `Legend` — bottom-left `.panel` (prototype `#legend` styles): rows [solid swatch "Foreign key" · toggles], [dashed swatch "Logical link" · toggle], cardinality explainer "1 / N labels at line ends", keyboard cheat list (drag/scroll/del/ctrl+z). Edge-kind toggles live in a tiny module store `src/components/canvas/edgeVisibility.ts` (`hidden: Set<'fk'|'logical'>` + subscribe), consumed by EdgeLayer (`display:none` groups). Canvas empty state (no tables): centered ghost card "Double-click or press + Table to start" — and add canvas dblclick → addTable at cursor. Delete the dev route.

- [ ] **Steps 1–5:** test (EdgeLayer respects hidden kinds — toggling fk hides `.edge-fk` group in jsdom render), implement, `npm test` + `npm run build`, manual sweep at `/w/[id]`, commit `feat(ui): legend, edge visibility, empty state, dev-route removal`.

---

## Phase 8 — Verification & deploy

### Task 28: Full verification, README, Vercel

**Files:**
- Modify: `README.md` (complete: features, stack, setup, deploy), `package.json` (engines note optional)
- Create: `docs/superpowers/verification-checklist.md` (the checklist below, with results filled in)

- [ ] **Step 1: Gates** — `npm run lint` clean; `npm test` all green; `npm run build` clean.
- [ ] **Step 2: SQL-against-MySQL smoke** (needs Docker; skip with a note if unavailable):

```bash
docker run --rm -d --name ermysql -e MYSQL_ROOT_PASSWORD=root -p 33306:3306 mysql:8.0
# wait for readiness, then: build a rich workspace in the app, Export SQL, save as /tmp/claude-1000/…/export.sql
docker exec -i ermysql sh -c 'mysql -uroot -proot -e "CREATE DATABASE t"; mysql -uroot -proot t' < export.sql
docker exec ermysql mysql -uroot -proot -e 'SHOW TABLES IN t; SHOW CREATE TABLE t.<one-table>\G'
docker rm -f ermysql
```

Expected: zero errors; SHOW CREATE mirrors the model.

- [ ] **Step 3: Manual checklist** (record pass/fail per line in the checklist doc):
  auth: google login, email register+login, reset mail, signout, gate redirects ·
  dashboard: create/rename/duplicate/delete, counts & timestamps ·
  canvas: pan/zoom/fit/tidy, drag/resize, hover trace, inline renames, quick menu toggles ·
  tools: 1:N, 1:1, N:M (junction correct), logical, self-reference 1:N on one table ·
  inspector: every tab edits persist; enum values editor; generated column; SRID; invisible index; composite PK; FK pairs editor ·
  sql: preview matches export; export runs on MySQL 8 (Step 2); import Sakila fixture → 16 tables, readable layout, issues panel lists only notes; import a broken file → partial import + errors listed ·
  io: JSON export/import round-trip; PNG export ·
  persistence: autosave indicator cycle; offline edit (devtools offline) syncs on reconnect; second-tab conflict banner both paths; 800KB warning (paste a giant imported schema) ·
  history: undo/redo across every mutation class incl. link tools and imports; viewport changes skip history ·
  theme: light/dark toggle persists; system default respected.
- [ ] **Step 4: Deploy** — push `main`, `vercel` import repo (or `npx vercel`), set the four `NEXT_PUBLIC_FIREBASE_*` env vars, add the Vercel domain to Firebase Auth authorized domains, verify production login+save.
- [ ] **Step 5: Commit** — `git commit -am "docs: verification results and deployment README"` and push.

---

## Plan Self-Review Notes (kept for the record)

- **Spec coverage check:** datatype catalog incl. SRID (§4 spec → Task 3/20); composite keys (Tasks 6/21); FK actions (6/19/21); relationship tools incl. junction + self-ref (7/19); logical edges + round-trip via `-- logical:` comments (7/10/12); inspector tabs + SQL preview (20–22); validation rules list (9/22); DDL export details (10); import with per-statement recovery + auto-layout + parser bake-off decision (11/12/14); JSON/PNG (26); Firestore split + autosave + conflict banner + 800KB warning + offline (24/25); auth flows (23); undo/redo + history hygiene (15 + rule); theme (1/27); non-goals respected (no snapshots/minimap/marquee/mobile/collab tasks).
- **Known simplifications vs spec, accepted:** column reorder via ↑/↓ buttons (spec said "reorderable"); import **replaces** the workspace content (spec's "get a diagram" — merging is out of scope); `SET DEFAULT` FK action rejected at parse with note (InnoDB doesn't support it).
- **Type-consistency pass:** `apply(content)` signature used uniformly; ops that return `{content, id}` destructured at call sites; `estimateHeight` imported by registry+layout from one place; `Selection`/`Tool` names match across store/canvas/popovers; `WorkspaceMeta.updatedAt` is millis everywhere (converted at the Firestore boundary).






