# SAVA — System Design (v1)

- **Date:** 2026-07-09
- **Status:** Draft — pending Felipe's final review
- **Authors:** Felipe Carvalho + Claude (brainstorming session)

## 1. Purpose and context

SAVA (Sistema de Acompanhamento e Verificação Administrativa) supports the semi-annual administrative verification visits performed by a **regional administrative body**.

How the verification process works today:

- Each city is verified once per semester. Verification is usually a single-day event, but individual departments occasionally verify on separate dates within the same period.
- There are **21 departments** (Informática, Tesouraria, Secretaria, …). Each department sends one or more regional representatives, and the city has a local representative for that department who answers the questions.
- Checklists are answered in **SIGA** (existing external system, not integrated). SIGA produces a per-department PDF report containing: checklist items grouped in sections, each with severity ("criticidade"), a 4-level answer (`Sim` / `Sim, com ressalvas` / `Não` / `Não aplicável`), free-text considerations, a response summary (counts + percentages), and the names of local and verification responsibles.
- Some departments carry findings ("apontamentos"/pendências) from previous years; the team needs to know whether they were resolved and which new ones appeared.

**SAVA is not a second SIGA.** Checklists are answered in SIGA. SAVA tracks what requires follow-up action: findings, their reviews across subsequent visits, and indicators across all ~30 cities of the regional.

## 2. Goals and non-goals (v1)

### Goals

1. Register visits per city/period and each department's participation (representatives, own date when different, response summary counts, SIGA PDF attached).
2. Register **findings**: checklist items answered `Não` or `Sim, com ressalvas`, with severity, considerations, optional deadline and responsible.
3. **Carry-over review flow**: when registering a new visit, automatically list the unresolved findings (status `open`/`in_treatment`, §5) of that city+department so the team marks each as resolved / not resolved / partial, then registers new findings.
4. Role-based access with custom login (most users have no Google account in the convênio domain).
5. Indicators: open findings by city/department, overdue, high severity, old-vs-new per visit, resolution rate, recurrence by checklist item, finding age.
6. Work well on mobile (used in the field) and desktop.

### Non-goals (v1)

- Automatic data extraction from SIGA PDFs (v2 candidate; the model is designed so a parser can later create findings and summary counts without schema changes).
- Full mirroring of all checklist answers (~12k rows/semester of typing; SIGA already stores them).
- E-mail/SMS/notifications, offline support, SIGA API integration, multi-regional support.

## 3. Platform and architecture

**Google Apps Script (GAS) full-stack**, developed locally as a normal TypeScript project and deployed with `clasp`.

- **Backend:** TypeScript compiled to GAS. Exposed to the client through a **single RPC dispatcher** (`api(request)`) called via `google.script.run`.
- **Frontend:** React SPA (TypeScript), bundled by Vite into a **single self-contained HTML file** (GAS `HtmlService` requirement), served by `doGet()`.
- **Database:** one Google Spreadsheet per environment, one tab per table (see §5).
- **Files:** one Drive folder per environment for attached SIGA PDFs.
- **Dashboards:** Looker Studio reading the spreadsheet directly (rich charts, zero code) + summary cards inside the app.
- **Owner account:** the GAS project, spreadsheet and Drive folder live in an **institutional convênio-domain account** (not a personal account) for continuity and Workspace quotas.

### Why these choices (decision log)

| Decision | Reason |
|---|---|
| GAS full-stack (not external frontend + GAS API) | Zero cost, zero infra, one deploy target. The RPC envelope (§7) travels identically over `doPost`, so migrating the frontend out later is cheap. |
| Custom auth (not Google login) | Most users have no domain account and creating accounts for everyone is undesirable. |
| Envelope instead of REST semantics | `google.script.run` is a proprietary RPC bridge: no URLs, verbs, headers or status codes. Server exceptions reach the client as a message string only. GAS `doGet`/`doPost` cannot set HTTP status codes either, so REST is impossible on this platform in any scenario. |
| Findings-only + summary counts (not full checklist mirror) | A full mirror means ~20 items × 21 departments × 30 cities ≈ 12k rows/semester of manual typing and duplicates SIGA. The 4 summary counts give conformity percentages for a fraction of the effort. |
| One spreadsheet as DB | Scale is small (hundreds of findings/year). Sheets gives free storage, natural backup/export, and direct Looker Studio connectivity. |
| English code/tables/enums; pt-BR user-facing strings | Professional convention chosen by Felipe. UI strings centralized in a client strings module. Looker Studio display names can be renamed to pt-BR once. |

