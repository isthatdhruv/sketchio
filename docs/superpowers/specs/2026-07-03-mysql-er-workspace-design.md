# MySQL ER Workspace — Design

**Date:** 2026-07-03
**Status:** Approved (pending final spec review)
**Reference prototype:** `bodh-er.html` (hand-rolled canvas ER viewer/editor; its look, feel, and interaction model are the visual baseline for the editor)

## 1. Purpose

A web workspace for visually designing MySQL databases — MySQL Workbench's EER diagram experience, in the browser. Users sign in, keep a list of workspaces (diagrams) that autosave as they edit, design schemas with full MySQL 8.0 fidelity (all datatypes, column attributes, PK/UK/FK/indexes, 1:1 / 1:N / N:M relationships), and move real DDL in both directions: export a runnable `.sql` script, import an existing schema dump into a diagram.

## 2. Decisions log

| Decision | Choice |
|---|---|
| Hosting | **Vercel** (standard Next.js build; no static-export constraints) |
| Backend | **None.** Firebase Auth + Firestore called from the client; Firestore security rules enforce access. Fits the Firebase **Spark (free) plan** — no Cloud Functions anywhere. |
| Auth providers | Google sign-in + email/password (with reset flow). No guest mode. |
| History model | Workspace list per user + autosave. No snapshots/versioning in v1. |
| SQL | Both directions: DDL export **and** import (reverse engineering). |
| Canvas engine | **Port of the prototype's hand-rolled engine** (Approach B). No canvas library. |
| MySQL target | **8.0** (generated DDL and supported features target 8.0). |

