# SAVA v1 — Plan 2: React Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete SAVA SPA (React + TypeScript) over the approved mockups, wired to the Plan 1 server through the typed action registry, with a fully mocked dev mode.

**Architecture:** Single-page app bundled by Vite into one HTML file served by GAS `doGet()`. No router library (GAS iframe, no deep links): navigation is a `Screen` union in an app context. All server calls go through one typed wrapper over `google.script.run`; in `import.meta.env.DEV` the wrapper swaps in an in-browser mock backed by rich fixtures with simulated ~600 ms latency (loading states must be honest). Styling: CSS custom properties (design tokens) + plain component CSS — no framework.

**Tech Stack:** React 19, TypeScript 5, Vite (+ vite-plugin-singlefile), vitest + @testing-library/react + jsdom for behavioral tests.

**Sources of truth (read before any task):**
- Visual: `knowledge/mockups/SAVA_JORNADA_VISUAL.dc.html` (artboard line ranges below) distilled in `knowledge/mockups/DESIGN_REFERENCE.md` (tokens §1, components §2, screens §3, nav §4, microcopy §5).
- Behavior: `knowledge/2026-07-09_SAVA_DESIGN.md` (spec §7 actions, §8 screens) + `src/shared/actions.ts` (the typed contract — NEVER call the server outside it).
- Divergence decisions already adjudicated: `knowledge/mockups/MOCKUP_DIVERGENCES.md` (e.g. no Export button, no live filter counts, PDF via in-app action with spinner, Looker link role-gated).

| Mockup section | Artboards | Lines |
|---|---|---|
| Mini design system | sheet | 41–156 |
| Acesso | A1–A5 | 157–282 |
| Painel e Indicadores (mobile) | B1–B3 | 283–526 |
| Apontamentos | C1–C5 | 527–863 |
| Registro de visita (fluxo) | D1–D6 | 864–1190 |
| Administração | E1–E6 | 1191–1470 |
| Estados do sistema | F1–F3 | 1471–1549 |
| Desktop 1280 | DT1–DT6 | 1550–1929 |

## Global Constraints

- All user-facing strings in **pt-BR**, exclusively from `src/client/strings/pt.ts` — zero hardcoded UI text in components (spec hard rule).
- Every server call is typed through `Actions` from `src/shared/actions.ts`; payload/result types never widened.
- Every mutating button shows its saving state (`t.common.saving`); every list shows skeletons while loading; every screen has its empty state (DESIGN_REFERENCE §2). ~1s latency is the design premise.
- `localStorage` access ONLY via the safe wrapper (try/catch + in-memory fallback, spec §6 WebKit note).
- `UNAUTHORIZED` from any call → clear session → login screen with `t.auth.sessionExpired` toast (F2 artboard).
- Role gating in UI is UX only (server enforces): `local` = read-only + own city; Administração only for `admin`; Registrar visita/ações de escrita only `regional`+.
- Mobile-first: bottom nav < 900px, sidebar ≥ 900px; breakpoints and colors ONLY via tokens.css custom properties.
- `npm run test && npm run typecheck && npm run build` green before every commit; build stays a single self-contained `dist/index.html`.
- Visual acceptance per screen task: run `npm run dev` and compare against the artboard(s) — layout, states, copy must match the mockup within reason (exact px values come from DESIGN_REFERENCE).

## File Structure (locked by this plan)

