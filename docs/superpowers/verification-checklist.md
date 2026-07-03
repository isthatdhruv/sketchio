# Verification — 2026-07-03

## Automated gates (all PASS)

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` | 25 files, 97 tests passing |
| `npm run build` | compiles; routes `/`, `/login`, `/register`, `/reset`, `/dashboard`, `/w/[id]` |
| Round-trip property | model → generateScript → parseDDL → semantically equal (`roundtrip.test.ts`) |
| Parser corpus | edge-case fixture full-fidelity; Sakila 16/16 tables, 0 errors |

## SQL-on-real-MySQL smoke (PASS, mysql:8.0 via Docker)

- **Rich export** (every attribute class: enum/set defaults, fsp timestamps + ON UPDATE, spatial + SRID + SPATIAL KEY, generated STORED column, expression defaults, invisible DESC prefix index, composite-PK junction from N:M, self-referencing FK, charset/collation/comment/AUTO_INCREMENT options): executed with **zero errors**; `orders`, `users`, `users_orders` created.
- **Sakila re-export** (fixture → parseDDL → generateScript → mysql): **16/16 tables created**; `SHOW CREATE TABLE film` mirrors the source schema.
- Found & fixed during this pass: table-level charset override no longer inherits the workspace-default collation (invalid charset/collation pairs).

## Manual checklist — requires a configured Firebase project + browser

Not executable headlessly in this environment (no `.env.local` / real Firebase). Run after setup:

- [ ] Google login, email register + login, password reset mail, sign-out, auth-gate redirects
- [ ] Dashboard: create / rename / duplicate / delete; table counts and timestamps update
- [ ] Canvas: pan/zoom/fit/tidy, drag/resize, hover trace, inline renames, column quick menu
- [ ] Tools: 1:N, 1:1, N:M (junction correct), logical link, self-reference 1:N
- [ ] Inspector: all four tabs persist edits; enum editor; generated column; SRID; invisible index; composite PK; FK pair editor
- [ ] SQL: preview matches export; import Sakila fixture → 16 tables with readable layout; broken file → partial import + issue list
- [ ] IO: JSON export/import round-trip; PNG export
- [ ] Persistence: autosave indicator cycle; offline edit syncs on reconnect; second-tab conflict banner (Reload / Keep mine); 800 KB size warning
- [ ] History: undo/redo across all mutation classes incl. link tools and imports; viewport changes skip history
- [ ] Theme toggle persists; system default respected
