# SAVA v1 — Plan 1: Foundation & Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete SAVA backend (Google Apps Script) with local tooling, shared types, tested services, RPC dispatcher, and deployable entrypoints — everything the React client (Plan 2) will consume.

**Architecture:** TypeScript monorepo compiled two ways: server → single IIFE bundle via esbuild (only `doGet`/`api`/`setup`/trigger handlers global), client (Plan 2) → single HTML via Vite. Services are pure functions over injected ports (repos, clock, uuid, lock, files) — fully unit-testable with vitest; only `src/server/repositories/` + `src/server/gas/` touch GAS APIs. Data = one Google Spreadsheet per env, columns mapped by header name.

**Tech Stack:** TypeScript 5, esbuild, Vite + React (scaffolded now, built in Plan 2), vitest, @google/clasp, Google Apps Script V8.

**Source of truth:** `knowledge/2026-07-09_SAVA_DESIGN.md` (spec). Design: `knowledge/mockups/DESIGN_REFERENCE.md`. Read both before starting any task.

## Global Constraints

- Code, sheet/tab names, column headers, enum values, commit messages: **English**. User-displayable `error.message` strings: **pt-BR**.
- Only `src/server/repositories/` and `src/server/gas/` may reference `SpreadsheetApp`/`DriveApp`/`Utilities`/`Session`/`LockService`/`CacheService`/`PropertiesService`. Services import ONLY from `shared/`, `server/lib/`, `server/services/`.
- Every write path runs inside `ports.lock(fn)` (script lock, 30 s wait).
- Repositories map columns **by header name**, never index; rows located by `id` at write time.
- Repositories prefix `'` to any string cell starting with `=` (formula-injection guard).
- Never log or return `passwordHash`, `salt`, or session tokens (except the token to its own user at login).
- Spreadsheet/Drive ids come from Script Properties (`SPREADSHEET_ID`, `PDF_FOLDER_ID`, `BACKUP_FOLDER_ID`, `ENV`) — never hardcoded.
- Dates: `YYYY-MM-DD` strings. Timestamps: ISO 8601 UTC strings. Booleans in sheets: `TRUE`/`FALSE`. Period: `MM/YYYY`.
- Node ≥ 20. Run `npm run test` before every commit; all tests green.
- "Unresolved" finding ≡ `status ∈ {open, in_treatment}` — everywhere.

## File Structure (locked by this plan)

```
src/
  shared/types.ts          # enums, DTOs, Envelope, ErrorCode, ApiRequest (Task 2)
  shared/actions.ts        # action name → payload/result typing map (Task 2)
  server/lib/errors.ts     # AppError, envelope builders (Task 3)
  server/lib/validate.ts   # field validators, period/date utils (Task 3)
  server/lib/crypto.ts     # pure-JS SHA-256, iterated hashing, password policy (Task 4)
  server/services/ports.ts # Table<T>, Repos, Ports, Ctx interfaces (Task 5)
  server/services/auth.ts        # (Task 7)
  server/services/masterdata.ts  # cities, departments, checklistItems, users (Task 9)
  server/services/visits.ts      # visits + visitDepartments (Task 10)
  server/services/findings.ts    # findings save/list/get/updateStatus (Task 11)
  server/services/reviews.ts     # reviewQueue + findingReviews.save (Task 12)
  server/services/dashboard.ts   # dashboard.summary (Task 13)
  server/services/pdfs.ts        # upload/download guards (Task 14)
  server/api/dispatcher.ts # route table, auth/role gates, audit, error wrap (Task 8)
  server/repositories/mapping.ts # pure row<->object mapping + escape (Task 6)
  server/repositories/sheets.ts  # GAS SpreadsheetApp impl of Table<T> (Task 6)
  server/repositories/files.ts   # GAS DriveApp impl of FilesPort (Task 14)
  server/gas/main.ts       # doGet/api/setup/triggers globals + guard (Task 15)
  server/gas/runtime.ts    # GAS Ports wiring (lock, uuid, cache, props) (Task 15)
  client/                  # scaffolded in Task 1, implemented in Plan 2
test/fakes.ts              # in-memory Repos + Ports fakes (Task 5)
test/*.test.ts             # vitest suites (per task)
scripts/build-server.mjs   # esbuild bundle (Task 1)
knowledge/SMOKE_TEST.md    # dev-environment checklist (Task 16)
```

Naming note: sheet tabs are PascalCase (`Cities`, `VisitDepartments`); columns camelCase exactly as the DTO fields.

---

### Task 1: Project scaffold & build pipeline

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.server.json`, `vitest.config.ts`, `vite.config.ts`, `scripts/build-server.mjs`, `appsscript.json`, `.clasp.dev.json.example`, `.clasp.prod.json.example`, `src/server/gas/main.ts` (stub), `src/client/index.html` (stub), `src/client/main.tsx` (stub)
- Modify: `.gitignore`

**Interfaces:**
- Produces: npm scripts `test`, `build`, `build:server`, `build:client`, `deploy:dev`, `deploy:prod`; dist layout `dist/appsscript.json` + `dist/server.js` + `dist/index.html`.

- [ ] **Step 1: package.json + configs**

```json
{
  "name": "sava",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "vite",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.server.json --noEmit",
    "build:server": "node scripts/build-server.mjs",
    "build:client": "vite build",
    "build": "npm run typecheck && npm run build:server && npm run build:client && cp appsscript.json dist/",
    "deploy:dev": "npm run build && cp .clasp.dev.json .clasp.json && clasp push -f",
    "deploy:prod": "npm run build && cp .clasp.prod.json .clasp.json && clasp push -f && clasp deploy -i \"$PROD_DEPLOYMENT_ID\""
  },
  "devDependencies": {
    "@google/clasp": "^3.0.0",
    "@types/google-apps-script": "^1.0.83",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vite-plugin-singlefile": "^2.0.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

`tsconfig.json` (client + shared + tests):

```json
{
  "compilerOptions": {
    "target": "ES2020", "module": "ESNext", "moduleResolution": "bundler",
    "jsx": "react-jsx", "strict": true, "noUncheckedIndexedAccess": true,
    "skipLibCheck": true, "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/client", "src/shared", "test"]
}
```

`tsconfig.server.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true,
    "noEmit": true, "types": ["google-apps-script"]
  },
  "include": ["src/server", "src/shared"]
}
```

`scripts/build-server.mjs`:

```js
import { build } from 'esbuild';
await build({
  entryPoints: ['src/server/gas/main.ts'],
  bundle: true,
  format: 'iife',            // nothing leaks to global scope except what main.ts assigns
  target: 'es2020',
  outfile: 'dist/server.js',
  logLevel: 'info',
});
```

`appsscript.json`:

```json
{
  "timeZone": "America/Sao_Paulo",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": { "access": "ANYONE_ANONYMOUS", "executeAs": "USER_DEPLOYING" },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.scriptapp"
  ]
}
```

`vite.config.ts` (client built in Plan 2 but pipeline works now):

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src/client',
  plugins: [react(), viteSingleFile()],
  build: { outDir: '../../dist', emptyOutDir: false },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

Stub `src/server/gas/main.ts` (replaced in Task 15):

```ts
function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutput('SAVA — em construção');
}
(globalThis as Record<string, unknown>).doGet = doGet;
```

Stub `src/client/index.html`:

```html
<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SAVA</title></head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>
```

Stub `src/client/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')!).render(<p>SAVA</p>);
```

`.clasp.dev.json.example` (copy to `.clasp.dev.json` with the real scriptId; same for prod):

```json
{ "scriptId": "PASTE_DEV_SCRIPT_ID", "rootDir": "./dist" }
```

Append to `.gitignore`:

```
.clasp.json
.clasp.dev.json
.clasp.prod.json
```

- [ ] **Step 2: Install and verify**

Run: `npm install && npm run typecheck && npm run build`
Expected: typecheck clean; `dist/server.js` (IIFE containing doGet), `dist/index.html`, `dist/appsscript.json` all exist.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Scaffold build pipeline: esbuild server bundle, Vite client, clasp deploy scripts"
```

---

### Task 2: Shared types & action map

**Files:**
- Create: `src/shared/types.ts`, `src/shared/actions.ts`
- Test: `test/types.test.ts` (compile-level smoke)

**Interfaces:**
- Produces (consumed by every later task — copy signatures exactly):

- [ ] **Step 1: Write `src/shared/types.ts`**

```ts
export type Role = 'admin' | 'regional' | 'local';
export type FindingStatus = 'open' | 'in_treatment' | 'resolved' | 'cancelled';
export type FindingResponse = 'no' | 'yes_with_caveats';
export type Severity = 'high' | 'medium' | 'low';
export type ReviewResult = 'resolved' | 'not_resolved' | 'partial';
export type ReviewType = 'visit_review' | 'status_change';
export const UNRESOLVED: readonly FindingStatus[] = ['open', 'in_treatment'];

export type ErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'INTERNAL';

export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };

export interface ApiRequest { token?: string; action: string; payload?: unknown }

export interface City { id: string; name: string; active: boolean }
export interface Department { id: string; name: string; active: boolean }
export interface ChecklistItem {
  id: string; departmentId: string; itemRef: string; section: string;
  text: string; severity: Severity; active: boolean;
}
export interface SessionUser {
  id: string; name: string; login: string; role: Role; cityId?: string;
  mustChangePassword: boolean;
}
export interface Visit {
  id: string; cityId: string; period: string; mainDate: string; notes?: string;
  createdAt: string; createdBy: string;
}
export interface VisitDepartment {
  id: string; visitId: string; departmentId: string; cityId: string; period: string;
  verificationDate?: string; regionalReps?: string; localReps?: string;
  countYes?: number; countYesWithCaveats?: number; countNo?: number; countNotApplicable?: number;
  pdfFileId?: string; pdfUrl?: string;
  completedAt?: string; completedBy?: string; notes?: string;
  createdAt: string; createdBy: string;
}
export interface Finding {
  id: string; code: string; visitDepartmentId: string;
  visitId: string; cityId: string; departmentId: string; period: string;
  itemRef?: string; section?: string; itemText: string; severity: Severity;
  response: FindingResponse; considerations?: string;
  status: FindingStatus; deadline?: string; assignee?: string;
  resolvedAt?: string; resolvedBy?: string;
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
}
export interface FindingReview {
  id: string; findingId: string; type: ReviewType; visitId?: string;
  result?: ReviewResult; newStatus?: FindingStatus; notes?: string;
  createdAt: string; createdBy: string;
}
export interface FindingFilters {
  cityId?: string; departmentId?: string; status?: FindingStatus; period?: string;
  severity?: Severity; response?: FindingResponse; text?: string; overdue?: boolean;
}
export interface ReviewQueueItem { finding: Finding; existingReview?: FindingReview }
export interface VisitProgress { visit: Visit; cityName: string; done: number; total: number; missingPdfOrCounts: number }
export interface DashboardSummary {
  openByCity: { cityId: string; cityName: string; open: number; overdue: number }[];
  openByDepartment: { departmentId: string; departmentName: string; open: number }[];
  overdue: number; highSeverityOpen: number; completedMissingPdfOrCounts: number;
  citiesVisitedInSemester: { visited: number; total: number };
  latestVisits: VisitProgress[];
  resolutionRateSemester?: number; // 0..1, per-city when cityId given
}
export interface LoginResult { token: string; user: SessionUser }
```

- [ ] **Step 2: Write `src/shared/actions.ts`** — the single registry both dispatcher and client wrapper key on:

```ts
import type {
  City, Department, ChecklistItem, SessionUser, Visit, VisitDepartment,
  Finding, FindingReview, FindingFilters, ReviewQueueItem, DashboardSummary,
  LoginResult, ReviewResult, FindingStatus,
} from './types';

export interface ImportPreviewRow {
  itemRef: string; section: string; text: string; severity: string;
  kind: 'new' | 'changed' | 'unchanged' | 'invalid';
}
export interface ImportPreview {
  rows: ImportPreviewRow[];
  absent: ChecklistItem[]; // active items not in the paste — deactivation proposal
}