```
src/client/
  main.tsx                 # mount <App/>
  App.tsx                  # providers + screen switch (Task 2)
  styles/tokens.css        # design tokens (Task 1)
  styles/base.css          # reset, typography, utility classes (Task 1)
  strings/pt.ts            # ALL pt-BR copy, typed (Task 1)
  lib/storage.ts           # safeStorage get/set/remove with in-memory fallback (Task 1)
  lib/gas.ts               # callApi typed wrapper: prod google.script.run / dev mock (Task 1)
  lib/mock/server.ts       # dev mock dispatcher implementing Actions (Task 1)
  lib/mock/fixtures.ts     # seed data: cities, departments, catalog, users, visits, findings, reviews (Task 1)
  state/session.ts         # SessionProvider: token, user, login/logout, UNAUTHORIZED handling (Task 2)
  state/nav.ts             # NavProvider: Screen union + go() (Task 2)
  state/toasts.tsx         # ToastProvider + useToast (Task 2)
  hooks/useApi.ts          # useApiCall/useApiMutation: loading/error/toast plumbing (Task 2)
  components/*.tsx         # Chrome, NavBar, SideBar, Card, Badge, Button, Field, Select, Chips,
                           # Dialog, Skeleton, EmptyState, StatusBadge, SeverityBadge (Tasks 2+, per need)
  screens/Login.tsx        # + ChangePassword (Task 3)
  screens/Dashboard.tsx    # Painel (Task 4)
  screens/Findings.tsx     # lista + filtros (Task 5)
  screens/FindingDetail.tsx# detalhe + diálogos + PDF (Task 6)
  screens/Visit.tsx        # fluxo de campo A–F (Task 7)
  screens/Admin.tsx        # usuários/cidades/departamentos/catálogo (Task 8)
  screens/Indicators.tsx   # indicadores (Task 9)
test/client/*.test.tsx     # RTL behavioral tests per task
```

---

### Task 1: Client foundation — tokens, strings, storage, typed RPC + dev mock

**Files:** `styles/tokens.css`, `styles/base.css`, `strings/pt.ts`, `lib/storage.ts`, `lib/gas.ts`, `lib/mock/server.ts`, `lib/mock/fixtures.ts`; modify `package.json` (add devDeps `@testing-library/react`, `@testing-library/user-event`, `jsdom`), `vitest.config.ts` (jsdom environment for `test/client/**`), `src/client/index.html` (fonts: IBM Plex Sans/Mono via Google Fonts `<link>` — works in dev; NOTE for prod the GAS iframe allows external fonts, keep the link). Test: `test/client/gas.test.ts`, `test/client/storage.test.ts`.

**Interfaces (produces — every later task consumes):**

```ts
// lib/gas.ts
export class ApiError extends Error { constructor(public code: ErrorCode, message: string, public details?: unknown) { super(message); } }
export async function callApi<K extends ActionName>(action: K, payload: Actions[K]['p']): Promise<Actions[K]['r']>;
// - reads token via getToken() (set by session state, Task 2 wires it)
// - prod: google.script.run.withSuccessHandler/withFailureHandler wrapping api({token, action, payload})
// - envelope {ok:false} → throw ApiError(code, message, details)
// - dev (import.meta.env.DEV): await mockApi(action, payload, token) with 400–800 ms random delay
export function setTokenProvider(fn: () => string | undefined): void;

// lib/storage.ts
export const safeStorage: { get(k: string): string | undefined; set(k: string, v: string): void; remove(k: string): void };
// try/catch around localStorage; Map fallback when unavailable (WebKit iframe)

// strings/pt.ts — nested typed object `t`; seed ALL microcopy from DESIGN_REFERENCE §5 verbatim
// (login labels, nav labels, status/severity/response labels, review results, empty states,
//  saving/loading, dialog titles, smoke-visible errors). Enum→label maps:
export const statusLabel: Record<FindingStatus, string>;   // open→'Aberto', in_treatment→'Em tratamento', resolved→'Resolvido', cancelled→'Cancelado'
export const severityLabel: Record<Severity, string>;      // high→'Alta', medium→'Média', low→'Baixa'
export const responseLabel: Record<FindingResponse, string>; // no→'Não', yes_with_caveats→'Sim, com ressalvas'
```

**Mock requirements (`lib/mock/*`):** implement the full `Actions` surface in-memory over the fixtures (same semantics as the real services where the UI depends on them: login `sava.admin`/`Sava1234` + a regional and a local user; reviewQueue carry-over; visitDepartments upsert; findings.save duplicate CONFLICT with force; dashboard.summary computed from fixtures). Fixtures: 6 cities, 21 departments (real names), ~12 catalog items for Informática, 2 past visits + 1 open visit, ~15 findings across statuses/severities/deadlines (some overdue), reviews history. The mock is the dev workhorse — screens are built against it.