### Project structure

```
sava/
├── src/
│   ├── server/              # backend TypeScript → compiled to GAS
│   │   ├── main.ts          # doGet() serves the SPA; api() RPC dispatcher
│   │   ├── api/             # action handlers (auth.*, findings.*, ...)
│   │   ├── services/        # business rules (pure, unit-testable)
│   │   ├── repositories/    # the ONLY layer touching SpreadsheetApp/DriveApp
│   │   └── lib/             # password hashing, tokens, validation, locking
│   ├── client/              # React SPA
│   │   ├── screens/
│   │   ├── components/
│   │   ├── strings/         # ALL pt-BR user-facing text lives here
│   │   └── lib/gas.ts       # Promise wrapper over google.script.run (+ dev mock)
│   └── shared/              # types shared by client and server (envelope, DTOs, enums)
├── dist/                    # build output — what clasp pushes
├── knowledge/               # project documentation (this spec, briefs, samples)
├── appsscript.json          # GAS manifest (V8 runtime, timezone America/Sao_Paulo)
├── .clasp.dev.json / .clasp.prod.json
├── vite.config.ts
└── package.json
```

### Data flow

1. User opens the web app URL → `doGet()` returns the SPA as one HTML file (viewport meta tag added for mobile).
2. SPA calls `google.script.run.api({ token, action, payload })` through the Promise wrapper.
3. Dispatcher: validates session (except `auth.login`), checks role, routes to the action handler → service → repository → spreadsheet. Response returns as the envelope (§7).
4. All writes take a `LockService` script lock (wait up to 30 s) to prevent concurrent-write corruption.
5. Read-cost controls (each `api()` call = one `gasPorts()`): a **per-request memo** in the repo layer (`table()`) so `.all()`/`.byId()` on a tab read the sheet once and reuse within the request (invalidated on any write to that tab); a **cross-request `CacheService` cache** for the small stable tabs Cities/Departments (6 h TTL, cleared on write via the repo layer and the service-layer `invalidateCache`); **header validation runs only on the write path** (first `ports.lock()` acquisition per request), never on read-only requests — reads map by the sheet's live header row and self-correct, so only writes (positioned by `SHEET_COLUMNS` order) need the fail-closed guard. Client mirrors this: `cities.list`/`departments.list` are cached in memory (5 min TTL, cleared on session change and on `cities.save`/`departments.save`).

Known platform constraints accepted: ~0.5–1.5 s latency per RPC call (mitigated by loading data once and navigating in memory, caching, and explicit loading states); the app renders inside a Google iframe; the production URL is `script.google.com/macros/s/...`.

### Exposed globals (build constraint)

`google.script.run` can invoke **any** function in the script's global scope — the "single dispatcher" is a convention the build must enforce, not something the platform provides. The server build emits TWO files: **`server.js`** (single esbuild IIFE; nothing global except a `__sava` namespace object holding the implementations) and **`stubs.js`** (five plain-ES5 top-level declarations — `doGet`, `api`, `setup`, `purgeSessions`, `weeklyBackup` — each delegating to `__sava.*` at call time). The stubs file exists because the static analyzer behind the editor's run dropdown AND `google.script.run`'s client proxy is more conservative than the V8 runtime and can silently fail on the bundle's modern syntax (observed in the real dev environment: `.api is not a function`); a tiny ES5 file is always parseable, and call-time delegation makes file evaluation order irrelevant. `__sava` is an object, not a function, so it is not invocable via `google.script.run`; the five stubs remain the only callable surface. `setup()` and the trigger handlers are exposed only because the editor run-menu and installable triggers need them, and each starts with a hard guard: abort unless `Session.getActiveUser().getEmail()` matches the owner (requires the `userinfo.email` OAuth scope in the manifest) — anonymous web-app callers have an empty active user, while editor runs and installable triggers execute with the owner's identity. The dev smoke checklist asserts that calling an internal function and `setup` via `google.script.run` fails (§13).

## 4. Roles