/** payload/result typing per action — dispatcher and client both derive from this */
export interface Actions {
  'auth.login': { p: { login: string; password: string }; r: LoginResult };
  'auth.logout': { p: void; r: void };
  'auth.me': { p: void; r: SessionUser };
  'auth.changePassword': { p: { currentPassword: string; newPassword: string }; r: void };
  'cities.list': { p: void; r: City[] };
  'cities.save': { p: { city: Partial<City> & { name: string } }; r: City };
  'departments.list': { p: void; r: Department[] };
  'departments.save': { p: { department: Partial<Department> & { name: string } }; r: Department };
  'checklistItems.list': { p: { departmentId?: string }; r: ChecklistItem[] };
  'checklistItems.save': { p: { item: Partial<ChecklistItem> }; r: ChecklistItem };
  'checklistItems.importPaste': {
    p: { departmentId: string; tsv: string; apply?: boolean; deactivateAbsent?: string[] };
    r: ImportPreview;
  };
  'users.list': { p: void; r: (SessionUser & { active: boolean })[] };
  'users.save': { p: { user: Partial<SessionUser> & { name: string; login: string; active?: boolean } }; r: { user: SessionUser; tempPassword?: string } };
  'users.resetPassword': { p: { userId: string }; r: { tempPassword: string } };
  'visits.list': { p: { cityId?: string; period?: string }; r: Visit[] };
  'visits.get': { p: { id: string }; r: { visit: Visit; departments: VisitDepartment[] } };
  'visits.save': { p: { visit: Partial<Visit> & { cityId: string; period: string; mainDate: string } }; r: Visit };
  'visits.delete': { p: { id: string }; r: void };
  'visitDepartments.save': { p: { visitDepartment: Partial<VisitDepartment> & { visitId: string; departmentId: string } }; r: VisitDepartment };
  'visitDepartments.markDone': { p: { id: string }; r: VisitDepartment };
  'visitDepartments.delete': { p: { id: string }; r: void };
  'visitDepartments.uploadPdf': { p: { id: string; fileName: string; base64: string }; r: VisitDepartment };
  'visitDepartments.downloadPdf': { p: { visitDepartmentId: string }; r: { fileName: string; base64: string } };
  'findings.list': { p: { filters?: FindingFilters }; r: Finding[] };
  'findings.get': { p: { id: string }; r: { finding: Finding; reviews: FindingReview[] } };
  'findings.save': { p: { finding: Partial<Finding> & { itemText: string }; force?: boolean }; r: Finding };
  'findings.updateStatus': { p: { id: string; status: FindingStatus; note: string }; r: Finding };
  'findings.reviewQueue': { p: { visitId: string; departmentId: string }; r: ReviewQueueItem[] };
  'findingReviews.save': { p: { findingId: string; visitId: string; result: ReviewResult; notes?: string }; r: FindingReview };
  'dashboard.summary': { p: { cityId?: string }; r: DashboardSummary };
}
export type ActionName = keyof Actions;
```

- [ ] **Step 3: Compile smoke test** — `test/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { UNRESOLVED } from '../src/shared/types';
describe('shared types', () => {
  it('unresolved statuses are open and in_treatment', () => {
    expect(UNRESOLVED).toEqual(['open', 'in_treatment']);
  });
});
```

Run: `npm run test` → PASS; `npm run typecheck` → clean.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "Add shared types and typed action registry"`

---

### Task 3: Server lib — errors, validation, period utils

**Files:**
- Create: `src/server/lib/errors.ts`, `src/server/lib/validate.ts`
- Test: `test/validate.test.ts`

**Interfaces:**
- Produces: `class AppError extends Error { code: ErrorCode; details?: unknown }`, `fail(code, message, details?): never`, `ok<T>(data): Envelope<T>`, `toEnvelope(fn): Envelope<T>`; validators `requireString(v, field, {min?, max?}): string`, `optionalString`, `requireEnum<T>(v, field, allowed): T`, `isValidDate(s): boolean`, `isValidPeriod(s): boolean` (MM/YYYY), `periodFolderToken('10/2025') === '2025-10'`, `semesterOf('10/2025') === '2025-2'`, `currentPeriodSemester(now: Date): string` (e.g. `2026-1`), `isOverdue(finding, todayIso): boolean`.

- [ ] **Step 1: Failing tests** — `test/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isValidPeriod, periodFolderToken, semesterOf, currentPeriodSemester, isOverdue,
} from '../src/server/lib/validate';

describe('period utils', () => {
  it('validates MM/YYYY', () => {
    expect(isValidPeriod('10/2025')).toBe(true);
    expect(isValidPeriod('04/2026')).toBe(true);
    expect(isValidPeriod('13/2025')).toBe(false);
    expect(isValidPeriod('2025-10')).toBe(false);
    expect(isValidPeriod('4/2026')).toBe(false);
  });
  it('folder token sorts chronologically', () => {
    expect(periodFolderToken('10/2025')).toBe('2025-10');
  });
  it('semester mapping', () => {
    expect(semesterOf('04/2026')).toBe('2026-1');
    expect(semesterOf('10/2025')).toBe('2025-2');
    expect(currentPeriodSemester(new Date('2026-07-09T12:00:00Z'))).toBe('2026-2');
  });
});

describe('isOverdue', () => {
  const base = { status: 'open', deadline: '2026-07-01' } as never;
  it('true when unresolved past deadline', () => {
    expect(isOverdue({ ...base as object, status: 'open', deadline: '2026-07-01' } as never, '2026-07-09')).toBe(true);
  });
  it('false when resolved or no deadline', () => {
    expect(isOverdue({ status: 'resolved', deadline: '2026-07-01' } as never, '2026-07-09')).toBe(false);
    expect(isOverdue({ status: 'open' } as never, '2026-07-09')).toBe(false);
  });
});
```

Run: `npm run test` → FAIL (module not found).

- [ ] **Step 2: Implement**

`src/server/lib/errors.ts`:

```ts
import type { Envelope, ErrorCode } from '../../shared/types';

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
  }
}
export function fail(code: ErrorCode, message: string, details?: unknown): never {
  throw new AppError(code, message, details);
}
export function ok<T>(data: T): Envelope<T> { return { ok: true, data }; }
export function errEnvelope(code: ErrorCode, message: string, details?: unknown): Envelope<never> {
  return { ok: false, error: { code, message, details } };
}
```

`src/server/lib/validate.ts`:

```ts
import type { Finding } from '../../shared/types';
import { UNRESOLVED } from '../../shared/types';
import { fail } from './errors';

export function requireString(v: unknown, field: string, opts: { min?: number; max?: number } = {}): string {
  if (typeof v !== 'string' || v.trim() === '') fail('VALIDATION', `Campo obrigatório: ${field}`, { field });
  const s = v.trim();
  if (opts.min && s.length < opts.min) fail('VALIDATION', `${field}: mínimo de ${opts.min} caracteres`, { field });
  if (opts.max && s.length > opts.max) fail('VALIDATION', `${field}: máximo de ${opts.max} caracteres`, { field });
  return s;
}
export function optionalString(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') fail('VALIDATION', 'Valor inválido');
  return v.trim();
}
export function requireEnum<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v))
    fail('VALIDATION', `Valor inválido para ${field}`, { field, allowed });
  return v as T;
}
export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
export function isValidPeriod(s: string): boolean {
  const m = /^(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const month = Number(m[1]);
  return month >= 1 && month <= 12;
}
export function periodFolderToken(period: string): string {
  const [mm, yyyy] = period.split('/');
  return `${yyyy}-${mm}`;
}
export function semesterOf(period: string): string {
  const [mm, yyyy] = period.split('/');
  return `${yyyy}-${Number(mm) <= 6 ? 1 : 2}`;
}
export function currentPeriodSemester(now: Date): string {
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1 <= 6 ? 1 : 2}`;
}
export function isOverdue(f: Pick<Finding, 'status' | 'deadline'>, todayIso: string): boolean {
  return !!f.deadline && UNRESOLVED.includes(f.status) && f.deadline < todayIso;
}
```

- [ ] **Step 3: Run** — `npm run test` → PASS.
- [ ] **Step 4: Commit** — `git commit -am "Add server error and validation/period utilities"`

---

### Task 4: Pure-JS crypto — SHA-256, iterated hashing, password policy

**Files:**
- Create: `src/server/lib/crypto.ts`
- Test: `test/crypto.test.ts`

**Interfaces:**
- Produces: `sha256Hex(msg: string): string`; `hashPassword(password, salt, iterations): string` (hex; chain: `h = sha256Hex(salt + ':' + password)` then `h = sha256Hex(h)` × (iterations−1)); `verifyPassword(password, salt, iterations, expectedHash): boolean` (constant-ish compare); `checkPasswordPolicy(pw): string | null` (pt-BR error or null; min 8, ≥1 letter, ≥1 digit); `DEFAULT_ITERATIONS = 100_000`; `DUMMY_SALT = 'sava-dummy-salt'`.
- No GAS APIs — runs in V8 in-process (spec §6: `Utilities.computeDigest` bridge overhead makes it useless for stretching).

- [ ] **Step 1: Failing tests** — `test/crypto.test.ts` (NIST vectors):

```ts
import { describe, it, expect } from 'vitest';
import { sha256Hex, hashPassword, verifyPassword, checkPasswordPolicy } from '../src/server/lib/crypto';

describe('sha256Hex', () => {
  it('matches NIST vectors', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // multi-block (>55 bytes) input
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });
  it('handles UTF-8 (pt-BR)', () => {
    expect(sha256Hex('ação')).toHaveLength(64);
  });
});

describe('hashPassword / verifyPassword', () => {
  it('roundtrips and rejects wrong password', () => {
    const h = hashPassword('Senha123', 'salt1', 1000);
    expect(verifyPassword('Senha123', 'salt1', 1000, h)).toBe(true);
    expect(verifyPassword('Senha124', 'salt1', 1000, h)).toBe(false);
    expect(verifyPassword('Senha123', 'salt2', 1000, h)).toBe(false);
  });
  it('iteration count changes the hash', () => {
    expect(hashPassword('x', 's', 2)).not.toBe(hashPassword('x', 's', 3));
  });
});