**Steps:** (1) write failing tests: storage fallback behavior (mock a throwing localStorage), callApi dev-path resolves typed results and throws ApiError on mock failure envelope; (2) implement; (3) `npm run test && npm run typecheck` green; (4) commit `Add client foundation: tokens, strings, safe storage, typed RPC with dev mock`.

---

### Task 2: App shell — session, nav, chrome, toasts, primitives

**Files:** `state/session.ts`, `state/nav.ts`, `state/toasts.tsx`, `hooks/useApi.ts`, `App.tsx`, `main.tsx`, components `Chrome.tsx` (topbar: brand tile "S", screen title, user menu with nome/perfil + Alterar senha + Sair), `NavBar.tsx` (bottom, mobile), `SideBar.tsx` (desktop ≥ 900px), `Button.tsx` (primary/secondary/danger/loading/disabled), `Skeleton.tsx`, `EmptyState.tsx`, `Dialog.tsx`, `StatusBadge.tsx`, `SeverityBadge.tsx`, `Card.tsx`. Test: `test/client/shell.test.tsx`.

**Contracts:**
- `Screen` union: `{name:'dashboard'} | {name:'findings', filters?: FindingFilters} | {name:'finding', id: string} | {name:'visit', visitId?: string} | {name:'admin'} | {name:'indicators'} | {name:'login'}`.
- Nav sections per role (DESIGN_REFERENCE §4): regional → Painel/Apontamentos/Registrar visita/Indicadores; admin → + Administração (mobile: "Mais"); local → Painel/Apontamentos/Indicadores.
- `SessionProvider`: restores token from safeStorage key `sava.token` on boot → `auth.me` → user or cleared session; exposes `login(login, password)` (stores token, routes to change-password when `mustChangePassword`), `logout()` (calls auth.logout best-effort, clears). Registers `setTokenProvider`. Any `ApiError` with code UNAUTHORIZED bubbling through `useApi` → `session.expire()` → login screen + toast `t.auth.sessionExpired`.
- `useApiCall(action, payload, deps)` → `{data, loading, error, reload}`; `useApiMutation(action)` → `{run, saving}`; both surface non-UNAUTHORIZED errors as toasts with the server's pt-BR message.
- App boot: full-screen brand spinner (F1) while restoring session.

**Behavioral tests (RTL + mock):** boot without token → Login; login as regional → bottom nav shows 4 items, no Administração; login as admin with mustChangePassword → ChangePassword gate first; UNAUTHORIZED mid-session → back to Login with toast. Visual check: chrome/topbar/nav vs DT1 sidebar (lines 1550–1620) and B1 bottom nav (283–370).

Commit: `Add app shell: session, navigation, chrome, toasts, UI primitives`.

---

### Task 3: Acesso — Login + troca de senha (A1–A5, lines 157–282)

**Files:** `screens/Login.tsx` (+ ChangePassword variant), CSS. Test: `test/client/login.test.tsx`.

**Behavior:** login form (usuário/senha, senha com show/hide), generic error banner on failure (server message verbatim), loading button. Forced change (A3): senha atual + nova + confirmação, client mirror of the policy (min 8, letra+número — same messages as server `checkPasswordPolicy`), mismatch error, success → toast + straight into the app. Change-password is also reachable from the user menu (same component, non-forced mode with cancel). Tests: wrong password shows the generic message; policy violations block submit with the right message; forced mode has no cancel; success path lands on dashboard. Visual vs A1–A5.

Commit: `Add login and password-change screens`.

---

### Task 4: Painel (B1 regional, B2 local — 283–470; DT1 — 1550–1740)

**Files:** `screens/Dashboard.tsx`, `components/KpiCard.tsx`, CSS. Test: `test/client/dashboard.test.tsx`.

**Behavior:** `dashboard.summary` on mount (skeletons while loading). Regional/admin: KPI cards (abertos, vencidos, criticidade alta, PDF/resumo pendentes), "Abertos por cidade" list (top rows + `ver todas` → Indicadores), "Últimas visitas" (progress `done/total`, badge falta PDF/resumo; tap → `{name:'visit', visitId}`), CTA "Registrar visita" (regional+, → visit screen). Local (B2): same layout scoped to own city + resolution-rate positive card when present. Tests with mock fixtures: regional sees N cities; local sees only own city and no CTA; card numbers match fixture-derived values; visit tap navigates. Visual vs B1/B2/DT1.