| Role | Can |
|---|---|
| `admin` | Everything: manage users, cities, departments, checklist items; all of `regional`. |
| `regional` | Register visits, participation, findings, reviews; update finding status; see all cities. |
| `local` | Read-only, restricted to their own city (enforced server-side by the user's `cityId` on every query). |

## 5. Data model

One spreadsheet (`SAVA-DB-dev` / `SAVA-DB-prod`), one tab per table. Row 1 is the header; repositories map columns **by header name** (adding columns never breaks code). Conventions: IDs are UUID v4 generated server-side; dates are `YYYY-MM-DD` strings; timestamps are ISO 8601 UTC strings; booleans are `TRUE`/`FALSE`; enum values in English.

### `Cities`
| column | type | notes |
|---|---|---|
| id | uuid | |
| name | string | e.g. "Nova Odessa" |
| active | bool | deactivate without deleting history |

### `Departments`
| column | type | notes |
|---|---|---|
| id | uuid | |
| name | string | seeded with the 21 current departments |
| active | bool | |

Seed list: Anciães Verificação, Atividade Voluntária, Ativo Imobilizado, CNS, Compras, Conselho Fiscal, Contabilidade, Distribuidora, Engenharia, Fundo Musical, Informática, Jurídico, Jurídico LGPD, Manutenção Preventiva, Patrimônio Bens Imóveis, Piedade, Presidência, Saúde e Segurança, Secretaria, Tesouraria, Treinamento e Integração.

**Active-flag semantics (Cities, Departments, ChecklistItems):** inactive records are excluded from new visits, participation and new findings, but existing findings remain listable, reviewable and closable. The UI warns when deactivating a city/department that still has unresolved findings (allowed — a city may genuinely leave the regional).

### `ChecklistItems` (catalog, admin-maintained)
| column | type | notes |
|---|---|---|
| id | uuid | |
| departmentId | fk | |
| itemRef | string | e.g. `4.5` — recurrence key across visits |
| section | string | e.g. `ROTINAS` |
| text | string | the question |
| severity | enum | `high` \| `medium` \| `low` (SIGA "Criticidade") |
| active | bool | old items are deactivated, never deleted |

Populated by the admin via paste-import from SIGA (§8.6). `(departmentId, itemRef)` is unique among active items (service-enforced). Import is an **upsert by (departmentId, itemRef)**: the preview classifies rows as new / changed / unchanged / absent-from-paste, and absent rows become a deactivation *proposal* the admin explicitly confirms — a partial paste never silently deactivates the rest of the catalog. Findings keep a **snapshot** of `itemRef`/`section`/`text`/`severity`, so catalog updates never corrupt history.

### `Users`
| column | type | notes |
|---|---|---|
| id | uuid | |
| name | string | |
| login | string | unique, case-insensitive |
| role | enum | `admin` \| `regional` \| `local` |
| cityId | fk? | required iff role = `local` |
| passwordHash, salt, hashIterations | string/int | see §6 |
| mustChangePassword | bool | true on creation and after admin reset |
| failedAttempts, lockedUntil | int, timestamp? | login throttling |
| active | bool | |
| createdAt | timestamp | |

### `Sessions`
| column | type | notes |
|---|---|---|
| token | string | 2× UUID v4 concatenated (~244 bits) |
| userId | fk | |
| createdAt, expiresAt, lastSeenAt | timestamp | sliding 30-day expiry; `expiresAt` is rewritten at most once per day to avoid write amplification |

Expired rows are purged by a daily time-driven trigger.

### `Visits` — one row per city+period verification event
| column | type | notes |
|---|---|---|
| id | uuid | |
| cityId | fk | |
| period | string | SIGA "competência", format `MM/YYYY`, e.g. `10/2025` |
| mainDate | date | the main event day |
| notes | string | |
| createdAt, createdBy | audit | |

Unique constraint enforced in service: one visit per (cityId, period). The visit-creation UI asks for explicit confirmation (city + period highlighted) before the first save — most wrong-visit incidents die there. **Correction path:** admin-only `visits.delete` / `visitDepartments.delete` (§7) while nothing references the row; past that point, the accepted break-glass is the owner account editing the spreadsheet directly — remembering that `cityId`/`period` are denormalized onto `VisitDepartments` and `Findings`, and that status effects already applied by reviews must be corrected together.

### `VisitDepartments` — one row per department within a visit
| column | type | notes |
|---|---|---|
| id | uuid | |
| visitId | fk | |
| departmentId | fk | |
| cityId, period | denormalized | copied from the visit for filtering and Looker Studio |
| verificationDate | date? | only when different from the visit's mainDate |
| regionalReps | string | SIGA "Responsáveis Verificação" (free text, one or more names) |
| localReps | string | SIGA "Responsáveis Local" |
| countYes, countYesWithCaveats, countNo, countNotApplicable | int? | from the SIGA PDF "Resumo de Respostas"; optional at save time — the report is often not ready at the table. Fillable later: `visitDepartments.save` and `uploadPdf` remain callable after `markDone` |
| pdfFileId, pdfUrl | string? | SIGA PDF stored in Drive (§9) |
| completedAt, completedBy | audit? | set by `visitDepartments.markDone` when the field flow for this department finishes (§8.5) |
| notes | string | |
| createdAt, createdBy | audit | |

Unique: one row per (visitId, departmentId). To keep denormalized copies (here and on `Findings`) from going stale, `visits.save` rejects changes to `cityId`/`period` with `CONFLICT` once the visit has department rows.

### `Findings` — the core table
| column | type | notes |
|---|---|---|
| id | uuid | |
| code | string | short human-readable id shown in the UI (`A-0347`), sequential, generated at create under the script lock — UUIDs are unusable in meetings/e-mail |
| visitDepartmentId | fk | where it was found (origin) |
| visitId, cityId, departmentId, period | denormalized | for cheap filtering (`findings.list`) and Looker Studio |
| itemRef, section, itemText, severity | snapshot | copied from catalog or typed free-form |
| response | enum | `no` \| `yes_with_caveats` |
| considerations | string | SIGA "Ações Prevent./Corretivas ou Considerações" |
| status | enum | `open` \| `in_treatment` \| `resolved` \| `cancelled` |
| deadline | date? | |
| assignee | string? | free text in v1 |
| resolvedAt, resolvedBy | audit? | set when status becomes `resolved` |
| createdAt, createdBy, updatedAt, updatedBy | audit | |

**"Unresolved"** — the load-bearing term used by the review queue, dashboard cards and indicators — means `status ∈ {open, in_treatment}`. `resolved` and `cancelled` are terminal for queue purposes.

Allowed status transitions (each one audit-logged; a note is required on every manual transition):

| transition | trigger |
|---|---|
| `open → in_treatment` | review result `partial`, or manual |
| `open`/`in_treatment` `→ resolved` | review result `resolved`, or manual |
| `open`/`in_treatment` `→ cancelled` | manual only (regional/admin) |
| `resolved`/`cancelled` `→ open` | manual reopen (regional/admin) |
| `resolved → open` | system: this visit's review corrected to `not_resolved` (clears resolvedAt/By; no note required) |
| `resolved → in_treatment` | system: this visit's review corrected to `partial` (clears resolvedAt/By; no note required) |

`findings.updateStatus` performs the manual ones and rejects anything outside this table with `VALIDATION`.

### `FindingReviews` — re-verification and status history
| column | type | notes |
|---|---|---|
| id | uuid | |
| findingId | fk | |
| type | enum | `visit_review` \| `status_change` |
| visitId | fk? | required iff type = `visit_review` |
| result | enum? | `resolved` \| `not_resolved` \| `partial` — visit reviews only |
| newStatus | enum? | `status_change` entries only |
| notes | string? | optional when result = `resolved`; **required** for `partial`, `not_resolved` and every `status_change` (validated by the save actions) |
| createdAt, createdBy | audit | |

Effect of a **visit review** on the finding: `resolved` → status `resolved` (+ resolvedAt/By); `partial` → `in_treatment`; `not_resolved` → status unchanged (stays unresolved and reappears in the next visit's queue). One visit review per (findingId, visitId): `findingReviews.save` **upserts**, so re-entering the flow corrects the earlier answer instead of duplicating it — and the finding's status is **recomputed from the corrected result**: a finding wrongly marked `resolved` in this visit returns to `open`/`in_treatment` (system transitions in the table above, clearing resolvedAt/By). A **new** review (no existing row for this findingId+visitId) against a finding that is already `resolved`/`cancelled` is rejected with `CONFLICT`.

Manual transitions (`findings.updateStatus`, including cancel and reopen) are appended here as `status_change` rows with an empty `visitId` — the finding-detail timeline (§8.4) renders both kinds chronologically.

### `AuditLog` — append-only
| column | type |
|---|---|
| timestamp, userId, action, entity, entityId, detail | audit trail of logins and all mutations |

## 6. Authentication and authorization

**Deployment mode:** "Execute as: me (institutional account) / Who has access: anyone". The URL is public and shows only the SAVA login screen. The spreadsheet and Drive folder are **not shared with anyone**; the backend is the only path to data. Every action except `auth.login` requires a valid session token.

**Flow:**

1. Admin creates the user → the app generates a temporary password, shown once to the admin, who hands it to the user personally.
2. First login forces a password change — enforced **server-side**: while `mustChangePassword` is true, the dispatcher rejects every action except `auth.changePassword`, `auth.me` and `auth.logout` with `FORBIDDEN`. `auth.changePassword` always requires the current password (the temporary one counts during the forced first change). Password policy (validated identically on server and client): minimum 8 characters, at least one letter and one number.
3. Successful login → server issues a random token, stores it in `Sessions` (sliding 30-day expiry), returns it to the client → stored in `localStorage`, sent with every RPC call.
4. Every request: dispatcher validates token and role; for `local` users every query is filtered by their `cityId` **server-side**. Client-side checks are UX only, never security.
5. Forgotten password → admin resets (new temporary password). No e-mail/SMS infrastructure.

**Password storage:** PBKDF2-style iterated salted SHA-256 computed **in pure JS inside the V8 runtime** (small bundled implementation) — *not* via `Utilities.computeDigest`, whose per-call JS→Java bridge overhead (~0.1–1 ms) would cap a 0.3 s budget at a cryptographically trivial N ≈ 300–3,000. In-process JS reaches ~10⁵–10⁶ short-input hashes/s, so the same budget buys a six-figure iteration count. Per-user random salt; `N` stored per user (raisable later; the old N applies until the next password change). GAS has no native bcrypt/scrypt; this is the accepted practical equivalent at this scale — and the primary control remains that the hash store is unreachable without compromising the owner account.

**Throttling and enumeration resistance:** 5 consecutive failures → account locked 15 minutes (`lockedUntil`); failures and locks are audit-logged. `auth.login` returns **one generic invalid-credentials response for every failure cause** (unknown login, wrong password, locked account) and performs the same iterated-hash work in all cases — a fixed dummy salt/N for unknown logins, and no short-circuit before hashing for locked accounts — so neither the response nor its timing distinguishes them. The generic pt-BR message mentions that repeated failures require waiting 15 minutes. `users.resetPassword` clears `failedAttempts`/`lockedUntil`. Accepted limitation at this scale: someone who knows a login can DoS that account in 15-minute windows; mitigations: the first admin's login is not name-derived, any admin can unlock any user, and the break-glass for a locked/lost admin is the owner account editing the `Users` sheet directly.

**Session hygiene:** logout removes the row; expired sessions purged daily by trigger; a user's sessions are revoked on password change and on deactivation.

**LGPD by minimization:** the system stores only name and login of users. Field guidance: describe facts ("inventário desatualizado"), not people. No sensitive personal data.

**Accepted trade-offs (explicit):** token in `localStorage` (GAS iframe offers no HttpOnly cookies); transport is Google's HTTPS; the platform does not allow custom security headers. Appropriate for an internal administrative tool at this scale, with full audit trail — and far safer than the common alternative (a spreadsheet shared by link). Note on storage reliability: the SPA runs in a cross-site iframe (`*.googleusercontent.com` under `script.google.com`), and WebKit (Safari/iOS) partitions that storage and clears it when the browser quits — all `localStorage` access is wrapped in try/catch with an in-memory fallback, and Safari users may simply need to log in again per browser session (accepted).

## 7. API

Single exposed function:

```ts
api(request: { token?: string; action: string; payload?: unknown }): Envelope
```

**Envelope** (defined in `shared/`):

```ts
type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };

type ErrorCode =
  | 'UNAUTHORIZED'   // missing/invalid/expired token
  | 'FORBIDDEN'      // valid session, insufficient role/city
  | 'NOT_FOUND'
  | 'VALIDATION'     // details: field errors
  | 'CONFLICT'       // e.g. duplicate visit for (city, period)
  | 'INTERNAL';      // unexpected; logged with reference id
// note: locked accounts do NOT get a dedicated code — auth.login returns the
// same generic invalid-credentials failure for every cause (§6).
```

`message` is a safe, user-displayable pt-BR string. Unexpected exceptions are caught by the dispatcher, logged to `AuditLog` with a reference id, and returned as `INTERNAL`.

**Actions (v1):**

| Action | Role | Notes |
|---|---|---|
| `auth.login {login, password}` | public | → `{token, user, mustChangePassword}` |
| `auth.logout` / `auth.me` / `auth.changePassword {currentPassword, newPassword}` | any | changePassword verifies the current password (§6) |
| `cities.list` | any | `local` receives only their city |
| `cities.save {city}` | admin | create/update |
| `departments.list` / `departments.save` | any / admin | |
| `checklistItems.list {departmentId?}` | regional+ | `departmentId` optional for admin (full-catalog view/counts) |
| `checklistItems.save` / `checklistItems.importPaste {departmentId, tsv}` | admin | paste-import with preview |
| `users.list` / `users.save` / `users.resetPassword {userId}` | admin | create generates and returns a temporary password (shown once, §6) and sets `mustChangePassword`; reset returns a new temp password and clears `failedAttempts`/`lockedUntil` |
| `visits.list {cityId?, period?}` / `visits.get {id}` | any (city-scoped) | `get` includes visit departments |
| `visits.save {visit}` | regional+ | enforces (city, period) uniqueness; rejects city/period changes once departments exist (`CONFLICT`, §5) |
| `visits.delete {id}` / `visitDepartments.delete {id}` | admin | only while no `Findings` and no `FindingReviews` reference the row (`CONFLICT` otherwise, with a message pointing to the break-glass, §5); audit-logged |
| `visitDepartments.save {visitDepartment}` | regional+ | **upsert by (visitId, departmentId)** — opening a started department pre-fills the existing row; denormalizes cityId/period from the visit; still callable after `markDone` |
| `visitDepartments.markDone {id}` | regional+ | sets completedAt/By — a progress marker, **not a lock**: edits, reviews and new findings remain allowed afterwards |
| `visitDepartments.uploadPdf {id, fileName, base64}` | regional+ | ≤ 10 MB; stores in Drive, saves fileId/url |
| `visitDepartments.downloadPdf {visitDepartmentId}` | any (city-scoped) | returns the PDF as base64; the server resolves its own stored fileId — client-supplied Drive ids are never accepted, and raw fileIds are never returned to `local` users |
| `findings.list {filters, page?}` | any (city-scoped) | filters: city, department, status, period, severity, response, text, `overdue?` (deadline past + unresolved, computed server-side) |
| `findings.get {id}` | any (city-scoped) | includes reviews history |
| `findings.save {finding, force?}` | regional+ | create/update of descriptive fields; `status` is ignored on update and forced to `open` on create — status changes go only through `findings.updateStatus` or visit reviews. When an unresolved finding with the same (cityId, departmentId, itemRef) exists, rejects with `CONFLICT` (existing finding in `details`) unless `force: true` — the UI shows a confirm dialog (§8.5) |
| `findings.updateStatus {id, status, note}` | regional+ | manual transitions per the §5 table (note required; appended to FindingReviews as `status_change`) |
| `findings.reviewQueue {visitId, departmentId}` | regional+ | unresolved findings (status `open`/`in_treatment`) of the visit's city+department, **excluding** findings that originated in this visit, **plus** findings already reviewed in this visit regardless of current status (so corrections stay possible); each item carries its review-in-this-visit when one exists |
| `findingReviews.save {findingId, visitId, result, notes}` | regional+ | upsert per (findingId, visitId); applies/recomputes status effect (§5); `notes` required for `partial`/`not_resolved`; `CONFLICT` only for a *new* review of a resolved/cancelled finding (§5) |
| `dashboard.summary {cityId?}` | any (city-scoped) | counts backing the home cards, incl.: completed departments still missing PDF/summary counts; cities visited in the current semester (regional); latest visits with department progress (done/total); per-city semester resolution rate (`resolved` visit reviews ÷ all visit reviews of the city in the current semester) — the one positive metric `local` users get |

## 8. Screens (functional — visual design is a separate deliverable)

Visual design will be produced by Felipe with Claude Design from `knowledge/CLAUDE_DESIGN_BRIEF.md`; mockups will drive implementation. Functionally:

1. **Login** — login + password; forced password-change step on first access.
2. **Home dashboard** — role-aware summary cards: open findings by city and by department, overdue, high-severity open, completed departments missing PDF/summary, latest visits (tapping one reopens it, §8.5). `local` sees only their city.
3. **Findings list** — filters (city, department, status, period, severity, response) + text search; city locked for `local`.
4. **Finding detail** — all fields; a timeline of visit reviews **and** manual status changes (both come from `FindingReviews`, §5); the department PDF viewable in-app via `visitDepartments.downloadPdf`. Actions (regional+): edit, change status (note required), register a **visit review** (visit picker limited to the finding's city; §5 upsert/`CONFLICT` rules apply).
5. **Visit registration** (the field flow): create (with explicit city+period confirmation, §5) or **reopen** the existing visit for that city+period → pick department → participation data + summary counts + PDF upload (both deferrable — the SIGA report is often not ready on visit day) → **review queue** (`findings.reviewQueue`): each unresolved finding of that city+department marked `resolved`/`not_resolved`/`partial` (notes required except for `resolved`); on re-entry, items already reviewed in this visit show the previous answer pre-selected and editable → register new findings (catalog dropdown auto-fills section/severity; free-form fallback; duplicate-itemRef warning with confirm-to-proceed, §7 `findings.save`) → team marks the department done (`visitDepartments.markDone`). **Rule:** an item that already has an unresolved finding for this city+department is handled through the review queue, never re-registered. The visit screen shows each active department as **done** (completed — with a "missing PDF/summary" badge when counts or PDF are absent), **started** (row exists, not completed) or **not started**; a done department can be re-entered (markDone is not a lock). Every step saves to the server as it completes (participation, each review, each finding) — a dropped connection or dead battery costs at most the form currently on screen.
6. **Admin** — users (create/edit/deactivate/reset password), cities, departments, checklist-items catalog with paste-import (TSV: itemRef, section, text, severity → preview classifying new / changed / unchanged / absent-from-paste, absent items proposed for deactivation → confirm; §5).
7. **Indicators** — in-app summary cards; the Looker Studio dashboard link is visible to regional/admin only (§10).

## 9. Files (Drive)

Per environment, one root folder: `SAVA/{env}/pdfs/{YYYY-MM}/{city}/` — the period folder token uses `YYYY-MM` (e.g. `2025-10`) so Drive listings sort chronologically; `MM/YYYY` remains the stored/display format (§5). Uploaded PDF named `{department}.pdf`. The web app uploads via base64 through the RPC (≤ 10 MB guard); the repository stores `fileId` and `url` on `VisitDepartments`. Files stay private to the owner account — the app never shares them. In-app viewing/download goes through `visitDepartments.downloadPdf` (city-scoped, §7): the server resolves the **stored** fileId and returns the bytes as base64; client-supplied Drive ids are never accepted. The stored `url` is only a convenience for admins operating inside the owner account.

## 10. Indicators (Looker Studio + in-app)

Looker Studio connects to the prod spreadsheet (read-only, inside the owner account; the report is shared as view-only to whoever needs it — the report shares aggregated data, not the sheet):

- Open findings by city / by department / by severity
- Old vs. new findings per visit (via `FindingReviews` + origin `visitId`)
- Resolution rate between consecutive visits; finding age in semesters
- Recurrence by `itemRef` — defined as a **new** finding on an itemRef whose previous finding for that city+department was resolved/cancelled (chronic never-resolved items surface through finding age instead; §8.5 forbids re-registering unresolved items)
- Conformity %: `countYes / (countYes + countYesWithCaveats + countNo)` per city/department/period

In-app: `dashboard.summary` cards only (fast, city-scoped, respects `local` role — unlike the Looker report, which is regional-level and shared only with the regional team).

**Sharing constraint:** restricted (view-only) Looker sharing requires viewers to sign in with a Google account. The report is shared with the regional team's Google accounts (personal or convênio); team members without one can receive Looker's scheduled PDF snapshots by e-mail instead. Unlisted public links are rejected. The in-app cards remain the only indicator surface for `local` users.

## 11. Environments, deploy, backups

| | dev | prod |
|---|---|---|
| GAS project | SAVA-dev | SAVA-prod |
| Spreadsheet | SAVA-DB-dev | SAVA-DB-prod |
| Drive folder | SAVA/dev | SAVA/prod |

Spreadsheet/folder IDs live in **Script Properties** per project (never in code). `.clasp.dev.json`/`.clasp.prod.json` select the target; npm scripts:

```
npm run dev          # Vite dev server, google.script.run mocked with fixtures
npm run test         # vitest (services, pure logic)
npm run deploy:dev   # build server+client → dist/ → clasp push (dev project)
npm run deploy:prod  # build → push → clasp deploy -i <PROD_DEPLOYMENT_ID>
```

The prod deployment id is created **once** and pinned in the npm script — `clasp deploy -i` publishes a new version onto the same deployment, keeping the URL stable (a bare `clasp deploy` would create a new deployment with a new URL on every run). Rollback = repoint the deployment to the previous version. A `setup()` server function (run manually per environment; guarded against anonymous RPC calls, §3) creates/verifies all tabs and headers, seeds the 21 departments and the first admin user.

**Backups:** weekly time-driven trigger copies the spreadsheet (`DriveApp` file copy) into `SAVA/{env}/backups/`, keeping the last 8 copies. Restore = copy back / repoint Script Property.

Git from day one; GitHub remote optional (recommended). `dist/`, `node_modules/` ignored.

## 12. Error handling and concurrency

- Dispatcher wraps every action: validation errors → `VALIDATION` with field details; unexpected exceptions → logged (`AuditLog` + `console.error` → Cloud Logging) and returned as `INTERNAL` with reference id.
- Client: every RPC goes through one helper — handles loading state, maps error codes to pt-BR toasts, triggers logout on `UNAUTHORIZED`, retries idempotent reads once on transient failure.
- All writes: `LockService.getScriptLock().waitLock(30000)`; append-based tables (`FindingReviews`, `AuditLog`) are append-only by design; updates locate rows by id column at write time (never by cached row index).
- Repositories escape any string cell that starts with `=` by prefixing an apostrophe on every write — Sheets stores it as inert text and `getValues()` returns the literal unchanged. This closes spreadsheet formula injection (paste-import, free-text fields) at the single `SpreadsheetApp` choke point.
- The visit flow saves each completed step server-side immediately (§8.5); `localStorage` (try/catch + in-memory fallback, §6) only buffers the form currently on screen.

## 13. Testing

- **Services (business rules):** pure TypeScript, no GAS APIs; unit-tested with **vitest** locally against in-memory repository fakes. This covers the core: role/city filtering, status transitions, review effects, uniqueness rules, summary computations.
- **Repositories:** thin by design; covered by a manual smoke-test checklist against the dev environment with seeded data (login, create visit, full department flow, review queue, finding lifecycle, PDF upload **and download**, admin CRUD) plus negative RPC checks: calling an internal function and `setup` via `google.script.run` must fail (§3).
- **Gate for prod deploys:** vitest green + dev smoke checklist passed.

## 14. Future evolution (designed-for, not built)

1. **PDF extraction (v2):** parse SIGA PDFs to auto-create findings (`Não`/`Sim, com ressalvas` rows) and summary counts — same schema, no migration.
2. **External frontend (option B):** move the SPA to static hosting (PWA, own URL); the envelope travels over `doPost` unchanged.
3. **Assignee as user reference** when/if locals start treating findings in-app; notification digests; multi-regional.

## 15. Open items

- **Go/no-go before any build:** deploy a hello-world web app from the institutional account and confirm the "Anyone (even anonymous)" access option is available and reachable from a logged-out browser — Workspace domain policy can hide it. Fallback: ask the domain admin to allow external publishing for that account's OU.
- Institutional owner account to be confirmed/created by Felipe before first deploy.
- Confirm which regional-team members have Google accounts for Looker Studio restricted sharing (others receive scheduled PDF snapshots, §10).
- Looker Studio report is built manually after first real data exists (not code).
- Visual design mockups (Claude Design) gate the client implementation; server can be built first.