describe('checkPasswordPolicy', () => {
  it('enforces min 8, letters and numbers', () => {
    expect(checkPasswordPolicy('Senha123')).toBeNull();
    expect(checkPasswordPolicy('curta1')).toMatch(/8/);
    expect(checkPasswordPolicy('somenteletras')).toMatch(/número/);
    expect(checkPasswordPolicy('12345678')).toMatch(/letra/);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `src/server/lib/crypto.ts`** — complete, dependency-free:

```ts
/* Pure-JS SHA-256 (FIPS 180-4). Runs in-process in V8 — no Utilities.computeDigest
   (JS→Java bridge overhead would cap iteration counts at useless levels; spec §6). */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.codePointAt(i)!;
    if (c > 0xffff) i++;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

export function sha256Hex(msg: string): string {
  const bytes = utf8Bytes(msg);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);

  let [h0, h1, h2, h3, h4, h5, h6, h7] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Array<number>(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = ((bytes[off + 4 * i]! << 24) | (bytes[off + 4 * i + 1]! << 16)
        | (bytes[off + 4 * i + 2]! << 8) | bytes[off + 4 * i + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map(x => x.toString(16).padStart(8, '0')).join('');
}

export const DEFAULT_ITERATIONS = 100_000;
export const DUMMY_SALT = 'sava-dummy-salt';

export function hashPassword(password: string, salt: string, iterations: number): string {
  let h = sha256Hex(`${salt}:${password}`);
  for (let i = 1; i < iterations; i++) h = sha256Hex(h);
  return h;
}
export function verifyPassword(password: string, salt: string, iterations: number, expected: string): boolean {
  const actual = hashPassword(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 8) return 'A senha precisa ter no mínimo 8 caracteres.';
  if (!/[a-zA-Z]/.test(pw)) return 'A senha precisa conter ao menos uma letra.';
  if (!/[0-9]/.test(pw)) return 'A senha precisa conter ao menos um número.';
  return null;
}
```

- [ ] **Step 3: Run** — `npm run test` → PASS (vectors green).
- [ ] **Step 4: Sanity-check timing** — `node -e "const{hashPassword}=await import('./src/server/lib/crypto.ts')"` is not runnable directly; instead add a temporary vitest `it('100k iterations under 2s')` with `Date.now()` bounds, run once, then keep it with a generous bound (< 5000 ms) so CI never flakes.
- [ ] **Step 5: Commit** — `git commit -am "Add pure-JS SHA-256 and iterated password hashing with policy"`

---

### Task 5: Ports, repo interfaces, in-memory fakes

**Files:**
- Create: `src/server/services/ports.ts`, `test/fakes.ts`
- Test: `test/fakes.test.ts`

**Interfaces:**
- Produces (every service consumes `Ctx`):

- [ ] **Step 1: Write `src/server/services/ports.ts`**

```ts
import type {
  City, Department, ChecklistItem, Visit, VisitDepartment, Finding, FindingReview,
  Role, SessionUser,
} from '../../shared/types';

export interface UserRow {
  id: string; name: string; login: string; role: Role; cityId?: string;
  active: boolean; mustChangePassword: boolean; createdAt: string;
  passwordHash: string; salt: string; hashIterations: number;
  failedAttempts: number; lockedUntil?: string;
}
export interface SessionRow {
  token: string; userId: string; createdAt: string; expiresAt: string; lastSeenAt: string;
}
export interface AuditEntry {
  timestamp: string; userId: string; action: string; entity: string; entityId: string; detail: string;
}

export interface Table<T extends { id: string }> {
  all(): T[];
  byId(id: string): T | undefined;
  insert(row: T): void;
  update(row: T): void; // locates by id at write time; throws if missing
}
export interface SessionsTable {
  byToken(token: string): SessionRow | undefined;
  insert(row: SessionRow): void;
  update(row: SessionRow): void;
  deleteByToken(token: string): void;
  deleteByUserId(userId: string): void;
  deleteExpired(nowIso: string): number;
}
export interface Repos {
  cities: Table<City>;
  departments: Table<Department>;
  checklistItems: Table<ChecklistItem>;
  users: Table<UserRow>;
  sessions: SessionsTable;
  visits: Table<Visit>;
  visitDepartments: Table<VisitDepartment>;
  findings: Table<Finding>;
  findingReviews: Table<FindingReview>;
  audit: { append(e: AuditEntry): void };
}
export interface FilesPort {
  savePdf(folderToken: string, cityName: string, fileName: string, base64: string): { fileId: string; url: string };
  readPdf(fileId: string): { fileName: string; base64: string };
}
export interface Ports {
  repos: Repos;
  files: FilesPort;
  now(): Date;
  todayIso(): string;      // YYYY-MM-DD in America/Sao_Paulo
  uuid(): string;
  randomToken(): string;   // ≥ 240 bits
  lock<T>(fn: () => T): T;
  invalidateCache(keys: string[]): void;
}
export interface Ctx { ports: Ports; user: SessionUser }

export function audit(ports: Ports, userId: string, action: string, entity: string, entityId: string, detail = ''): void {
  ports.repos.audit.append({ timestamp: ports.now().toISOString(), userId, action, entity, entityId, detail });
}
```

- [ ] **Step 2: Write `test/fakes.ts`** — in-memory implementation used by ALL service tests:

```ts
import type {
  Repos, Ports, Table, SessionsTable, SessionRow, UserRow, AuditEntry, FilesPort,
} from '../src/server/services/ports';

export function fakeTable<T extends { id: string }>(rows: T[] = []): Table<T> & { rows: T[] } {
  return {
    rows,
    all: () => [...rows],
    byId: (id) => rows.find(r => r.id === id),
    insert: (row) => { rows.push(structuredClone(row)); },
    update: (row) => {
      const i = rows.findIndex(r => r.id === row.id);
      if (i < 0) throw new Error(`update: id not found ${row.id}`);
      rows[i] = structuredClone(row);
    },
  };
}
export function fakeSessions(rows: SessionRow[] = []): SessionsTable & { rows: SessionRow[] } {
  return {
    rows,
    byToken: (t) => rows.find(r => r.token === t),
    insert: (r) => { rows.push({ ...r }); },
    update: (r) => {
      const i = rows.findIndex(x => x.token === r.token);
      if (i < 0) throw new Error('session not found');
      rows[i] = { ...r };
    },
    deleteByToken: (t) => { const i = rows.findIndex(r => r.token === t); if (i >= 0) rows.splice(i, 1); },
    deleteByUserId: (u) => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.userId === u) rows.splice(i, 1); },
    deleteExpired: (now) => { const n = rows.length; for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.expiresAt < now) rows.splice(i, 1); return n - rows.length; },
  };
}
export function fakePorts(overrides: Partial<{ nowIso: string }> = {}): Ports & {
  auditRows: AuditEntry[]; pdfStore: Map<string, { fileName: string; base64: string }>;
} {
  let seq = 0;
  const auditRows: AuditEntry[] = [];
  const pdfStore = new Map<string, { fileName: string; base64: string }>();
  const nowIso = overrides.nowIso ?? '2026-07-09T12:00:00.000Z';
  const files: FilesPort = {
    savePdf: (_tok, _city, fileName, base64) => {
      const fileId = `file-${++seq}`;
      pdfStore.set(fileId, { fileName, base64 });
      return { fileId, url: `https://drive.example/${fileId}` };
    },
    readPdf: (fileId) => {
      const f = pdfStore.get(fileId);
      if (!f) throw new Error('file not found');
      return f;
    },
  };
  const repos: Repos = {
    cities: fakeTable(), departments: fakeTable(), checklistItems: fakeTable(),
    users: fakeTable<UserRow>(), sessions: fakeSessions(),
    visits: fakeTable(), visitDepartments: fakeTable(),
    findings: fakeTable(), findingReviews: fakeTable(),
    audit: { append: (e) => auditRows.push(e) },
  };
  return {
    repos, files, auditRows, pdfStore,
    now: () => new Date(nowIso),
    todayIso: () => nowIso.slice(0, 10),
    uuid: () => `uuid-${++seq}`,
    randomToken: () => `token-${++seq}`,
    lock: (fn) => fn(),
    invalidateCache: () => {},
  };
}
```

- [ ] **Step 3: Test the fakes** — `test/fakes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fakeTable, fakePorts } from './fakes';

describe('fakes', () => {
  it('table roundtrip and update-by-id', () => {
    const t = fakeTable<{ id: string; v: number }>();
    t.insert({ id: 'a', v: 1 });
    t.update({ id: 'a', v: 2 });
    expect(t.byId('a')!.v).toBe(2);
    expect(() => t.update({ id: 'zz', v: 0 })).toThrow();
  });
  it('ports produce deterministic ids and audit trail', () => {
    const p = fakePorts();
    expect(p.uuid()).toBe('uuid-1');
    p.repos.audit.append({ timestamp: '', userId: 'u', action: 'a', entity: 'e', entityId: '1', detail: '' });
    expect(p.auditRows).toHaveLength(1);
  });
});
```

Run → PASS.

- [ ] **Step 4: Commit** — `git commit -am "Add service ports and in-memory test fakes"`

---

### Task 6: Sheet row mapping (pure) + GAS repositories

**Files:**
- Create: `src/server/repositories/mapping.ts`, `src/server/repositories/sheets.ts`
- Test: `test/mapping.test.ts`

**Interfaces:**
- Produces: `rowToObject<T>(headers: string[], row: unknown[]): T`, `objectToRow(headers, obj): unknown[]`, `escapeCell(v: unknown): unknown` (prefix `'` when string starts with `=`), `SHEET_COLUMNS: Record<string, string[]>` (canonical header list per tab — the ONLY place tab layouts are defined), `sheetsRepos(ss: Spreadsheet): Repos` (GAS impl; not unit-tested, kept thin).
- Conversion rules: `''` ↔ `undefined`; `TRUE`/`FALSE` ↔ boolean; numeric column values pass through as numbers; everything else strings.