Commit: `Add dashboard screen`.

---

### Task 5: Apontamentos — lista + filtros (C1–C2 — 527–770; DT2 — 1620–1740)

**Files:** `screens/Findings.tsx`, `components/FilterSheet.tsx`, `components/FindingCard.tsx`, CSS. Test: `test/client/findings.test.tsx`.

**Behavior:** `findings.list` with `FindingFilters`; mobile card list / desktop table (same data, CSS-driven); filter sheet (C2): cidade (locked for local), departamento, status, competência, criticidade, resposta, "somente vencidos" toggle, busca por texto (client debounce 300 ms, server-side `text` filter); active-filter chips row with clear; "Aplicar filtros" WITHOUT live count (divergence B-7); overdue rows flagged loud (token `--overdue`); empty state (F1 copy). Card fields per C1: code, cidade, departamento, itemRef, resumo, criticidade, status, prazo. Tap → finding detail. Tests: filters compose into the payload correctly (spy on callApi); local's city select is locked; overdue toggle maps to `overdue: true`; empty state renders. Visual vs C1/C2/DT2.

Commit: `Add findings list with filters`.

---

### Task 6: Detalhe do apontamento (C3–C5 — 770–863; DT3 — 1740–1800)

**Files:** `screens/FindingDetail.tsx`, `components/Timeline.tsx`, `components/StatusDialog.tsx`, `components/ReviewDialog.tsx`, `components/PdfViewer.tsx`, CSS. Test: `test/client/findingDetail.test.tsx`.

**Behavior:** `findings.get` → header (code mono, status/severity badges), fields, **timeline** mixing visit reviews and status changes chronologically, visually differentiated (C3), each with autor/data/observação. Actions (regional+; hidden for local): Editar (reuses the finding form from Task 7 pre-filled; status/code immutable), **Mudar status** (C4: only transitions legal from current status per spec §5 table — mirror client-side; justificativa obrigatória; calls `findings.updateStatus`), **Registrar revisão** (C5: visit picker via `visits.list {cityId}`, resultado + observação with the same notes-required rule; calls `findingReviews.save`), **Ver/Baixar PDF**: `visitDepartments.downloadPdf` with pronounced loading (base64 → Blob → desktop: embed in dialog via object URL; mobile: trigger download link) — no external Drive link. Tests: local sees no action buttons; status dialog offers exactly the legal transitions from each status; note required blocks submit; PDF button renders loading then triggers blob flow (mock returns small base64). Visual vs C3–C5/DT3.

Commit: `Add finding detail with timeline, dialogs and PDF viewer`.

---

### Task 7: Registro de visita — fluxo de campo A–F (D1–D6 — 864–1190)

**Files:** `screens/Visit.tsx` (stepper container + per-step components `VisitStart`, `DeptGrid`, `Participation`, `ReviewQueue`, `NewFindings`, `FindingForm`), CSS. Test: `test/client/visit.test.tsx` (the largest suite).

**Behavior (spec §8.5 + D1–D6, every step persists immediately):**
- **A (D1/D2):** cidade+data+competência com confirmação explícita (D2 destaca cidade+competência); se já existe visita (CONFLICT details.existingVisitId ou visits.list match) → entra nela sem erro. Admin-only: excluir visita/departamento sem vínculos (menu overflow, confirm dialog).
- **B (D3):** grade de departamentos ativos, 3 estados (concluído ✓ / iniciado / não iniciado) + badge "falta PDF/resumo" em concluídos incompletos; reabrir tocando; derived from `visits.get` departments.
- **C (D4):** participação — representantes regional/cidade, data própria opcional, 4 contadores (numéricos, adiáveis), upload do PDF (file input accept application/pdf, ≤10 MB client guard, base64 via FileReader → `visitDepartments.uploadPdf`, progress button) também adiável. Save = `visitDepartments.save` upsert.
- **D (D5):** fila `findings.reviewQueue` — cards com decisão em um toque (Resolvida/Não resolvida/Parcial), observação expansível (obrigatória exceto Resolvida — validação client igual ao server), resposta anterior pré-selecionada quando existente (upsert corrige); cada decisão salva na hora (`findingReviews.save`), estado "salvando" por card.
- **E (D6):** novos apontamentos — dropdown do catálogo (`checklistItems.list {departmentId}` — itemRef+texto, seção/criticidade auto), fallback digitação livre (campos manuais), resposta, considerações, prazo/responsável opcionais; duplicate CONFLICT → confirm dialog reenvia com `force: true`.
- **F:** "Concluir departamento" → `visitDepartments.markDone` → volta à grade.

