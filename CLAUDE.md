# SAVA — Sistema de Acompanhamento e Verificação Administrativa

Internal web app for a regional administrative body to track findings ("apontamentos") from semi-annual administrative verification visits across ~30 cities. Checklists are answered in SIGA (external system); SAVA tracks what needs follow-up action.

**Read `knowledge/2026-07-09_SAVA_DESIGN.md` before making design or architecture decisions — it is the source of truth for this project.**

## Language conventions

- **Respond to the user (Felipe) in Brazilian Portuguese.**
- Code, sheet/tab names, column headers, enum values, commit messages: **English**.
- All user-facing UI strings: **pt-BR**, centralized in `src/client/strings/` — never hardcode UI text in components.

## Architecture (summary)

- Google Apps Script full-stack. Backend TypeScript compiled to GAS; frontend React SPA bundled by Vite into a single HTML file served by `doGet()`.
- Client↔server via a single RPC dispatcher `api({token, action, payload})` over `google.script.run`. Every response uses the envelope `{ok: true, data} | {ok: false, error: {code, message}}` — there is no HTTP/REST semantics on this platform (no status codes, no headers).
- Database: one Google Spreadsheet per environment (tabs: Cities, Departments, ChecklistItems, Users, Sessions, Visits, VisitDepartments, Findings, FindingReviews, AuditLog). PDFs in Drive.
- Custom auth (most users have no Google account): session token in localStorage, validated server-side on every action; `local` role is filtered by their cityId **server-side, always**.

## Hard rules

- Only `src/server/repositories/` may touch `SpreadsheetApp`/`DriveApp` — plus `src/server/gas/` (the composition root: `wiring.ts` opens the spreadsheet, `main.ts` handles backup/triggers). Pure logic that tests import lives apart from GAS-typed files (see `runtime.ts` vs `wiring.ts` split). Services stay pure (unit-testable with vitest).
- Every write goes through `LockService` script lock. Header validation (schema-drift guard) runs inside that lock, so it protects writes without slowing reads. Read cost is controlled by a per-request memo in `table()` + a cross-request `CacheService` cache for Cities/Departments (cleared on write); the client caches `cities.list`/`departments.list` (cleared on session change and master-data save).
- The server build emits `server.js` (IIFE; implementations under the `__sava` namespace only) + `stubs.js` (five plain-ES5 delegating declarations: doGet/api/setup/purgeSessions/weeklyBackup — the ONLY invocable surface; the GAS function-registry scanner chokes on bundled modern syntax, so never put the invocable names inside the bundle). The bundle targets **es2019, not es2020**: the scanner fails to parse `?.`/`??` and then registers zero functions for the whole project (`google.script.run.api is not a function` in the deployed app), even though the V8 runtime executes it fine. `setup()`/trigger handlers are guarded (abort for anonymous callers).
- Repositories prefix an apostrophe to any string cell starting with `=` (spreadsheet formula injection guard).
- Repositories map columns by header name, never by index. Update rows located by id at write time.
- Never log or return password hashes, salts, or session tokens (except the token to its own user at login).
- Two environments (dev/prod): separate GAS projects, spreadsheets, Drive folders. IDs live in Script Properties, never in code.

## Commands

```
npm run dev          # Vite dev server with google.script.run mocked
npm run test         # vitest (services)
npm run deploy:dev   # build + clasp push to dev project
npm run deploy:prod  # build + push + new version on prod deployment
```

## Development workflow

- **Git flow:** work on a feature branch and open a **pull request targeting `master`** (the default branch). Never commit directly to `master`.
- **Pending work becomes GitHub issues:** when finishing a task that leaves unresolved or deferred items — follow-ups, tech-debt, deferred fixes, open product decisions — file each as a GitHub issue on `frkey/sava` (`gh issue create`), don't leave them only in notes or code comments.

## Status

Server + client implemented (Plans 1-2), pushed to `github.com/frkey/sava` and deployed to the **dev** GAS environment. Remaining work is tracked as GitHub issues — notably the real-environment smoke test (`knowledge/SMOKE_TEST.md`), the Looker Studio report, and the prod bootstrap + deploy.
