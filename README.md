# SAVA — Sistema de Acompanhamento e Verificação Administrativa

Internal web app for a **regional administrative body** to register semi-annual administrative verification visits and track their findings ("apontamentos") across ~30 cities — which items were flagged, who is treating them, and whether they were resolved by the next visit.

Checklists themselves are answered in **SIGA** (existing external system, which generates per-department PDF reports). SAVA complements it: findings that need action, re-verification history, and indicators. It is not a second SIGA.

## Stack

| Layer | Choice |
|---|---|
| Platform | Google Apps Script (free via Google Workspace convênio) |
| Backend | TypeScript → GAS, single RPC dispatcher over `google.script.run` |
| Frontend | React + TypeScript, bundled by Vite into a single HTML (HtmlService) |
| Database | Google Sheets (one spreadsheet per environment) |
| Files | Google Drive (SIGA PDFs) |
| Dashboards | Looker Studio + in-app summary cards |
| Tooling | clasp (deploys), vitest (unit tests) |

Full design document: [`knowledge/2026-07-09_SAVA_DESIGN.md`](knowledge/2026-07-09_SAVA_DESIGN.md).

## Project layout

```
src/
  server/        # backend (api dispatcher, services, repositories, lib)
  client/        # React SPA (screens, components, strings pt-BR, gas wrapper)
  shared/        # types shared by both sides (envelope, DTOs, enums)
knowledge/       # design docs, briefs, SIGA samples
dist/            # build output pushed by clasp
```

## Development

Prerequisites: Node 20+, `npm i`.

### One-time environment bootstrap (dev and prod, done twice)

`dev` and `prod` are fully separate: own GAS project, own spreadsheet, own Drive folder tree. Nothing
is shared, nothing is hardcoded — every id lives in that project's Script Properties.

1. **Create the GAS project.** Go to [script.new](https://script.new) (signed in with the institutional
   account), rename it `SAVA-dev` (or `SAVA-prod`). Copy its **script ID** (Project Settings → IDs, or
   from the URL).
2. **Create the spreadsheet and Drive folders.** Create a Google Sheet (`SAVA-DB-dev` / `SAVA-DB-prod`)
   — `setup()` (step 6) creates the tabs inside it, you just need the file to exist. Create a Drive
   folder `SAVA/dev/` (or `SAVA/prod/`) with one subfolder inside it: `backups/` (weekly spreadsheet
   copies land here). The app automatically creates the `pdfs/` folder and subdirectories
   (`pdfs/{competência}/{cidade}/`) for uploaded PDFs under the env root. Copy the file/folder ids
   from their URLs.
3. **Set Script Properties.** In the GAS project (Project Settings → Script Properties), add:

   | Property | Value |
   |---|---|
   | `SPREADSHEET_ID` | id of the `SAVA-DB-{env}` spreadsheet from step 2 |
   | `PDF_FOLDER_ID` | id of the `SAVA/{env}` env root folder from step 2 (app creates `pdfs/` tree under it) |
   | `BACKUP_FOLDER_ID` | id of the `SAVA/{env}/backups` subfolder from step 2 |
   | `ENV` | `dev` or `prod` |

4. **`npx clasp login`** once, with the institutional account (shared across both environments).
5. **Point clasp at this project.** Copy `.clasp.dev.json.example` → `.clasp.dev.json` (and
   `.clasp.prod.json.example` → `.clasp.prod.json` for prod), paste the script ID from step 1 into
   `scriptId`. Both files are gitignored — they're per-checkout, not shared.
6. **Push and run `setup()` once.** `npm run deploy:dev` (or `deploy:prod`) builds and pushes the code.
   Open the project in the Apps Script editor, select `setup` in the function dropdown, click **Run**.
   This creates/verifies all 10 tabs and their headers, seeds the 21 departments, and — only the first
   time (`Users` tab empty) — creates the first admin user (`login: sava.admin`) and installs the two
   time-driven triggers (`purgeSessions` daily, `weeklyBackup` weekly). The admin's temporary password
   is printed **once**, to the execution log (`Logger.log`) — copy it, it's never shown again.
7. **Prod only — pin a deployment id.** `deploy:prod` publishes onto a fixed deployment so the web app
   URL never changes across releases (a bare `clasp deploy` would mint a new URL every time). Create it
   once: `npx clasp deploy` (with `.clasp.prod.json` active), then copy the deployment id it prints and
   set it as the `PROD_DEPLOYMENT_ID` environment variable wherever `npm run deploy:prod` runs (shell
   profile, CI secret, etc.) — from then on `deploy:prod` reuses that same deployment id.

Full manual verification checklist for a freshly bootstrapped dev environment:
[`knowledge/SMOKE_TEST.md`](knowledge/SMOKE_TEST.md) — run it after every `deploy:dev`, before
promoting to prod.

```
npm run dev          # local dev server, backend mocked with fixtures
npm run test         # unit tests (services)
npm run deploy:dev   # build + push to the dev Apps Script project
npm run deploy:prod  # build + push + publish new version (stable prod URL, needs PROD_DEPLOYMENT_ID)
```

### Client development

`npm run dev` starts a Vite dev server (`src/client/`) with `google.script.run` replaced by an
in-memory mock (`src/client/lib/mock/server.ts` + `lib/mock/fixtures.ts`) — no GAS project, no
spreadsheet, no network calls. The mock re-implements the same action surface, role gates, and
error messages as the real server (`src/server/services/*.ts`), so a screen built against it
behaves like the real backend; it's reset to the seed fixtures on every full page reload (state
lives only in memory for the life of the tab).

Seeded users (all logins/passwords are dev-only, never valid against a real deployment):

| Login | Password | Role | Notes |
|---|---|---|---|
| `sava.admin` | `Sava1234` | admin | full access, incl. Cadastros (admin console) |
| `jose` | `Senha123` | regional | registers visits/findings, sees all cities |
| `maria` | `Senha123` | local (Sumaré) | `mustChangePassword: true` — first login forces a password change |

Open `http://localhost:5173`, log in with any of the above. Because the mock mirrors server
semantics (validation messages, CONFLICT/FORBIDDEN/UNAUTHORIZED codes, city-scoping for `local`,
duplicate-finding detection, review upsert-by-visit, etc. — see the mock file's header comment for
the full list), the manual checks in
[`knowledge/SMOKE_TEST.md`](knowledge/SMOKE_TEST.md) §2–§6 can be exercised through the UI here
instead of the raw RPC console calls that document describes (see its §8 for the mapping).

## Status

Server + client implemented (Plans 1-2). Pending: real-environment smoke
([`knowledge/SMOKE_TEST.md`](knowledge/SMOKE_TEST.md)), Looker report, deploy.