**Tests:** stepper navigation; existing-visit reopen path; review decision posts correct payload and pre-selects existing answers; notes rule; duplicate→force flow; markDone updates grid state; deferrable counts/PDF don't block conclusion. Visual vs D1–D6.

Commit: `Add visit registration field flow`.

---

### Task 8: Administração (E1–E6 — 1191–1470; DT4–DT5 — 1800–1880)

**Files:** `screens/Admin.tsx` (tabs: Usuários/Cidades/Departamentos/Catálogo), `components/UserForm.tsx`, `components/TempPasswordDialog.tsx`, `components/ImportPreview.tsx`, CSS. Test: `test/client/admin.test.tsx`.

**Behavior:** Usuários (E2–E4): list with role badges + ativo; create/edit form (nome, login, perfil, cidade only when local, ativo); create and reset show the temp password ONCE with copy button (E4 mockup `7kQ-m4Xz`). Cidades/Departamentos (E5): simple CRUD + activate/deactivate with warning copy when deactivating. Catálogo (E6): department select, paste-import textarea → `checklistItems.importPaste` preview table classifying novo/alterado/inalterado/ausente with deactivation checkboxes for absent → confirm calls with `apply: true, deactivateAbsent: [...]`. Tests: local/regional cannot reach admin (nav + guard); temp password dialog shows once; import preview maps kinds and sends only checked absents. Visual vs E1–E6/DT4–DT5.

Commit: `Add admin screens`.

---

### Task 9: Indicadores + estados do sistema (B3 — 470–526; DT6 — 1880–1929; F1–F3 — 1471–1549)

**Files:** `screens/Indicators.tsx`, polish pass wiring `EmptyState`/error states everywhere, CSS. Test: `test/client/indicators.test.tsx`.

**Behavior:** same summary cards as Painel with por-cidade/por-departamento pills (B3/DT6 — same numbers, different cuts; no "novos×resolvidos" pill, divergence B-5); "Painel completo" (Looker) button regional/admin only, opens `LOOKER_URL` from strings/config in new tab, hidden for local; sem URL configurada → botão desabilitado com tooltip. F-states: verify empty/expired/error views everywhere match F1–F3 copy. Tests: role gating of the Looker button; pills switch the rendered cut. Visual vs B3/DT6/F1–F3.

Commit: `Add indicators screen and system states polish`.

---

### Task 10: Integration pass — build, mock walkthrough, docs

**Files:** modify `README.md` (client dev section), `CLAUDE.md` (status → "Server + client implemented; pending: real-environment smoke + Looker report"), `knowledge/SMOKE_TEST.md` (append §8: UI walkthrough replacing console RPCs where the UI now covers them).

**Steps:** (1) `npm run build` → single dist/index.html; check gzip size (< 1.5 MB target; investigate if wildly over); (2) full dev-mock walkthrough of the SMOKE_TEST §§2–6 flows through the UI (login→troca de senha→visita completa→apontamento→revisão→admin) — fix anything broken; (3) run the whole vitest suite + typecheck; (4) update docs; (5) commit `Add client integration pass and docs`.

---

## Execution notes

- Tasks 1→2 sequential; 3→9 sequential (each screen builds on shell + previous components); 10 last.
- Every task: `npm run test && npm run typecheck && npm run build` green before commit.
- Visual acceptance: controller runs the Vite dev server with the Claude browser preview and compares against the mockup artboards after each screen task (the implementer self-checks; the controller verifies).
- The dev mock (Task 1) is the contract double: if a screen needs behavior the mock lacks, extend the mock to match the REAL server semantics (read the service source in src/server/services/) — never invent behavior the server doesn't have.
