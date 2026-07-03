# Sketchio — MySQL ER Workspace

Design MySQL 8.0 schemas visually — a MySQL Workbench-style EER canvas in the browser, with real DDL in and out.

## Features

- **Canvas editor**: pan/zoom world, draggable/resizable table cards, hover-tracing of related tables, curved relationship edges with cardinality labels (1/N), self-references, light/dark theme.
- **Full MySQL 8.0 fidelity**: every column type (numerics, strings, ENUM/SET with value editors, date/time with fractional seconds, JSON, spatial with SRID), UNSIGNED/ZEROFILL, AUTO_INCREMENT, literal/expression/CURRENT_TIMESTAMP defaults, ON UPDATE, generated columns (VIRTUAL/STORED), per-column charset/collation, comments.
- **Keys as first-class objects**: composite PRIMARY/UNIQUE/INDEX/FULLTEXT/SPATIAL with prefix lengths, DESC parts, invisible indexes; foreign keys with composite columns and ON DELETE/ON UPDATE actions.
- **Workbench-style tools**: 1:N and 1:1 draw FK columns + constraints into the child; N:M auto-creates a junction table with composite PK; logical (annotation-only) links.
- **Inspector**: Columns / Indexes / Foreign keys / Options tabs, live CREATE TABLE preview, schema lint panel.
- **SQL both ways**: deterministic `.sql` export (runs on stock MySQL 8.0); import real dumps with per-statement error recovery and auto-layout. JSON workspace export/import and PNG image export.
- **Workspaces**: Google / email sign-in, autosaving workspace list in Firestore (Spark plan — no server code), offline-tolerant, multi-session conflict banner, undo/redo everywhere.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Zustand + zundo · Firebase Auth + Firestore (client SDK only) · node-sql-parser · Vitest.

## Setup

1. `npm install`
2. Create a Firebase project (free Spark plan) at console.firebase.google.com:
   - **Authentication → Sign-in method**: enable **Google** and **Email/Password**.
   - **Firestore Database**: create (production mode), then paste the contents of `firestore.rules` into Rules and publish.
   - **Project settings → Your apps**: add a Web app, copy the config.
3. `cp .env.local.example .env.local` and fill in the four `NEXT_PUBLIC_FIREBASE_*` values.
4. `npm run dev` → http://localhost:3000

## Deploy (Vercel)

Import the repo in Vercel (zero config), add the four `NEXT_PUBLIC_FIREBASE_*` env vars, deploy, then add your `*.vercel.app` domain to **Firebase Auth → Settings → Authorized domains**.

## Development

- `npm test` — unit suite (schema ops, DDL generator golden files, parser corpus incl. Sakila, round-trip semantic equality, layout, store, components).
- `npm run lint` / `npm run build`.
- Design docs: `docs/superpowers/specs/`, implementation plan: `docs/superpowers/plans/`.