## 3. Architecture

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS**, deployed on Vercel. The app is client-heavy; there are no API routes and no server-side data access. Server components are used only as static shells.
- **Firebase JS SDK** in the browser: Auth (Google popup + email/password) and Firestore (workspace storage, offline persistence enabled).
- **Zustand** store for editor state, wrapped with **zundo** (temporal middleware) for undo/redo.
- Theming via CSS custom properties (the prototype's variable set, light + dark), with Tailwind for layout/chrome.

### Module layout

```
src/
  lib/schema/       # PURE TS, no React:
    types.ts        #   Workspace, Table, Column, Index, ForeignKey, LogicalEdge
    datatypes.ts    #   MySQL 8.0 type catalog (drives UI + validation + SQL gen)
    ops.ts          #   pure mutation functions (addTable, setColumnType, addFk, …)
    validate.ts     #   schema lint: warnings/errors
    derive.ts       #   derived data: edges from FKs, badges from indexes
  lib/sql/
    generate.ts     # schema model → MySQL 8.0 DDL script (hand-written)
    parse.ts        # DDL → schema model; wraps parser lib behind parseDDL()
  lib/layout/
    autoLayout.ts   # layered layout for imported schemas
  lib/firebase/
    app.ts auth.ts workspaces.ts   # repo: list/create/load/autosave/delete
  store/
    editorStore.ts  # Zustand + zundo; schema+layout tracked, selection/viewport not
  components/
    canvas/         # Canvas (pan/zoom world), TableNode, EdgeLayer, interactions
    inspector/      # right panel: Columns / Indexes / FKs / Options tabs
    ui/             # topbar, legend, dialogs, save indicator
  app/              # routes: / /login /register /reset /dashboard /w/[id]
```

**Isolation rule:** `lib/schema` and `lib/sql` import nothing from React, the store, or Firebase. They are the testable core. Components mutate state only through `ops.ts` functions dispatched via the store.

## 4. Schema model

Three levels; keys/constraints are first-class objects, **not** column flags (the prototype's `pk:1` flags are replaced; canvas badges are derived).

```ts
Workspace: { id, name, settings: { defaultEngine, defaultCharset, defaultCollation },
             tables: Table[], logicalEdges: LogicalEdge[], viewport }

Table:    { id, name, comment?, engine?, charset?, collation?, autoIncrementStart?,
            columns: Column[], indexes: Index[], foreignKeys: ForeignKey[],
            x, y, w, h?, color? }                    // layout embedded

Column:   { id, name,
            type: { base: TypeBase, length?, precision?, scale?, fsp?, values?[] },
            unsigned?, zerofill?, nullable = true,
            default?: { kind: 'literal'|'expression'|'null'|'current_timestamp', value?, fsp? },
            onUpdateCurrentTimestamp?, autoIncrement?,
            charset?, collation?, comment?,
            generated?: { expression, stored: boolean } }

Index:    { id, name, kind: 'primary'|'unique'|'index'|'fulltext'|'spatial',
            columns: [{ columnId, length?, order: 'ASC'|'DESC' }], visible = true }

ForeignKey: { id, name, columns: columnId[], refTableId, refColumnIds: columnId[],
              onDelete?: FkAction, onUpdate?: FkAction }   // RESTRICT|CASCADE|SET NULL|NO ACTION

LogicalEdge: { id, fromTableId, fromColumnId?, toTableId, toColumnId?,
               cardinality: '1-1'|'1-m'|'m-1'|'m-m', label? }  // annotation only, no DDL
```

### Datatype catalog (`datatypes.ts`)

Single source of truth: every MySQL 8.0 type, its parameter shape, and which attributes apply. Drives the type dropdown, the param inputs shown, validation, and SQL generation.

- **Numeric:** TINYINT, SMALLINT, MEDIUMINT, INT, BIGINT (optional display width; UNSIGNED/ZEROFILL/AUTO_INCREMENT allowed), DECIMAL(p,s), FLOAT, DOUBLE, BIT(n), BOOLEAN (alias → TINYINT(1)).
- **String:** CHAR(n), VARCHAR(n) (length required), TINYTEXT/TEXT/MEDIUMTEXT/LONGTEXT, BINARY(n), VARBINARY(n), TINYBLOB/BLOB/MEDIUMBLOB/LONGBLOB, ENUM(values…), SET(values…) — ENUM/SET get a value-list editor. Charset/collation apply to text types only.
- **Date/time:** DATE, TIME(fsp), DATETIME(fsp), TIMESTAMP(fsp), YEAR. DATETIME/TIMESTAMP support `DEFAULT CURRENT_TIMESTAMP(fsp)` and `ON UPDATE CURRENT_TIMESTAMP(fsp)`.
- **JSON.**
- **Spatial:** GEOMETRY, POINT, LINESTRING, POLYGON, MULTIPOINT, MULTILINESTRING, MULTIPOLYGON, GEOMETRYCOLLECTION (SPATIAL index only on these, NOT NULL required for SPATIAL index).
- Parser normalizes aliases (INTEGER→INT, NUMERIC→DECIMAL, BOOL/BOOLEAN→TINYINT(1), SERIAL→BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE).
- Attribute applicability enforced: UNSIGNED/ZEROFILL numeric-only; AUTO_INCREMENT integer-only, one per table, must be part of a key; fsp 0–6 on time types; TEXT/BLOB/JSON/GEOMETRY defaults must be expression defaults `(expr)` (8.0.13+ syntax), not literals; generated columns can't be AUTO_INCREMENT or have DEFAULT.

## 5. Editor UX

### Canvas (ported from prototype, same feel)

Dotted-grid world with `transform`-based pan/zoom (wheel-zoom at cursor, drag-pan, Fit, +/− controls, zoom % readout). Table cards: colored top border, header (name + tools), column rows (name · badges · type), drag by header, resize handle, bring-to-front. Curved SVG edges with arrowheads, endpoint cardinality labels (1/N), self-loop support, click-to-edit via fat hit paths. Hover-trace (dim non-neighbors). Legend panel with per-edge-kind visibility toggles; hint bar; confirm dialog for destructive actions. Light/dark theme toggle persisted per user. Pointer interactions run outside React's render cycle (direct style mutation + rAF edge redraws — the prototype's technique); state commits to the store on pointerup, which is what makes drags single undo entries.

Column rows show derived badges: **PK** (in primary index), **FK** (in an FK constraint), **UQ**, **NN**, **AI**, **UN**, **IX**. Quick-toggling PK/UQ/NN/AI/IX on a row edits the underlying index/column; FK badges are read-only (managed via constraints). Inline `contenteditable` rename for table and column names, `+ column` affordance on each card.

### Inspector panel (replaces the prototype's column popover)

Right-side panel, opens on table select, tabs:

- **Columns** — reorderable rows: name, type dropdown (grouped by category), contextual params (length / p,s / fsp / ENUM-SET values editor), flag toggles (NN, UN, ZF, AI, generated VIRTUAL/STORED + expression), default-value editor (literal / expression / NULL / CURRENT_TIMESTAMP + ON UPDATE), charset/collation, comment, delete.
- **Indexes** — create/edit/delete PRIMARY, UNIQUE, INDEX, FULLTEXT, SPATIAL; multi-column with per-column order and prefix length; name; visibility (8.0 invisible indexes).
- **Foreign Keys** — constraint name, ordered column pairs (local ↔ referenced), referenced-table dropdown, ON DELETE / ON UPDATE actions, delete constraint.
- **Options** — engine (InnoDB default, MyISAM, MEMORY, ARCHIVE, CSV), charset, collation, comment, AUTO_INCREMENT start, card accent color (canvas-only).

Below the tabs: **live SQL preview** — the selected table's generated `CREATE TABLE`, always current, copyable.

### Relationship tools (Workbench semantics)

Toolbar tools; each is click-source-then-click-target on the canvas:

- **1:N** — click parent, then child. Creates FK column(s) in the child mirroring the parent's PK (name `{parentTable}_{pkColumn}`, collision-suffixed; type copied incl. UNSIGNED), an index on them, and the FK constraint. Edge appears automatically.
- **1:1** — same, plus a UNIQUE index on the FK column(s).
- **N:M** — click A, then B. Creates junction table `{a}_{b}` (collision-suffixed) with FK columns to both PKs and a composite PRIMARY KEY; two FK edges appear. Junction table is a normal table thereafter.
- **Logical link** — annotation edge with user-picked cardinality (1-1 / 1-N / N-1 / N-M) and optional label; dashed rendering; produces no DDL. (Successor of the prototype's ref/name/json edge kinds.)

FK-backed edges are **derived** — one edge per FK constraint, N at the child end, 1 at the parent end, upgraded to 1-1 when the FK columns carry a UNIQUE/PK index. Their cardinality is not directly editable; it follows the schema. Edge click opens a popover: for FK edges — constraint name, ON DELETE/UPDATE, jump-to-FK-tab, delete constraint (with confirm); for logical edges — cardinality, label, delete. Composite-parent PKs are fully supported by all tools.

### Editing verbs & shortcuts

Undo/redo across every schema/layout mutation (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y). Delete key removes selected table/edge (confirm for tables). Duplicate table (copy suffixed, sans FKs). Escape exits link mode / closes popovers. All destructive actions confirm.

### Validation panel

Non-blocking warnings, updated live, clicking one focuses the offender: duplicate table/column/index/constraint names, FK column-type mismatch vs referenced column (incl. UNSIGNED), table without PK, AUTO_INCREMENT column not in a key, empty ENUM/SET values, identifier > 64 chars, >1 AUTO_INCREMENT per table.

## 6. SQL engine

### Export (`generate.ts`, hand-written)

Deterministic full-script generation: header comment, `SET FOREIGN_KEY_CHECKS=0;` … `=1;` wrapper (table order never breaks), one `CREATE TABLE` per table with backtick-quoted identifiers, columns in model order with full fidelity (type + params, UNSIGNED/ZEROFILL, NULL/NOT NULL, DEFAULT incl. expression defaults and CURRENT_TIMESTAMP(fsp), ON UPDATE, AUTO_INCREMENT, CHARACTER SET/COLLATE, COMMENT, GENERATED ALWAYS AS … VIRTUAL/STORED), then PRIMARY KEY / UNIQUE KEY / KEY / FULLTEXT / SPATIAL clauses with prefix lengths and INVISIBLE where set, then `CONSTRAINT … FOREIGN KEY … REFERENCES … ON DELETE/UPDATE`, then table options (ENGINE, AUTO_INCREMENT, DEFAULT CHARSET, COLLATE, COMMENT). String escaping for literals and comments. Logical edges are emitted as trailing `-- logical:` comment lines so they survive a JSON-less round trip as documentation.

### Import (`parse.ts`)

`parseDDL(sql): { schema, issues[] }` — our own interface; a proven MySQL parser library underneath (candidate `node-sql-parser`; final selection is an implementation-plan task with a bake-off against the test corpus, swappable behind the interface). Behavior:

- Splits the script into statements; handles `CREATE TABLE` (all column/index/FK forms above, inline or clause-level) and `ALTER TABLE ADD CONSTRAINT/INDEX/COLUMN`; silently skips non-DDL (INSERT, SET, USE, DROP, comments).
- **Per-statement error recovery:** a failing statement is reported (line number + message) and skipped; the rest of the import proceeds. Result banner: "Imported N tables (M statements skipped)" with an expandable issue list.
- Unresolvable FK references (missing table/column) become logical edges with a warning rather than being dropped.
- Test corpus: Sakila, WordPress core schema, and a curated edge-case file (composite keys, generated columns, ENUM quoting, fsp, prefix indexes, spatial).

### Round-trip correctness

Vitest golden tests for the generator; property tests: model → generate → parse → semantically equal model (ignoring layout/ids). This is the core correctness harness of the project.

### Other formats

- **JSON** export/import of the full workspace (schema + layout + logical edges).
- **PNG** export of the diagram via `html-to-image` on the world element (export-only dependency).

### Auto-layout (imports and "tidy up" button)

Connected components → BFS layers from highest FK in-degree roots → tables placed in layer columns with vertical packing; isolated tables in a trailing grid. Deterministic. Always followed by Fit.

## 7. Persistence & Firebase

### Firestore layout

```
users/{uid}/workspaces/{wid}            # metadata: name, createdAt, updatedAt, tableCount
users/{uid}/workspaces/{wid}/content/schema   # the blob: tables, logicalEdges, viewport
```

Dashboard lists metadata docs only (cheap); opening the editor reads metadata + content (2 reads). `tableCount`/`updatedAt` denormalized into metadata on save.

### Autosave

Debounced 2 s after the last mutation; also flushed on tab hide/unload and on navigating back to dashboard. Save-state indicator in the topbar: *Saved · Saving… · Offline (will sync) · Error (retry)*. Firestore offline persistence (IndexedDB) enabled — editing survives connection loss and syncs on reconnect. Multi-tab/device conflicts: last-write-wins; the editor listens to the metadata doc and shows a "This workspace changed elsewhere — Reload / Keep mine" banner when `updatedAt` moves under it. Serialized schema > 800 KB triggers a size warning (Firestore doc limit is 1 MB); JSON export is the escape hatch.

### Security rules (`firestore.rules`, committed to repo)

```
match /users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

Plus max-size validation on writes. Rules deployed via Firebase console or CLI (no paid features).

### Quota sanity (Spark)

Writes: 1 autosave ≥ every 2 s of active editing but ≤ ~1/2s only while mutating; realistic sessions ≪ 20 K writes/day. Reads: dashboard = N metadata docs; editor open = 2. Comfortable headroom.

## 8. Auth & routes

| Route | Behavior |
|---|---|
| `/` | Redirect: signed-in → `/dashboard`, else → `/login` |
| `/login` | Google button + email/password form; links to register/reset |
| `/register` | Email/password signup (display name optional) |
| `/reset` | Password-reset email flow |
| `/dashboard` | Workspace cards (name, last edited, table count): open, create, rename, duplicate, delete (confirm) |
| `/w/[id]` | The editor. Loads workspace or 404-style "not found / not yours" state |

Client-side auth guard (loading gate until Firebase resolves auth state; redirect to `/login` when signed out). Firebase config via `NEXT_PUBLIC_FIREBASE_*` env vars (`.env.local`, documented in README; safe to expose by design, enforcement lives in rules).

## 9. Error handling

- **Firestore save failure:** indicator flips to Error with retry; mutations keep queueing locally; leaving with unsaved changes prompts.
- **Load failure / permission denied:** friendly full-screen state with back-to-dashboard.
- **SQL import errors:** never abort-all; per-statement issue list (line, statement head, message).
- **Auth errors:** inline form messages (wrong password, email in use, popup closed).
- **Corrupt/oversize workspace content:** JSON schema-version field + normalize-on-load (like the prototype's `normalize()`); unknown fields preserved where harmless.

## 10. Testing

- **Vitest unit tests** (the bulk): `lib/schema/ops` (every mutation incl. relationship tools and junction generation), `validate`, `derive`, `generate` (golden files), `parse` (corpus), round-trip property tests, `autoLayout` determinism.
- **Component tests** (light, Testing Library): inspector column editing, type-dropdown param switching, badge quick-toggles.
- **Manual e2e checklist** in the plan (canvas feels, autosave, auth flows, import Sakila, export runs on MySQL 8 via `docker run mysql:8` locally). Playwright deferred post-v1.

## 11. Non-goals (v1)

Real-time collaboration/sharing · connecting to a live MySQL server · ALTER/migration diffs between versions · views, triggers, procedures, events, partitioning · non-MySQL dialects · snapshots/version history · minimap, marquee multi-select (post-v1 canvas upgrades) · optimized mobile/touch editing · i18n.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Parser library fidelity on exotic DDL | Swappable `parseDDL` interface; bake-off on corpus during planning; per-statement recovery so partial imports still land |
| Hand-rolled canvas: interaction edge cases in React port | Port the prototype's proven pointer model verbatim (capture, mode state machine, rAF); keep interactions imperative, commit-on-pointerup |
| Firestore 1 MB doc limit on huge schemas | 800 KB warning + JSON export escape hatch; metadata/content split keeps dashboard unaffected |
| Undo/redo correctness across derived state | Only schema+layout in temporal store; edges/badges always derived, never stored |
| Spark quota exhaustion | Debounced saves, metadata-only dashboard reads, offline persistence absorbing bursts |

## 13. Success criteria

1. Sign in (Google or email), create a workspace, and design a schema using **every** MySQL 8.0 column type and attribute from the catalog, composite PK/UK/indexes, FKs with ON DELETE/UPDATE — entirely on the canvas + inspector.
2. The 1:1 / 1:N / N:M tools mutate the schema like Workbench (FK columns, unique constraints, junction tables) and the edges/cardinality labels render correctly, self-references included.
3. Exported `.sql` executes cleanly on stock MySQL 8.0.
4. Importing Sakila and WordPress dumps yields correct tables/columns/indexes/FKs with a readable auto-layout; broken statements degrade gracefully.
5. Close the tab mid-edit, reopen on another machine: the workspace resumes from autosave.
6. Every mutation is undoable/redoable; destructive actions confirm.
7. Prototype-grade canvas feel: 60 fps drag/pan/zoom on a 50-table schema; hover-trace; light/dark.