- [ ] **Step 1: Failing tests** — `test/mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rowToObject, objectToRow, escapeCell, SHEET_COLUMNS } from '../src/server/repositories/mapping';

describe('mapping', () => {
  const headers = ['id', 'name', 'active', 'countYes'];
  it('row → object with type coercion', () => {
    expect(rowToObject(headers, ['1', 'Nova Odessa', 'TRUE', 12]))
      .toEqual({ id: '1', name: 'Nova Odessa', active: true, countYes: 12 });
  });
  it('empty cells become undefined and are stripped', () => {
    expect(rowToObject(headers, ['1', '', 'FALSE', '']))
      .toEqual({ id: '1', active: false });
  });
  it('object → row aligns to headers and escapes formulas', () => {
    expect(objectToRow(headers, { id: '1', name: '=HYPERLINK("x")', active: true }))
      .toEqual(['1', `'=HYPERLINK("x")`, 'TRUE', '']);
  });
  it('escapeCell only touches leading =', () => {
    expect(escapeCell('=1+1')).toBe(`'=1+1`);
    expect(escapeCell('a=b')).toBe('a=b');
    expect(escapeCell(5)).toBe(5);
  });
  it('canonical columns include every tab', () => {
    expect(Object.keys(SHEET_COLUMNS).sort()).toEqual([
      'AuditLog', 'ChecklistItems', 'Cities', 'Departments', 'FindingReviews',
      'Findings', 'Sessions', 'Users', 'VisitDepartments', 'Visits',
    ]);
    expect(SHEET_COLUMNS['Findings']).toContain('code');
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `src/server/repositories/mapping.ts`**

```ts
export function escapeCell(v: unknown): unknown {
  if (typeof v === 'string' && v.startsWith('=')) return `'${v}`;
  return v;
}
export function rowToObject<T>(headers: string[], row: unknown[]): T {
  const obj: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    const cell = row[i];
    if (cell === '' || cell === null || cell === undefined) return;
    if (cell === 'TRUE') obj[h] = true;
    else if (cell === 'FALSE') obj[h] = false;
    else obj[h] = cell;
  });
  return obj as T;
}
export function objectToRow(headers: string[], obj: Record<string, unknown>): unknown[] {
  return headers.map((h) => {
    const v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return escapeCell(v);
  });
}
export const SHEET_COLUMNS: Record<string, string[]> = {
  Cities: ['id', 'name', 'active'],
  Departments: ['id', 'name', 'active'],
  ChecklistItems: ['id', 'departmentId', 'itemRef', 'section', 'text', 'severity', 'active'],
  Users: ['id', 'name', 'login', 'role', 'cityId', 'active', 'mustChangePassword', 'createdAt',
    'passwordHash', 'salt', 'hashIterations', 'failedAttempts', 'lockedUntil'],
  Sessions: ['token', 'userId', 'createdAt', 'expiresAt', 'lastSeenAt'],
  Visits: ['id', 'cityId', 'period', 'mainDate', 'notes', 'createdAt', 'createdBy'],
  VisitDepartments: ['id', 'visitId', 'departmentId', 'cityId', 'period', 'verificationDate',
    'regionalReps', 'localReps', 'countYes', 'countYesWithCaveats', 'countNo', 'countNotApplicable',
    'pdfFileId', 'pdfUrl', 'completedAt', 'completedBy', 'notes', 'createdAt', 'createdBy'],
  Findings: ['id', 'code', 'visitDepartmentId', 'visitId', 'cityId', 'departmentId', 'period',
    'itemRef', 'section', 'itemText', 'severity', 'response', 'considerations', 'status',
    'deadline', 'assignee', 'resolvedAt', 'resolvedBy', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  FindingReviews: ['id', 'findingId', 'type', 'visitId', 'result', 'newStatus', 'notes', 'createdAt', 'createdBy'],
  AuditLog: ['timestamp', 'userId', 'action', 'entity', 'entityId', 'detail'],
};
```

- [ ] **Step 3: Implement `src/server/repositories/sheets.ts`** (GAS-facing; header-name mapping; kept thin — verified by smoke test in Task 16, not vitest):

```ts
import { SHEET_COLUMNS, rowToObject, objectToRow } from './mapping';
import type { Repos, SessionsTable, SessionRow, AuditEntry } from '../services/ports';

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

function readAll<T>(sheet: Sheet): { headers: string[]; objs: T[] } {
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] ?? []).map(String);
  const objs = values.slice(1).map(r => rowToObject<T>(headers, r));
  return { headers, objs };
}
function findRowIndexById(sheet: Sheet, headers: string[], idCol: string, id: string): number {
  const col = headers.indexOf(idCol) + 1;
  const colValues = sheet.getRange(2, col, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < colValues.length; i++) if (String(colValues[i]![0]) === id) return i + 2;
  return -1;
}
function table<T extends { id: string }>(sheet: Sheet, tab: string) {
  const headers = SHEET_COLUMNS[tab]!;
  return {
    all: () => readAll<T>(sheet).objs,
    byId: (id: string) => readAll<T>(sheet).objs.find(o => o.id === id),
    insert: (row: T) => { sheet.appendRow(objectToRow(headers, row as Record<string, unknown>) as string[]); },
    update: (row: T) => {
      const idx = findRowIndexById(sheet, headers, 'id', row.id);
      if (idx < 0) throw new Error(`row not found: ${tab}/${row.id}`);
      sheet.getRange(idx, 1, 1, headers.length).setValues([objectToRow(headers, row as Record<string, unknown>)]);
    },
  };
}
function sessionsTable(sheet: Sheet): SessionsTable {
  const headers = SHEET_COLUMNS['Sessions']!;
  const allRows = () => readAll<SessionRow>(sheet).objs;
  const rowIndexByToken = (token: string) => findRowIndexById(sheet, headers, 'token', token);
  return {
    byToken: (t) => allRows().find(r => r.token === t),
    insert: (r) => { sheet.appendRow(objectToRow(headers, r as unknown as Record<string, unknown>) as string[]); },
    update: (r) => {
      const idx = rowIndexByToken(r.token);
      if (idx < 0) throw new Error('session not found');
      sheet.getRange(idx, 1, 1, headers.length).setValues([objectToRow(headers, r as unknown as Record<string, unknown>)]);
    },
    deleteByToken: (t) => { const idx = rowIndexByToken(t); if (idx > 0) sheet.deleteRow(idx); },
    deleteByUserId: (u) => {
      const rows = allRows();
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.userId === u) sheet.deleteRow(i + 2);
    },
    deleteExpired: (nowIso) => {
      const rows = allRows(); let n = 0;
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.expiresAt < nowIso) { sheet.deleteRow(i + 2); n++; }
      return n;
    },
  };
}
export function sheetsRepos(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): Repos {
  const s = (name: string) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error(`missing tab: ${name}`);
    return sheet;
  };
  return {
    cities: table(s('Cities'), 'Cities'),
    departments: table(s('Departments'), 'Departments'),
    checklistItems: table(s('ChecklistItems'), 'ChecklistItems'),
    users: table(s('Users'), 'Users'),
    sessions: sessionsTable(s('Sessions')),
    visits: table(s('Visits'), 'Visits'),
    visitDepartments: table(s('VisitDepartments'), 'VisitDepartments'),
    findings: table(s('Findings'), 'Findings'),
    findingReviews: table(s('FindingReviews'), 'FindingReviews'),
    audit: { append: (e: AuditEntry) => s('AuditLog').appendRow(objectToRow(SHEET_COLUMNS['AuditLog']!, e as unknown as Record<string, unknown>) as string[]) },
  };
}
```

- [ ] **Step 4: Run** — `npm run test` → PASS; `npm run typecheck` → clean.
- [ ] **Step 5: Commit** — `git commit -am "Add sheet mapping with formula guard and GAS repositories"`

---

### Task 7: Auth service

**Files:**
- Create: `src/server/services/auth.ts`
- Test: `test/auth.test.ts`

**Interfaces:**
- Consumes: `Ports`, crypto (Task 4), errors (Task 3), fakes (Task 5).
- Produces: `login(ports, {login, password}): LoginResult`; `validateSession(ports, token): SessionUser` (sliding 30-day expiry, `expiresAt` rewritten at most once/day); `logout(ports, token): void`; `changePassword(ports, user, {currentPassword, newPassword}): void`; `me(ctx): SessionUser`; `toSessionUser(row: UserRow): SessionUser`; helpers `createUserWithTempPassword`, `resetUserPassword` (used by Task 9); constants `SESSION_DAYS = 30`, `MAX_FAILURES = 5`, `LOCK_MINUTES = 15`; `GENERIC_LOGIN_ERROR = 'Usuário ou senha inválidos. Após tentativas repetidas, aguarde 15 minutos.'`.
- Behaviors (spec §6): generic error for unknown/wrong/locked with constant hash work (DUMMY_SALT for unknown; hash still runs when locked); lock after 5 consecutive failures for 15 min; sessions revoked on password change; tempPassword = 8 chars from unambiguous alphabet, format `Xxx-0000`-like readable.

- [ ] **Step 1: Failing tests** — `test/auth.test.ts` (use LOW iteration count for speed):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import { hashPassword } from '../src/server/lib/crypto';
import { login, validateSession, changePassword, logout, GENERIC_LOGIN_ERROR } from '../src/server/services/auth';
import type { UserRow } from '../src/server/services/ports';
import { AppError } from '../src/server/lib/errors';

const ITER = 10;
function seedUser(p: ReturnType<typeof fakePorts>, over: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    id: 'u1', name: 'José', login: 'jose', role: 'regional', active: true,
    mustChangePassword: false, createdAt: '2026-01-01T00:00:00.000Z',
    passwordHash: hashPassword('Senha123', 's1', ITER), salt: 's1', hashIterations: ITER,
    failedAttempts: 0, ...over,
  };
  p.repos.users.insert(row);
  return row;
}

describe('login', () => {
  let p: ReturnType<typeof fakePorts>;
  beforeEach(() => { p = fakePorts(); });

  it('returns token + user on success and resets failures', () => {
    seedUser(p, { failedAttempts: 3 });
    const r = login(p, { login: 'JOSE', password: 'Senha123' }); // case-insensitive login
    expect(r.token).toBeTruthy();
    expect(r.user).toMatchObject({ login: 'jose', role: 'regional' });
    expect((r.user as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect(p.repos.sessions.byToken(r.token)).toBeTruthy();
    expect(p.repos.users.byId('u1')!.failedAttempts).toBe(0);
  });
  it('same generic error for unknown login, wrong password, locked, inactive', () => {
    seedUser(p);
    for (const attempt of [
      () => login(p, { login: 'nope', password: 'x1234567' }),
      () => login(p, { login: 'jose', password: 'errada12' }),
    ]) {
      try { attempt(); expect.unreachable(); } catch (e) {
        expect((e as AppError).message).toBe(GENERIC_LOGIN_ERROR);
        expect((e as AppError).code).toBe('UNAUTHORIZED');
      }
    }
  });
  it('locks after 5 failures and rejects even correct password while locked', () => {
    seedUser(p);
    for (let i = 0; i < 5; i++) { try { login(p, { login: 'jose', password: 'errada12' }); } catch { /* expected */ } }
    const u = p.repos.users.byId('u1')!;
    expect(u.lockedUntil).toBeTruthy();
    expect(() => login(p, { login: 'jose', password: 'Senha123' })).toThrow(GENERIC_LOGIN_ERROR);
  });
  it('lock expires', () => {
    seedUser(p, { failedAttempts: 5, lockedUntil: '2026-07-09T11:00:00.000Z' }); // now = 12:00
    expect(login(p, { login: 'jose', password: 'Senha123' }).token).toBeTruthy();
  });
});

describe('validateSession', () => {
  it('accepts fresh token, rejects expired/unknown, slides expiry at most daily', () => {
    const p = fakePorts();
    seedUser(p);
    const { token } = login(p, { login: 'jose', password: 'Senha123' });
    expect(validateSession(p, token).login).toBe('jose');
    expect(() => validateSession(p, 'bogus')).toThrow();
    const s = p.repos.sessions.byToken(token)!;
    p.repos.sessions.update({ ...s, expiresAt: '2026-07-01T00:00:00.000Z' });
    expect(() => validateSession(p, token)).toThrow();
  });
});

describe('changePassword', () => {
  it('requires current password, enforces policy, revokes other sessions, clears mustChangePassword', () => {
    const p = fakePorts();
    seedUser(p, { mustChangePassword: true });
    const { token, user } = login(p, { login: 'jose', password: 'Senha123' });
    expect(() => changePassword(p, user, { currentPassword: 'errada12', newPassword: 'Nova1234' })).toThrow();
    expect(() => changePassword(p, user, { currentPassword: 'Senha123', newPassword: 'fraca' })).toThrow();
    changePassword(p, user, { currentPassword: 'Senha123', newPassword: 'Nova1234' });
    expect(p.repos.users.byId('u1')!.mustChangePassword).toBe(false);
    expect(p.repos.sessions.byToken(token)).toBeUndefined(); // sessions revoked
    expect(login(p, { login: 'jose', password: 'Nova1234' }).token).toBeTruthy();
  });
});

describe('logout', () => {
  it('removes the session', () => {
    const p = fakePorts();
    seedUser(p);
    const { token } = login(p, { login: 'jose', password: 'Senha123' });
    logout(p, token);
    expect(p.repos.sessions.byToken(token)).toBeUndefined();
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `src/server/services/auth.ts`**

```ts
import type { LoginResult, SessionUser } from '../../shared/types';
import { fail } from '../lib/errors';
import { requireString } from '../lib/validate';
import {
  hashPassword, verifyPassword, checkPasswordPolicy, DEFAULT_ITERATIONS, DUMMY_SALT,
} from '../lib/crypto';
import type { Ports, UserRow, Ctx } from './ports';
import { audit } from './ports';

export const SESSION_DAYS = 30;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const GENERIC_LOGIN_ERROR =
  'Usuário ou senha inválidos. Após tentativas repetidas, aguarde 15 minutos.';

export function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id, name: u.name, login: u.login, role: u.role,
    cityId: u.cityId, mustChangePassword: u.mustChangePassword,
  };
}
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000).toISOString();
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000).toISOString();

export function login(ports: Ports, payload: { login: string; password: string }): LoginResult {
  const loginName = requireString(payload.login, 'usuário').toLowerCase();
  const password = requireString(payload.password, 'senha');
  const nowIso = ports.now().toISOString();
  const user = ports.repos.users.all().find(u => u.login.toLowerCase() === loginName);

  // constant work: always hash, even for unknown/locked/inactive
  const salt = user ? user.salt : DUMMY_SALT;
  const iterations = user ? user.hashIterations : DEFAULT_ITERATIONS;
  const expected = user ? user.passwordHash : hashPassword('never-matches', DUMMY_SALT, iterations);
  const passwordOk = verifyPassword(password, salt, iterations, expected);

  const locked = !!user?.lockedUntil && user.lockedUntil > nowIso;
  if (!user || !user.active || locked || !passwordOk) {
    if (user && user.active && !locked && !passwordOk) {
      const failures = user.failedAttempts + 1;
      const lockedUntil = failures >= MAX_FAILURES ? addMinutes(ports.now(), LOCK_MINUTES) : user.lockedUntil;
      ports.lock(() => ports.repos.users.update({ ...user, failedAttempts: failures, lockedUntil }));
      audit(ports, user.id, 'auth.login.failure', 'Users', user.id, `failures=${failures}`);
    }
    fail('UNAUTHORIZED', GENERIC_LOGIN_ERROR);
  }
  const token = ports.randomToken();
  ports.lock(() => {
    if (user.failedAttempts > 0 || user.lockedUntil) {
      ports.repos.users.update({ ...user, failedAttempts: 0, lockedUntil: undefined });
    }
    ports.repos.sessions.insert({
      token, userId: user.id, createdAt: nowIso,
      expiresAt: addDays(ports.now(), SESSION_DAYS), lastSeenAt: nowIso,
    });
  });
  audit(ports, user.id, 'auth.login.success', 'Users', user.id);
  return { token, user: toSessionUser(user) };
}

export function validateSession(ports: Ports, token: string | undefined): SessionUser {
  if (!token) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  const s = ports.repos.sessions.byToken(token);
  const nowIso = ports.now().toISOString();
  if (!s || s.expiresAt < nowIso) fail('UNAUTHORIZED', 'Sessão expirada. Entre novamente.');
  const user = ports.repos.users.byId(s.userId);
  if (!user || !user.active) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  // slide expiry at most once per day (avoid write amplification, spec §5)
  if (s.lastSeenAt < nowIso.slice(0, 10)) {
    ports.lock(() => ports.repos.sessions.update({
      ...s, lastSeenAt: nowIso, expiresAt: addDays(ports.now(), SESSION_DAYS),
    }));
  }
  return toSessionUser(user);
}

export function logout(ports: Ports, token: string): void {
  ports.lock(() => ports.repos.sessions.deleteByToken(token));
}

export function me(ctx: Ctx): SessionUser { return ctx.user; }

export function changePassword(
  ports: Ports, user: SessionUser, payload: { currentPassword: string; newPassword: string },
): void {
  const row = ports.repos.users.byId(user.id);
  if (!row) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  const current = requireString(payload.currentPassword, 'senha atual');
  if (!verifyPassword(current, row.salt, row.hashIterations, row.passwordHash))
    fail('VALIDATION', 'Senha atual incorreta.');
  const newPw = requireString(payload.newPassword, 'nova senha');
  const policyError = checkPasswordPolicy(newPw);
  if (policyError) fail('VALIDATION', policyError);
  const salt = ports.uuid();
  ports.lock(() => {
    ports.repos.users.update({
      ...row, salt, hashIterations: DEFAULT_ITERATIONS,
      passwordHash: hashPassword(newPw, salt, DEFAULT_ITERATIONS), mustChangePassword: false,
    });
    ports.repos.sessions.deleteByUserId(row.id); // revoke all sessions (client re-logs)
  });
  audit(ports, user.id, 'auth.changePassword', 'Users', user.id);
}

/** Temp password like "Kxq-4729": readable over WhatsApp, satisfies policy. */
export function generateTempPassword(ports: Ports): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const seedHex = ports.randomToken().replace(/-/g, '');
  const pick = (i: number, pool: string) => pool[parseInt(seedHex.slice(i * 2, i * 2 + 2), 16) % pool.length]!;
  const l = (i: number) => pick(i, letters);
  const d = (i: number) => pick(i, '23456789');
  return `${l(0)!.toUpperCase()}${l(1)}${l(2)}-${d(3)}${d(4)}${d(5)}${d(6)}`;
}
export function applyNewPassword(ports: Ports, row: UserRow, tempPassword: string): UserRow {
  const salt = ports.uuid();
  return {
    ...row, salt, hashIterations: DEFAULT_ITERATIONS,
    passwordHash: hashPassword(tempPassword, salt, DEFAULT_ITERATIONS),
    mustChangePassword: true, failedAttempts: 0, lockedUntil: undefined,
  };
}
```

Note: temp password `Kxq-4729` contains a letter and numbers but is 8 chars incl. hyphen — policy check applies to *user-chosen* passwords only; temp passwords are forced-changed at first login.

- [ ] **Step 3: Run** — `npm run test` → PASS.
- [ ] **Step 4: Commit** — `git commit -am "Add auth service: login throttling, sessions, password change"`

---

### Task 8: API dispatcher

**Files:**
- Create: `src/server/api/dispatcher.ts`
- Test: `test/dispatcher.test.ts`

**Interfaces:**
- Consumes: `validateSession`, `login`, `logout`, `changePassword`, `me` (Task 7), errors (Task 3).
- Produces: `dispatch(ports: Ports, request: ApiRequest): Envelope<unknown>`; `registerHandlers(map)` internal route table `Record<string, { minRole: 'public'|'local'|'regional'|'admin'; handler: (ctx: Ctx, payload: never) => unknown }>`; `assertCityScope(ctx, cityId)` helper exported for services; role order `local < regional < admin`.
- Rules (spec §6/§7): every action except `auth.login` requires a session; while `mustChangePassword`, only `auth.changePassword`/`auth.me`/`auth.logout` pass (else `FORBIDDEN`); unknown action → `NOT_FOUND`; `AppError` → its envelope; unexpected `Error` → `INTERNAL` with reference id logged to AuditLog (never the raw message to the client).

- [ ] **Step 1: Failing tests** — `test/dispatcher.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import { hashPassword } from '../src/server/lib/crypto';
import { dispatch, __testRegister } from '../src/server/api/dispatcher';
import type { UserRow } from '../src/server/services/ports';

const ITER = 10;
function seed(p: ReturnType<typeof fakePorts>, over: Partial<UserRow> = {}) {
  p.repos.users.insert({
    id: 'u1', name: 'José', login: 'jose', role: 'regional', active: true,
    mustChangePassword: false, createdAt: '', salt: 's', hashIterations: ITER,
    passwordHash: hashPassword('Senha123', 's', ITER), failedAttempts: 0, ...over,
  });
}
const loginToken = (p: ReturnType<typeof fakePorts>) => {
  const r = dispatch(p, { action: 'auth.login', payload: { login: 'jose', password: 'Senha123' } });
  if (!r.ok) throw new Error('login failed');
  return (r.data as { token: string }).token;
};

describe('dispatch', () => {
  let p: ReturnType<typeof fakePorts>;
  beforeEach(() => {
    p = fakePorts();
    __testRegister('test.echo', 'regional', (_ctx, payload) => payload);
    __testRegister('test.adminOnly', 'admin', () => 'secret');
    __testRegister('test.boom', 'regional', () => { throw new Error('raw internals'); });
  });

  it('login works without token; other actions demand a session', () => {
    seed(p);
    expect(dispatch(p, { action: 'test.echo', payload: 1 }).ok).toBe(false);
    const token = loginToken(p);
    const r = dispatch(p, { token, action: 'test.echo', payload: { x: 1 } });
    expect(r).toEqual({ ok: true, data: { x: 1 } });
  });
  it('unknown action → NOT_FOUND; insufficient role → FORBIDDEN', () => {
    seed(p);
    const token = loginToken(p);
    const nf = dispatch(p, { token, action: 'nope.nope' });
    expect(!nf.ok && nf.error.code).toBe('NOT_FOUND');
    const fb = dispatch(p, { token, action: 'test.adminOnly' });
    expect(!fb.ok && fb.error.code).toBe('FORBIDDEN');
  });
  it('mustChangePassword gates everything except auth.changePassword/me/logout', () => {
    seed(p, { mustChangePassword: true });
    const token = loginToken(p);
    const blocked = dispatch(p, { token, action: 'test.echo', payload: 1 });
    expect(!blocked.ok && blocked.error.code).toBe('FORBIDDEN');
    expect(dispatch(p, { token, action: 'auth.me' }).ok).toBe(true);
  });
  it('unexpected errors become INTERNAL with reference id, raw message hidden', () => {
    seed(p);
    const token = loginToken(p);
    const r = dispatch(p, { token, action: 'test.boom' });
    expect(!r.ok && r.error.code).toBe('INTERNAL');
    expect(!r.ok && r.error.message).not.toContain('raw internals');
    expect(p.auditRows.some(a => a.action === 'error.INTERNAL')).toBe(true);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `src/server/api/dispatcher.ts`**

```ts
import type { ApiRequest, Envelope, Role, SessionUser } from '../../shared/types';
import { AppError, errEnvelope, ok } from '../lib/errors';
import { fail } from '../lib/errors';
import { login, logout, changePassword, me, validateSession } from '../services/auth';
import type { Ctx, Ports } from '../services/ports';
import { audit } from '../services/ports';

type MinRole = 'public' | Role;
type Handler = (ctx: Ctx, payload: never) => unknown;
const ROLE_ORDER: Record<Role, number> = { local: 0, regional: 1, admin: 2 };
const routes = new Map<string, { minRole: MinRole; handler: Handler }>();

export function register(action: string, minRole: MinRole, handler: Handler): void {
  routes.set(action, { minRole, handler });
}
export const __testRegister = register;

const MUST_CHANGE_ALLOWLIST = new Set(['auth.changePassword', 'auth.me', 'auth.logout']);

register('auth.login', 'public', (ctx, payload) => login(ctx.ports, payload as { login: string; password: string }));
register('auth.logout', 'local', (ctx) => logout(ctx.ports, (ctx as Ctx & { token: string }).token));
register('auth.me', 'local', (ctx) => me(ctx));
register('auth.changePassword', 'local', (ctx, payload) =>
  changePassword(ctx.ports, ctx.user, payload as { currentPassword: string; newPassword: string }));

/** local users may only touch their own city (spec §4/§6) */
export function assertCityScope(ctx: Ctx, cityId: string | undefined): void {
  if (ctx.user.role === 'local' && cityId !== ctx.user.cityId)
    fail('FORBIDDEN', 'Acesso restrito à sua cidade.');
}

export function dispatch(ports: Ports, request: ApiRequest): Envelope<unknown> {
  try {
    const route = routes.get(request.action);
    if (route?.minRole === 'public') {
      const publicCtx = { ports, user: null as unknown as SessionUser };
      return ok(route.handler(publicCtx, request.payload as never));
    }
    const user = validateSession(ports, request.token);
    if (!route) fail('NOT_FOUND', 'Ação desconhecida.');
    if (user.mustChangePassword && !MUST_CHANGE_ALLOWLIST.has(request.action))
      fail('FORBIDDEN', 'Troque sua senha para continuar.');
    if (ROLE_ORDER[user.role] < ROLE_ORDER[route.minRole as Role])
      fail('FORBIDDEN', 'Você não tem permissão para esta ação.');
    const ctx: Ctx & { token?: string } = { ports, user, token: request.token };
    return ok(route.handler(ctx, request.payload as never));
  } catch (e) {
    if (e instanceof AppError) return errEnvelope(e.code, e.message, e.details);
    const ref = `ERR-${Date.now().toString(36)}`;
    try {
      ports.repos.audit.append({
        timestamp: ports.now().toISOString(), userId: request.token ? 'session' : 'anonymous',
        action: 'error.INTERNAL', entity: 'api', entityId: ref,
        detail: `${request.action}: ${(e as Error).message}`,
      });
    } catch { /* audit must never mask the response */ }
    return errEnvelope('INTERNAL', `Erro inesperado. Informe o código ${ref} ao administrador.`);
  }
}
```

Note: `Date.now()` here runs on GAS/vitest at runtime — fine (the no-Date rule applies to Workflow scripts, not app code). `auth.login` handler receives a ctx with `user: null` — it never reads it.

- [ ] **Step 3: Run** — `npm run test` → PASS.
- [ ] **Step 4: Commit** — `git commit -am "Add RPC dispatcher with session, role and mustChangePassword gates"`

---

### Task 9: Master-data services (cities, departments, checklist items, users)

**Files:**
- Create: `src/server/services/masterdata.ts`
- Modify: `src/server/api/dispatcher.ts` (add `import './registry'`? No — see note), Create: `src/server/api/registry.ts`
- Test: `test/masterdata.test.ts`

**Note on registration:** create `src/server/api/registry.ts` that imports `register`/`assertCityScope` from the dispatcher and registers every non-auth action. `gas/main.ts` (Task 15) imports `./registry` for side effects. Tests import it the same way. Auth actions stay registered inside dispatcher.ts.

**Interfaces:**
- Produces (all take `(ctx: Ctx, payload)`): `listCities` (local → only own city), `saveCity`, `listDepartments`, `saveDepartment`, `listChecklistItems({departmentId?})` (departmentId required unless admin), `saveChecklistItem`, `importPaste({departmentId, tsv, apply?, deactivateAbsent?}): ImportPreview`, `listUsers`, `saveUser` (create → temp password via `applyNewPassword`, unique login case-insensitive; update → no password fields), `resetPassword({userId})`.
- Import TSV columns: `itemRef \t section \t text \t severity` with severity accepted as `alta|média|media|baixa|high|medium|low` (map to enum; invalid rows → kind `'invalid'`). Preview kinds new/changed/unchanged; `absent` = active items of that department not present by itemRef. Apply mode: upsert rows (by departmentId+itemRef), deactivate ONLY ids explicitly listed in `deactivateAbsent`.
- City/department/user saves validate: name required; `local` role requires cityId; deactivating city/department is allowed (UI warns — server just saves).

- [ ] **Step 1: Failing tests** — `test/masterdata.test.ts` (representative — write all of these):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import type { Ctx } from '../src/server/services/ports';
import {
  listCities, saveCity, listChecklistItems, importPaste, saveUser, resetPassword,
} from '../src/server/services/masterdata';

function ctxFor(p: ReturnType<typeof fakePorts>, role: 'admin' | 'regional' | 'local', cityId?: string): Ctx {
  return { ports: p, user: { id: 'u-x', name: 'X', login: 'x', role, cityId, mustChangePassword: false } };
}

describe('cities', () => {
  let p: ReturnType<typeof fakePorts>;
  beforeEach(() => {
    p = fakePorts();
    p.repos.cities.insert({ id: 'c1', name: 'Sumaré', active: true });
    p.repos.cities.insert({ id: 'c2', name: 'Americana', active: true });
  });
  it('local sees only own city', () => {
    expect(listCities(ctxFor(p, 'local', 'c2')).map(c => c.id)).toEqual(['c2']);
    expect(listCities(ctxFor(p, 'regional'))).toHaveLength(2);
  });
  it('save creates with uuid and updates by id', () => {
    const created = saveCity(ctxFor(p, 'admin'), { city: { name: 'Hortolândia' } });
    expect(created.id).toBeTruthy();
    const updated = saveCity(ctxFor(p, 'admin'), { city: { id: created.id, name: 'Hortolândia', active: false } });
    expect(updated.active).toBe(false);
  });
});

describe('checklist import', () => {
  let p: ReturnType<typeof fakePorts>;
  beforeEach(() => {
    p = fakePorts();
    p.repos.departments.insert({ id: 'd1', name: 'Informática', active: true });
    p.repos.checklistItems.insert({ id: 'i1', departmentId: 'd1', itemRef: '4.5', section: 'ROTINAS', text: 'Backup ok?', severity: 'high', active: true });
    p.repos.checklistItems.insert({ id: 'i2', departmentId: 'd1', itemRef: '9.9', section: 'OLD', text: 'Antigo', severity: 'low', active: true });
  });
  const tsv = '4.5\tROTINAS\tBackup ok?\tAlta\n4.6\tROTINAS\tAntivírus ativo?\tAlta\n1.1\tMEMBROS\tResponsável definido?\tmédia\nbroken-line';
  it('preview classifies new/changed/unchanged/invalid and lists absent', () => {
    const prev = importPaste(ctxFor(p, 'admin'), { departmentId: 'd1', tsv });
    const kinds = Object.fromEntries(prev.rows.map(r => [r.itemRef || 'broken-line', r.kind]));
    expect(kinds['4.5']).toBe('unchanged');
    expect(kinds['4.6']).toBe('new');
    expect(kinds['1.1']).toBe('new');
    expect(prev.rows.some(r => r.kind === 'invalid')).toBe(true);
    expect(prev.absent.map(a => a.itemRef)).toEqual(['9.9']);
  });
  it('apply upserts and deactivates only confirmed absents', () => {
    importPaste(ctxFor(p, 'admin'), { departmentId: 'd1', tsv, apply: true, deactivateAbsent: ['i2'] });
    const items = p.repos.checklistItems.rows;
    expect(items.find(i => i.itemRef === '4.6')).toBeTruthy();
    expect(items.find(i => i.id === 'i2')!.active).toBe(false);
  });
  it('changed text upserts in place keeping the id', () => {
    const changed = '4.5\tROTINAS\tBackup diário ok?\tAlta';
    const prev = importPaste(ctxFor(p, 'admin'), { departmentId: 'd1', tsv: changed });
    expect(prev.rows[0]!.kind).toBe('changed');
    importPaste(ctxFor(p, 'admin'), { departmentId: 'd1', tsv: changed, apply: true });
    expect(p.repos.checklistItems.rows.find(i => i.id === 'i1')!.text).toBe('Backup diário ok?');
  });
});

describe('users', () => {
  it('create returns temp password once; login unique case-insensitive; reset clears lock', () => {
    const p = fakePorts();
    const r = saveUser(ctxFor(p, 'admin'), { user: { name: 'Ana', login: 'Ana', role: 'regional' } });
    expect(r.tempPassword).toBeTruthy();
    expect(r.user.mustChangePassword).toBe(true);
    expect(() => saveUser(ctxFor(p, 'admin'), { user: { name: 'Ana2', login: 'ana', role: 'regional' } }))
      .toThrow(/já existe/i);
    expect(() => saveUser(ctxFor(p, 'admin'), { user: { name: 'L', login: 'l1', role: 'local' } }))
      .toThrow(); // local requires cityId
    const row = p.repos.users.rows.find(u => u.login === 'ana')!;
    p.repos.users.update({ ...row, failedAttempts: 5, lockedUntil: '2099-01-01T00:00:00.000Z' });
    const reset = resetPassword(ctxFor(p, 'admin'), { userId: row.id });
    expect(reset.tempPassword).toBeTruthy();
    const after = p.repos.users.byId(row.id)!;
    expect(after.lockedUntil).toBeUndefined();
    expect(after.mustChangePassword).toBe(true);
  });
});

describe('checklistItems.list scope', () => {
  it('regional must pass departmentId; admin may omit', () => {
    const p = fakePorts();
    expect(() => listChecklistItems(ctxFor(p, 'regional'), {})).toThrow();
    expect(listChecklistItems(ctxFor(p, 'admin'), {})).toEqual([]);
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `src/server/services/masterdata.ts`** — follow the tests exactly; key fragments:

```ts
import type { City, ChecklistItem, Department, SessionUser, Severity } from '../../shared/types';
import type { ImportPreview, ImportPreviewRow } from '../../shared/actions';
import { fail } from '../lib/errors';
import { requireString, requireEnum, optionalString } from '../lib/validate';
import type { Ctx } from './ports';
import { audit } from './ports';
import { applyNewPassword, generateTempPassword, toSessionUser } from './auth';
import type { UserRow } from './ports';

const SEVERITY_MAP: Record<string, Severity> = {
  alta: 'high', high: 'high', 'média': 'medium', media: 'medium', medium: 'medium',
  baixa: 'low', low: 'low',
};

export function listCities(ctx: Ctx): City[] {
  const all = ctx.ports.repos.cities.all().sort((a, b) => a.name.localeCompare(b.name));
  return ctx.user.role === 'local' ? all.filter(c => c.id === ctx.user.cityId) : all;
}
export function saveCity(ctx: Ctx, payload: { city: Partial<City> & { name: string } }): City {
  const name = requireString(payload.city.name, 'nome');
  return ctx.ports.lock(() => {
    if (payload.city.id) {
      const existing = ctx.ports.repos.cities.byId(payload.city.id);
      if (!existing) fail('NOT_FOUND', 'Cidade não encontrada.');
      const updated: City = { ...existing, name, active: payload.city.active ?? existing.active };
      ctx.ports.repos.cities.update(updated);
      audit(ctx.ports, ctx.user.id, 'cities.save', 'Cities', updated.id);
      ctx.ports.invalidateCache(['cities']);
      return updated;
    }
    const created: City = { id: ctx.ports.uuid(), name, active: payload.city.active ?? true };
    ctx.ports.repos.cities.insert(created);
    audit(ctx.ports, ctx.user.id, 'cities.save', 'Cities', created.id);
    ctx.ports.invalidateCache(['cities']);
    return created;
  });
}
// listDepartments / saveDepartment: identical shape to cities (write them out).

export function listChecklistItems(ctx: Ctx, payload: { departmentId?: string }): ChecklistItem[] {
  if (!payload.departmentId && ctx.user.role !== 'admin')
    fail('VALIDATION', 'Informe o departamento.');
  const all = ctx.ports.repos.checklistItems.all();
  return payload.departmentId ? all.filter(i => i.departmentId === payload.departmentId) : all;
}

function parseTsv(departmentId: string, tsv: string, existing: ChecklistItem[]): { rows: ImportPreviewRow[]; parsed: Map<string, Omit<ChecklistItem, 'id' | 'active'>> } {
  const rows: ImportPreviewRow[] = [];
  const parsed = new Map<string, Omit<ChecklistItem, 'id' | 'active'>>();
  for (const line of tsv.split('\n').map(l => l.trim()).filter(Boolean)) {
    const [itemRef = '', section = '', text = '', severityRaw = ''] = line.split('\t').map(c => c.trim());
    const severity = SEVERITY_MAP[severityRaw.toLowerCase()];
    if (!itemRef || !section || !text || !severity) {
      rows.push({ itemRef, section, text: text || line, severity: severityRaw, kind: 'invalid' });
      continue;
    }
    const current = existing.find(i => i.itemRef === itemRef && i.active);
    const kind = !current ? 'new'
      : current.section === section && current.text === text && current.severity === severity ? 'unchanged' : 'changed';
    rows.push({ itemRef, section, text, severity, kind });
    parsed.set(itemRef, { departmentId, itemRef, section, text, severity });
  }
  return { rows, parsed };
}

export function importPaste(ctx: Ctx, payload: { departmentId: string; tsv: string; apply?: boolean; deactivateAbsent?: string[] }): ImportPreview {
  const departmentId = requireString(payload.departmentId, 'departamento');
  const tsv = requireString(payload.tsv, 'conteúdo colado');
  const existing = ctx.ports.repos.checklistItems.all().filter(i => i.departmentId === departmentId);
  const { rows, parsed } = parseTsv(departmentId, tsv, existing);
  const absent = existing.filter(i => i.active && !parsed.has(i.itemRef));
  if (payload.apply) {
    ctx.ports.lock(() => {
      for (const [itemRef, data] of parsed) {
        const current = existing.find(i => i.itemRef === itemRef && i.active);
        if (current) ctx.ports.repos.checklistItems.update({ ...current, ...data });
        else ctx.ports.repos.checklistItems.insert({ id: ctx.ports.uuid(), active: true, ...data });
      }
      for (const id of payload.deactivateAbsent ?? []) {
        const item = ctx.ports.repos.checklistItems.byId(id);
        if (item && item.departmentId === departmentId)
          ctx.ports.repos.checklistItems.update({ ...item, active: false });
      }
    });
    audit(ctx.ports, ctx.user.id, 'checklistItems.importPaste', 'ChecklistItems', departmentId,
      `rows=${rows.length} deactivated=${(payload.deactivateAbsent ?? []).length}`);
    ctx.ports.invalidateCache(['checklistItems']);
  }
  return { rows, absent };
}

export function listUsers(ctx: Ctx): (SessionUser & { active: boolean })[] {
  return ctx.ports.repos.users.all().map(u => ({ ...toSessionUser(u), active: u.active }));
}
export function saveUser(ctx: Ctx, payload: { user: Partial<SessionUser> & { name: string; login: string; active?: boolean } }): { user: SessionUser; tempPassword?: string } {
  const name = requireString(payload.user.name, 'nome');
  const loginName = requireString(payload.user.login, 'login').toLowerCase();
  const role = requireEnum(payload.user.role, 'perfil', ['admin', 'regional', 'local'] as const);
  const cityId = optionalString(payload.user.cityId);
  if (role === 'local' && !cityId) fail('VALIDATION', 'Perfil local exige uma cidade.');
  return ctx.ports.lock(() => {
    const clash = ctx.ports.repos.users.all()
      .find(u => u.login.toLowerCase() === loginName && u.id !== payload.user.id);
    if (clash) fail('CONFLICT', 'Já existe um usuário com este login.');
    if (payload.user.id) {
      const row = ctx.ports.repos.users.byId(payload.user.id);
      if (!row) fail('NOT_FOUND', 'Usuário não encontrado.');
      const updated: UserRow = { ...row, name, login: loginName, role, cityId: role === 'local' ? cityId : undefined };
      if ((payload.user as { active?: boolean }).active === false && row.active) {
        updated.active = false;
        ctx.ports.repos.sessions.deleteByUserId(row.id); // revoke on deactivation (spec §6)
      } else if ((payload.user as { active?: boolean }).active === true) updated.active = true;
      ctx.ports.repos.users.update(updated);
      audit(ctx.ports, ctx.user.id, 'users.save', 'Users', updated.id);
      return { user: toSessionUser(updated) };
    }
    const tempPassword = generateTempPassword(ctx.ports);
    const base: UserRow = {
      id: ctx.ports.uuid(), name, login: loginName, role,
      cityId: role === 'local' ? cityId : undefined, active: true, mustChangePassword: true,
      createdAt: ctx.ports.now().toISOString(),
      passwordHash: '', salt: '', hashIterations: 0, failedAttempts: 0,
    };
    const row = applyNewPassword(ctx.ports, base, tempPassword);
    ctx.ports.repos.users.insert(row);
    audit(ctx.ports, ctx.user.id, 'users.create', 'Users', row.id);
    return { user: toSessionUser(row), tempPassword };
  });
}
export function resetPassword(ctx: Ctx, payload: { userId: string }): { tempPassword: string } {
  const row = ctx.ports.repos.users.byId(requireString(payload.userId, 'usuário'));
  if (!row) fail('NOT_FOUND', 'Usuário não encontrado.');
  const tempPassword = generateTempPassword(ctx.ports);
  ctx.ports.lock(() => {
    ctx.ports.repos.users.update(applyNewPassword(ctx.ports, row, tempPassword));
    ctx.ports.repos.sessions.deleteByUserId(row.id);
  });
  audit(ctx.ports, ctx.user.id, 'users.resetPassword', 'Users', row.id);
  return { tempPassword };
}
```

- [ ] **Step 3: Create `src/server/api/registry.ts`** and register:

```ts
import { register, assertCityScope } from './dispatcher';
import * as md from '../services/masterdata';
// later tasks append their imports/registrations here

register('cities.list', 'local', (ctx) => md.listCities(ctx));
register('cities.save', 'admin', (ctx, p) => md.saveCity(ctx, p as never));
register('departments.list', 'local', (ctx) => md.listDepartments(ctx));
register('departments.save', 'admin', (ctx, p) => md.saveDepartment(ctx, p as never));
register('checklistItems.list', 'regional', (ctx, p) => md.listChecklistItems(ctx, (p ?? {}) as never));
register('checklistItems.save', 'admin', (ctx, p) => md.saveChecklistItem(ctx, p as never));
register('checklistItems.importPaste', 'admin', (ctx, p) => md.importPaste(ctx, p as never));
register('users.list', 'admin', (ctx) => md.listUsers(ctx));
register('users.save', 'admin', (ctx, p) => md.saveUser(ctx, p as never));
register('users.resetPassword', 'admin', (ctx, p) => md.resetPassword(ctx, p as never));
export { assertCityScope };
```

- [ ] **Step 4: Run** — `npm run test` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "Add master-data services: cities, departments, catalog import, users"`

---

### Task 10: Visit services

**Files:**
- Create: `src/server/services/visits.ts`
- Modify: `src/server/api/registry.ts` (register visits.* / visitDepartments.* except PDFs)
- Test: `test/visits.test.ts`

**Interfaces:**
- Produces: `listVisits(ctx, {cityId?, period?})` (local → own city forced), `getVisit(ctx, {id}): {visit, departments}` (assertCityScope), `saveVisit(ctx, {visit})` — create: validates period/date/active city, unique (cityId, period) → `CONFLICT 'Já existe uma visita desta cidade nesta competência.'` with `details: {existingVisitId}`; update: `CONFLICT` if changing cityId/period while departments exist; `deleteVisit(ctx, {id})` — `CONFLICT` if any VisitDepartments reference it; `saveVisitDepartment(ctx, {visitDepartment})` — **upsert by (visitId, departmentId)**, denormalizes cityId/period from visit, counts optional ints ≥ 0 (all-or-none NOT required), department must be active for NEW rows; `markDone(ctx, {id})` sets completedAt/By (idempotent); `deleteVisitDepartment(ctx, {id})` — `CONFLICT` if findings or reviews reference it.

- [ ] **Step 1: Failing tests** — `test/visits.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import type { Ctx } from '../src/server/services/ports';
import {
  saveVisit, deleteVisit, saveVisitDepartment, markDone, deleteVisitDepartment, getVisit,
} from '../src/server/services/visits';

let p: ReturnType<typeof fakePorts>;
const ctx = (role: 'admin' | 'regional' | 'local' = 'regional', cityId?: string): Ctx =>
  ({ ports: p, user: { id: 'u1', name: 'X', login: 'x', role, cityId, mustChangePassword: false } });

beforeEach(() => {
  p = fakePorts();
  p.repos.cities.insert({ id: 'c1', name: 'Sumaré', active: true });
  p.repos.departments.insert({ id: 'd1', name: 'Informática', active: true });
});

describe('saveVisit', () => {
  it('creates with validation and blocks duplicates per (city, period)', () => {
    const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
    expect(v.id).toBeTruthy();
    expect(() => saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-26' } }))
      .toThrow(/já existe/i);
    expect(() => saveVisit(ctx(), { visit: { cityId: 'c1', period: '13/2026', mainDate: '2026-04-25' } }))
      .toThrow(); // invalid period
  });
  it('rejects city/period change once departments exist', () => {
    const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
    saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd1' } });
    expect(() => saveVisit(ctx(), { visit: { id: v.id, cityId: 'c1', period: '10/2026', mainDate: '2026-04-25' } }))
      .toThrow(/CONFLICT|competência|cidade/i);
  });
});

describe('visitDepartments', () => {
  it('upserts by (visitId, departmentId) and denormalizes city/period', () => {
    const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
    const a = saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd1', regionalReps: 'Jhonny' } });
    expect(a.cityId).toBe('c1');
    expect(a.period).toBe('04/2026');
    const b = saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd1', countYes: 19, countNo: 0, countYesWithCaveats: 0, countNotApplicable: 3 } });
    expect(b.id).toBe(a.id);            // upsert, same row
    expect(b.regionalReps).toBe('Jhonny'); // merge keeps earlier fields
    expect(b.countYes).toBe(19);
    expect(p.repos.visitDepartments.rows).toHaveLength(1);
  });
  it('markDone stamps and stays editable; still callable after done', () => {
    const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
    const vd = saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd1' } });
    const done = markDone(ctx(), { id: vd.id });
    expect(done.completedAt).toBeTruthy();
    const after = saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd1', countYes: 10 } });
    expect(after.countYes).toBe(10);
    expect(after.completedAt).toBeTruthy(); // not cleared
  });
  it('local users cannot read another city visit', () => {
    const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
    expect(() => getVisit(ctx('local', 'c-other'), { id: v.id })).toThrow(/restrito/i);
    expect(getVisit(ctx('local', 'c1'), { id: v.id }).visit.id).toBe(v.id);
  });
});

describe('deletes (admin correction path)', () => {
  it('visit delete blocked while departments exist; department delete blocked with findings/reviews', () => {
    const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
    const vd = saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd1' } });
    expect(() => deleteVisit(ctx('admin'), { id: v.id })).toThrow();
    p.repos.findings.insert({
      id: 'f1', code: 'A-0001', visitDepartmentId: vd.id, visitId: v.id, cityId: 'c1',
      departmentId: 'd1', period: '04/2026', itemText: 'x', severity: 'high', response: 'no',
      status: 'open', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '',
    });
    expect(() => deleteVisitDepartment(ctx('admin'), { id: vd.id })).toThrow();
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `src/server/services/visits.ts`** — mirror the tested behaviors. Deletion physically removes the row: extend `Table<T>` and fakes with `remove(id: string): void` (add to `ports.ts`, `fakes.ts`, and `sheets.ts` — `sheet.deleteRow(idx)`); upsert = find `visitDepartments.all()` row matching (visitId, departmentId), merge defined payload fields over it. Register in `registry.ts`:

```ts
register('visits.list', 'local', (ctx, p) => visits.listVisits(ctx, (p ?? {}) as never));
register('visits.get', 'local', (ctx, p) => visits.getVisit(ctx, p as never));
register('visits.save', 'regional', (ctx, p) => visits.saveVisit(ctx, p as never));
register('visits.delete', 'admin', (ctx, p) => visits.deleteVisit(ctx, p as never));
register('visitDepartments.save', 'regional', (ctx, p) => visits.saveVisitDepartment(ctx, p as never));
register('visitDepartments.markDone', 'regional', (ctx, p) => visits.markDone(ctx, p as never));
register('visitDepartments.delete', 'admin', (ctx, p) => visits.deleteVisitDepartment(ctx, p as never));
```

- [ ] **Step 3: Run tests** → PASS. **Step 4: Commit** — `git commit -am "Add visit and visit-department services with upsert and delete guards"`

---

### Task 11: Findings service

**Files:**
- Create: `src/server/services/findings.ts`
- Modify: `src/server/api/registry.ts`
- Test: `test/findings.test.ts`

**Interfaces:**
- Produces: `saveFinding(ctx, {finding, force?})`, `listFindings(ctx, {filters?})`, `getFinding(ctx, {id})`, `updateStatus(ctx, {id, status, note})`, `nextCode(findings): string` (max numeric suffix + 1 → `A-0001` zero-padded 4), `applyTransition(finding, to, {system, nowIso, userId}): Finding` (pure — reused by Task 12).
- Rules (spec §5/§7): create → status forced `open`, code generated under lock, duplicate guard: unresolved finding with same (cityId, departmentId, itemRef) → `CONFLICT` with `details: {existingFindingId}` unless `force`; update → status/code/denormalized ids ignored (descriptive fields only: itemRef, section, itemText, severity, response, considerations, deadline, assignee); manual transitions per table incl. reopen; `resolved` sets resolvedAt/By, leaving `resolved` clears them; every manual transition appends a `status_change` FindingReview (note required); overdue filter = `deadline < today && unresolved`.

- [ ] **Step 1: Failing tests** — `test/findings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import type { Ctx } from '../src/server/services/ports';
import { saveVisit, saveVisitDepartment } from '../src/server/services/visits';
import { saveFinding, listFindings, updateStatus, nextCode } from '../src/server/services/findings';
import type { Finding } from '../src/shared/types';

let p: ReturnType<typeof fakePorts>;
let vdId: string;
const ctx = (role: 'admin' | 'regional' | 'local' = 'regional', cityId?: string): Ctx =>
  ({ ports: p, user: { id: 'u1', name: 'X', login: 'x', role, cityId, mustChangePassword: false } });

beforeEach(() => {
  p = fakePorts();
  p.repos.cities.insert({ id: 'c1', name: 'Sumaré', active: true });
  p.repos.departments.insert({ id: 'd1', name: 'Informática', active: true });
  const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
  vdId = saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd1' } }).id;
});
const newFinding = (over: Record<string, unknown> = {}) => saveFinding(ctx(), {
  finding: { visitDepartmentId: vdId, itemRef: '4.5', section: 'ROTINAS', itemText: 'Backup?', severity: 'high', response: 'no', ...over } as never,
});

describe('saveFinding', () => {
  it('creates open with sequential code and denormalized keys', () => {
    const f1 = newFinding();
    expect(f1).toMatchObject({ status: 'open', code: 'A-0001', cityId: 'c1', departmentId: 'd1', period: '04/2026' });
    const f2 = newFinding({ itemRef: '4.6' });
    expect(f2.code).toBe('A-0002');
  });
  it('duplicate unresolved itemRef needs force', () => {
    newFinding();
    expect(() => newFinding()).toThrow(/já existe/i);
  });
  it('update touches descriptive fields only', () => {
    const f = newFinding();
    const updated = saveFinding(ctx(), { finding: { id: f.id, itemText: 'Backup diário?', status: 'resolved', code: 'HACK' } as never });
    expect(updated.itemText).toBe('Backup diário?');
    expect(updated.status).toBe('open');
    expect(updated.code).toBe('A-0001');
  });
});

describe('duplicate force path', () => {
  it('force=true allows the duplicate', () => {
    newFinding();
    const dup = saveFinding(ctx(), {
      finding: { visitDepartmentId: vdId, itemRef: '4.5', section: 'ROTINAS', itemText: 'De novo', severity: 'high', response: 'no' } as never,
      force: true,
    });
    expect(dup.code).toBe('A-0002');
  });
});

describe('updateStatus', () => {
  it('walks the allowed table, requires note, records status_change review', () => {
    const f = newFinding();
    const r = updateStatus(ctx(), { id: f.id, status: 'in_treatment', note: 'tratando' });
    expect(r.status).toBe('in_treatment');
    const resolved = updateStatus(ctx(), { id: f.id, status: 'resolved', note: 'ok' });
    expect(resolved.resolvedAt).toBeTruthy();
    const reopened = updateStatus(ctx(), { id: f.id, status: 'open', note: 'voltou' });
    expect(reopened.resolvedAt).toBeUndefined();
    expect(p.repos.findingReviews.rows.filter(x => x.type === 'status_change')).toHaveLength(3);
    expect(() => updateStatus(ctx(), { id: f.id, status: 'resolved', note: '' })).toThrow(/obrigat/i);
    expect(() => updateStatus(ctx(), { id: f.id, status: 'cancelled', note: 'x' })).not.toThrow();
    expect(() => updateStatus(ctx(), { id: f.id, status: 'in_treatment', note: 'x' })).toThrow(); // cancelled → in_treatment not allowed
  });
});

describe('listFindings filters', () => {
  it('city scope for local + overdue computed', () => {
    newFinding({ deadline: '2026-07-01' });      // overdue (today = 2026-07-09)
    newFinding({ itemRef: '4.6', deadline: '2026-12-01' });
    expect(listFindings(ctx(), { filters: { overdue: true } })).toHaveLength(1);
    expect(listFindings(ctx('local', 'c1'), {})).toHaveLength(2);
    expect(listFindings(ctx('local', 'c-other'), {})).toHaveLength(0);
    expect(listFindings(ctx(), { filters: { text: 'backup' } })).toHaveLength(2); // case-insensitive text over itemText+considerations+code
  });
});

describe('nextCode', () => {
  it('pads and continues from max', () => {
    expect(nextCode([])).toBe('A-0001');
    expect(nextCode([{ code: 'A-0009' } as Finding, { code: 'A-0347' } as Finding])).toBe('A-0348');
  });
});
```

Note: remove the sanity-placeholder line in the duplicate test — covered by the `force path` block.

- [ ] **Step 2: Implement** — transitions as data (pure, exported for Task 12):

```ts
const MANUAL_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  open: ['in_treatment', 'resolved', 'cancelled'],
  in_treatment: ['open', 'resolved', 'cancelled'],   // open↔in_treatment both manual
  resolved: ['open'],
  cancelled: ['open'],
};
export function applyTransition(f: Finding, to: FindingStatus, meta: { nowIso: string; userId: string }): Finding {
  const next = { ...f, status: to, updatedAt: meta.nowIso, updatedBy: meta.userId };
  if (to === 'resolved') { next.resolvedAt = meta.nowIso; next.resolvedBy = meta.userId; }
  else { next.resolvedAt = undefined; next.resolvedBy = undefined; }
  return next;
}
```

`in_treatment → open` manual: allowed (mirror of partial mistake). Register: `findings.list`/`findings.get` minRole `local` (city-scoped inside), `findings.save`/`findings.updateStatus` minRole `regional`.

- [ ] **Step 3: Run** → PASS. **Step 4: Commit** — `git commit -am "Add findings service: codes, duplicate guard, transitions, filters"`

---

### Task 12: Review queue & finding reviews

**Files:**
- Create: `src/server/services/reviews.ts`
- Modify: `src/server/api/registry.ts`
- Test: `test/reviews.test.ts`

**Interfaces:**
- Produces: `reviewQueue(ctx, {visitId, departmentId}): ReviewQueueItem[]`; `saveReview(ctx, {findingId, visitId, result, notes?}): FindingReview`.
- Rules (spec §5/§7): queue = unresolved findings of the visit's city+department **excluding** findings originating in this visit, **plus** findings already reviewed in this visit regardless of status; each item carries `existingReview`. saveReview: upsert per (findingId, visitId); notes required for `partial`/`not_resolved`; effects: `resolved`→resolved (+resolvedAt/By), `partial`→in_treatment, `not_resolved`→unchanged; correction recomputes: re-save with different result recomputes status from the new result (leaving resolved clears resolvedAt/By); NEW review on resolved/cancelled finding (no existing review this visit) → `CONFLICT`.

- [ ] **Step 1: Failing tests** — `test/reviews.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import type { Ctx } from '../src/server/services/ports';
import { saveVisit, saveVisitDepartment } from '../src/server/services/visits';
import { saveFinding, updateStatus } from '../src/server/services/findings';
import { reviewQueue, saveReview } from '../src/server/services/reviews';

let p: ReturnType<typeof fakePorts>;
let visit1: string, visit2: string, vd1: string, vd2: string, f1: string, f2: string;
const ctx = (): Ctx => ({ ports: p, user: { id: 'u1', name: 'X', login: 'x', role: 'regional', mustChangePassword: false } });

beforeEach(() => {
  p = fakePorts();
  p.repos.cities.insert({ id: 'c1', name: 'Sumaré', active: true });
  p.repos.departments.insert({ id: 'd1', name: 'Informática', active: true });
  const v1 = saveVisit(ctx(), { visit: { cityId: 'c1', period: '10/2025', mainDate: '2025-10-26' } });
  visit1 = v1.id;
  vd1 = saveVisitDepartment(ctx(), { visitDepartment: { visitId: visit1, departmentId: 'd1' } }).id;
  f1 = saveFinding(ctx(), { finding: { visitDepartmentId: vd1, itemRef: '4.5', section: 'R', itemText: 'Backup?', severity: 'high', response: 'no' } as never }).id;
  f2 = saveFinding(ctx(), { finding: { visitDepartmentId: vd1, itemRef: '4.6', section: 'R', itemText: 'AV?', severity: 'medium', response: 'yes_with_caveats' } as never }).id;
  const v2 = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
  visit2 = v2.id;
  vd2 = saveVisitDepartment(ctx(), { visitDepartment: { visitId: visit2, departmentId: 'd1' } }).id;
});

describe('reviewQueue', () => {
  it('lists carry-over findings, excludes current-visit originals', () => {
    const fNew = saveFinding(ctx(), { finding: { visitDepartmentId: vd2, itemRef: '1.1', section: 'M', itemText: 'Novo', severity: 'low', response: 'no' } as never });
    const q = reviewQueue(ctx(), { visitId: visit2, departmentId: 'd1' });
    expect(q.map(i => i.finding.id).sort()).toEqual([f1, f2].sort());
    expect(q.map(i => i.finding.id)).not.toContain(fNew.id);
  });
  it('keeps items already reviewed this visit (with existingReview), even when resolved', () => {
    saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'resolved' });
    const q = reviewQueue(ctx(), { visitId: visit2, departmentId: 'd1' });
    const item = q.find(i => i.finding.id === f1)!;
    expect(item.existingReview?.result).toBe('resolved');
    expect(item.finding.status).toBe('resolved');
  });
});

describe('saveReview', () => {
  it('applies effects: resolved / partial / not_resolved', () => {
    saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'resolved' });
    expect(p.repos.findings.byId(f1)!.status).toBe('resolved');
    expect(p.repos.findings.byId(f1)!.resolvedAt).toBeTruthy();
    saveReview(ctx(), { findingId: f2, visitId: visit2, result: 'partial', notes: 'metade' });
    expect(p.repos.findings.byId(f2)!.status).toBe('in_treatment');
  });
  it('notes required for partial/not_resolved, optional for resolved', () => {
    expect(() => saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'partial' })).toThrow(/observa/i);
    expect(() => saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'resolved' })).not.toThrow();
  });
  it('upserts and recomputes on correction (resolved → not_resolved reopens)', () => {
    saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'resolved' });
    saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'not_resolved', notes: 'engano' });
    const f = p.repos.findings.byId(f1)!;
    expect(f.status).toBe('open');
    expect(f.resolvedAt).toBeUndefined();
    expect(p.repos.findingReviews.rows.filter(r => r.findingId === f1 && r.type === 'visit_review')).toHaveLength(1);
  });
  it('NEW review on already-resolved finding is CONFLICT', () => {
    updateStatus(ctx(), { id: f1, status: 'resolved', note: 'baixa manual' });
    expect(() => saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'not_resolved', notes: 'x' }))
      .toThrow(/resolvid|CONFLICT/i);
  });
});
```

- [ ] **Step 2: Implement `src/server/services/reviews.ts`** using `applyTransition` from Task 11; recompute on correction: `not_resolved` correction → transition back to the finding's pre-review state = `open` (spec: system transitions `resolved→open`/`resolved→in_treatment`). Register: both actions minRole `regional`.
- [ ] **Step 3: Run** → PASS. **Step 4: Commit** — `git commit -am "Add carry-over review queue and visit reviews with status recompute"`

---

### Task 13: Dashboard summary

**Files:**
- Create: `src/server/services/dashboard.ts`
- Modify: `src/server/api/registry.ts`
- Test: `test/dashboard.test.ts`

**Interfaces:**
- Produces: `dashboardSummary(ctx, {cityId?}): DashboardSummary` (shape from Task 2).
- Rules: local users forced to own city; `openByCity` sorted by open desc (regional view; single city for local); `citiesVisitedInSemester` counts active cities with a visit whose `semesterOf(period) === currentPeriodSemester(now)`; `latestVisits` = 5 most recent by mainDate with `done`/`total` (total = VisitDepartments rows of the visit; done = completed) and `missingPdfOrCounts` (completed but `!pdfFileId || countYes === undefined`); `resolutionRateSemester` only when a single city is in scope: resolved visit-reviews ÷ all visit-reviews of that city in the current semester (undefined when no reviews).

- [ ] **Step 1: Write tests** — seed: 2 cities, 1 dept; visit in `04/2026` (semester 2026-1) with vd done missing pdf; findings: 1 open+overdue high in c1, 1 in_treatment in c2, 1 resolved; reviews in current semester: 2 resolved + 2 not_resolved for c1 → rate 0.5. Assert every field (exact numbers). Assert local ctx gets only own city and a rate. (Write the full test file following the patterns of Tasks 10–12.)
- [ ] **Step 2: Implement** pure aggregation over `repos.*.all()`.
- [ ] **Step 3: Register** `dashboard.summary` minRole `local`. Run → PASS.
- [ ] **Step 4: Commit** — `git commit -am "Add dashboard summary aggregation"`

---

### Task 14: PDF upload/download

**Files:**
- Create: `src/server/services/pdfs.ts`, `src/server/repositories/files.ts`
- Modify: `src/server/api/registry.ts`
- Test: `test/pdfs.test.ts`

**Interfaces:**
- Produces: `uploadPdf(ctx, {id, fileName, base64})` (regional+; ≤ 10 MB decoded — check `base64.length * 3/4 ≤ 10_485_760`; must be `.pdf` name; stores via `ports.files.savePdf(periodFolderToken(vd.period), cityName, '<Department>.pdf', base64)`; saves pdfFileId/pdfUrl on the row); `downloadPdf(ctx, {visitDepartmentId})` (any role, `assertCityScope` against the vd's cityId; local users receive `{fileName, base64}` — never fileId/url; `NOT_FOUND` when no pdf attached).
- `src/server/repositories/files.ts` GAS impl: folder tree `pdfs/{YYYY-MM}/{city}` under `PDF_FOLDER_ID`, `Utilities.base64Decode`/`Encode`, `DriveApp.getFolderById`.

- [ ] **Step 1: Tests** — with fakes: upload happy path persists ids on the row; oversized base64 → VALIDATION; wrong extension → VALIDATION; download by local of another city → FORBIDDEN; download without pdf → NOT_FOUND; response contains no `fileId`/`url` keys. (Write the full file.)
- [ ] **Step 2: Implement service + GAS files repo.** Register `visitDepartments.uploadPdf` (regional), `visitDepartments.downloadPdf` (local).
- [ ] **Step 3: Run** → PASS. **Step 4: Commit** — `git commit -am "Add PDF upload/download with city scoping"`

---

### Task 15: GAS entrypoints, runtime wiring, setup & triggers

**Files:**
- Rewrite: `src/server/gas/main.ts`; Create: `src/server/gas/runtime.ts`
- Test: `test/entryguard.test.ts` (pure guard logic only)

**Interfaces:**
- `runtime.ts` produces `gasPorts(): Ports` — wires `sheetsRepos(SpreadsheetApp.openById(props.SPREADSHEET_ID))`, `filesRepo`, `now/todayIso` (America/Sao_Paulo via `Utilities.formatDate`), `uuid: Utilities.getUuid`, `randomToken: () => Utilities.getUuid() + Utilities.getUuid()`, `lock: LockService.getScriptLock().waitLock(30000)` wrapper, `invalidateCache: CacheService.getScriptCache().removeAll(keys)`.
- `main.ts` produces globals — ONLY these (spec §3):

```ts
import '../api/registry';
import { dispatch } from '../api/dispatcher';
import { gasPorts } from './runtime';
import type { ApiRequest, Envelope } from '../../shared/types';

function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('SAVA')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function api(request: ApiRequest): Envelope<unknown> {
  return dispatch(gasPorts(), request);
}
/** Editor/trigger-only guard (spec §3): anonymous web callers have empty active user. */
function assertOwnerContext(): void {
  const active = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  if (!active || active !== effective) throw new Error('setup/triggers: owner context required');
}
function setup(): void {
  assertOwnerContext();
  // create missing tabs with SHEET_COLUMNS headers; seed 21 departments (spec §5 list)
  // and the first admin (login 'sava.admin', temp password logged ONCE via Logger.log);
  // idempotent: existing tabs/rows untouched. Also ensures daily purge + weekly backup triggers exist.
}
function purgeSessions(): void { assertOwnerContext(); /* sessions.deleteExpired(now) under lock */ }
function weeklyBackup(): void { assertOwnerContext(); /* copy spreadsheet to BACKUP_FOLDER_ID, keep last 8 */ }

const g = globalThis as Record<string, unknown>;
g.doGet = doGet; g.api = api; g.setup = setup;
g.purgeSessions = purgeSessions; g.weeklyBackup = weeklyBackup;
```

Implement the seed fully (departments list verbatim from spec §5; admin created via `applyNewPassword`). Trigger creation: `ScriptApp.newTrigger('purgeSessions').timeBased().everyDays(1)`, `newTrigger('weeklyBackup').timeBased().everyWeeks(1)` — only when absent (`ScriptApp.getProjectTriggers()`).

- [ ] **Step 1:** Extract the pure part of the guard (`ownerContextOk(active: string, effective: string): boolean`) into `runtime.ts`; test: empty active → false; differing → false; matching non-empty → true.
- [ ] **Step 2:** Implement both files. `npm run build` → verify `dist/server.js` defines exactly the 5 globals (grep `globalThis`); typecheck clean.
- [ ] **Step 3: Commit** — `git commit -am "Add GAS entrypoints: doGet, api, guarded setup and triggers"`

---

### Task 16: Environment bootstrap & smoke checklist

**Files:**
- Create: `knowledge/SMOKE_TEST.md`, update `README.md` setup section, update `CLAUDE.md` status line.

- [ ] **Step 1: Write `knowledge/SMOKE_TEST.md`** — numbered manual checklist for the dev environment (run after every `deploy:dev` before promoting to prod):
  1. `setup()` from the editor → tabs created, 21 departments, admin logged temp password (run twice → idempotent, no duplicates).
  2. Login flow: wrong password ×5 → generic error every time; 6th correct attempt still generic (locked); reset via editor/sheet → login works; forced password change gate (any other action → FORBIDDEN).
  3. Visit lifecycle: create (confirm dialog), duplicate (city, period) → conflict message; department participation upsert; review queue carry-over from a seeded previous visit; correction of a review; new finding with duplicate-itemRef warning; markDone; badge on missing PDF.
  4. PDF: upload 100 KB pdf → appears in Drive `pdfs/2026-04/<city>/`; download as `local` of that city works; other city → error.
  5. Negative RPC (spec §13): from browser devtools `google.script.run.validateSession(...)` and `google.script.run.setup()` → both fail.
  6. Dashboard numbers match seeded data by hand-count.
  7. Backup trigger run → copy exists in `backups/`, ≤ 8 kept.
- [ ] **Step 2:** README: real setup steps (create 2 GAS projects + spreadsheets + Drive folders, Script Properties table, `clasp login`, paste scriptIds into `.clasp.{dev,prod}.json`, `PROD_DEPLOYMENT_ID` env var). CLAUDE.md status → "Server implemented (Plan 1); client next (Plan 2)".
- [ ] **Step 3: Commit** — `git commit -am "Add smoke-test checklist and environment bootstrap docs"`

---

## Execution notes

- Tasks 1→8 are strictly sequential. Tasks 9, 10 can run in parallel after 8; Task 11 needs 10; Tasks 12, 13 need 11; Task 14 needs 10; Tasks 15–16 last.
- Every task: `npm run test && npm run typecheck` green before its commit.
- Plan 2 (client) will be written after Task 16, importing `shared/types.ts`/`shared/actions.ts` and following `knowledge/mockups/DESIGN_REFERENCE.md`.
