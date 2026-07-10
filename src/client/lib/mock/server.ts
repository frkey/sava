/**
 * Dev-mode backend: implements the full `Actions` surface (src/shared/actions.ts) in
 * memory over the fixtures, with the same semantics as the real server (see
 * src/server/services/*.ts) wherever the UI depends on them — role gates, city
 * scoping for `local`, reviewQueue carry-over, upsert semantics, findings.save
 * duplicate CONFLICT, status transitions, dashboard aggregation shapes.
 *
 * This file intentionally does NOT import from src/server/** — the client and server
 * are separate TypeScript programs/bundles (see tsconfig.json vs tsconfig.server.json
 * and CLAUDE.md's repository boundary rule), so behavior that must match is
 * re-implemented here rather than shared, with messages transcribed verbatim from the
 * server source and called out inline. If a server message changes, update it here too.
 */
import type {
  City, Department, ChecklistItem, SessionUser, Visit, VisitDepartment, Finding, FindingReview,
  FindingFilters, ReviewResult, FindingStatus, Severity, FindingResponse, Role, ErrorCode, Envelope,
} from '../../../shared/types';
import { UNRESOLVED } from '../../../shared/types';
import type { Actions, ActionName, ImportPreviewRow } from '../../../shared/actions';
import {
  buildCities, buildDepartments, buildChecklistItems, buildUsers, buildVisits, buildVisitDepartments,
  buildFindings, buildFindingReviews, type MockUser,
} from './fixtures';

// ---------------------------------------------------------------------------
// Failure signaling — mirrors src/server/lib/errors.ts's AppError/fail() shape.
// ---------------------------------------------------------------------------
class MockFail extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) { super(message); }
}
function fail(code: ErrorCode, message: string, details?: unknown): never {
  throw new MockFail(code, message, details);
}

// ---------------------------------------------------------------------------
// Constants mirrored verbatim from the real server (src/server/services/auth.ts,
// src/server/lib/validate.ts, src/server/api/dispatcher.ts) so error copy and
// behavior are identical whether a screen is built against the mock or the real
// backend.
// ---------------------------------------------------------------------------
const GENERIC_LOGIN_ERROR = 'Usuário ou senha inválidos. Após tentativas repetidas, aguarde 15 minutos.';
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const SESSION_DAYS = 30;
const MAX_PDF_BYTES = 10_485_760;

const ROLE_ORDER: Record<Role, number> = { local: 0, regional: 1, admin: 2 };
const MUST_CHANGE_ALLOWLIST = new Set<ActionName>(['auth.changePassword', 'auth.me', 'auth.logout']);
/** minRole per action — mirrors src/server/api/registry.ts. 'auth.login' is public and
 *  handled separately (see `mockApi` below). Exported for test/client/parity.test.ts,
 *  which asserts this stays in lockstep with the real registry's route table. */
export const ACTION_MIN_ROLE: Partial<Record<ActionName, Role>> = {
  'auth.logout': 'local', 'auth.me': 'local', 'auth.changePassword': 'local',
  'cities.list': 'local', 'cities.save': 'admin',
  'departments.list': 'local', 'departments.save': 'admin',
  'checklistItems.list': 'regional', 'checklistItems.save': 'admin', 'checklistItems.importPaste': 'admin',
  'users.list': 'admin', 'users.save': 'admin', 'users.resetPassword': 'admin',
  'visits.list': 'local', 'visits.get': 'local', 'visits.save': 'regional', 'visits.delete': 'admin',
  'visitDepartments.save': 'regional', 'visitDepartments.markDone': 'regional', 'visitDepartments.delete': 'admin',
  'visitDepartments.uploadPdf': 'regional', 'visitDepartments.downloadPdf': 'local',
  'findings.list': 'local', 'findings.get': 'local', 'findings.save': 'regional', 'findings.updateStatus': 'regional',
  'findings.reviewQueue': 'regional', 'findingReviews.save': 'regional',
  'dashboard.summary': 'local',
};

const SEVERITIES = ['high', 'medium', 'low'] as const;
const RESPONSES = ['no', 'yes_with_caveats'] as const;
const STATUSES = ['open', 'in_treatment', 'resolved', 'cancelled'] as const;
const RESULTS = ['resolved', 'not_resolved', 'partial'] as const;
const ROLES = ['admin', 'regional', 'local'] as const;
const COUNT_FIELDS = ['countYes', 'countYesWithCaveats', 'countNo', 'countNotApplicable'] as const;
const SEVERITY_MAP: Record<string, Severity> = {
  alta: 'high', high: 'high', média: 'medium', media: 'medium', medium: 'medium',
  baixa: 'low', low: 'low',
};
const MANUAL_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  open: ['in_treatment', 'resolved', 'cancelled'],
  in_treatment: ['open', 'resolved', 'cancelled'],
  resolved: ['open'],
  cancelled: ['open'],
};

/** Minimal single-page valid PDF ("Hello, world!") — enough for downloadPdf demos. */
const TINY_PDF_BASE64 =
  'JVBERi0xLjEKJcKlwrHDqwoKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nCiAgICAgL1BhZ2VzIDIgMCBSCiAgPj4KZW5kb2JqCgoyIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2VzCiAgICAgL0tpZHMgWzMgMCBSXQogICAgIC9Db3VudCAxCiAgICAgL01lZGlhQm94IFswIDAgMzAwIDE0NF0KICA+PgplbmRvYmoKCjMgMCBvYmoKICA8PCAgL1R5cGUgL1BhZ2UKICAgICAgL1BhcmVudCAyIDAgUgogICAgICAvUmVzb3VyY2VzCiAgICAgICA8PCAvRm9udCA8PCAvRjEgNCAwIFIgPj4gPj4KICAgICAgL0NvbnRlbnRzIDUgMCBSCiAgPj4KZW5kb2JqCgo0IDAgb2JqCiAgPDwgL1R5cGUgL0ZvbnQKICAgICAvU3VidHlwZSAvVHlwZTEKICAgICAvQmFzZUZvbnQgL1RpbWVzLVJvbWFuCiAgPj4KZW5kb2JqCgo1IDAgb2JqICAlIHBhZ2UgY29udGVudAogIDw8IC9MZW5ndGggNDQgPj4Kc3RyZWFtCkJUCjcwIDUwIFRECi9GMSAxMiBUZgooSGVsbG8sIHdvcmxkISkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNzkgMDAwMDAgbiAKMDAwMDAwMDE3MyAwMDAwMCBuIAowMDAwMDAwMzAxIDAwMDAwIG4gCjAwMDAwMDAzODAgMDAwMDAgbiAKdHJhaWxlcgogIDw8ICAvUm9vdCAxIDAgUgogICAgICAvU2l6ZSA2CiAgPj4Kc3RhcnR4cmVmCjQ5MgolJUVPRg==';

// ---------------------------------------------------------------------------
// Small validators — mirror src/server/lib/validate.ts messages verbatim.
// ---------------------------------------------------------------------------
function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail('VALIDATION', `Campo obrigatório: ${field}`, { field });
  return v.trim();
}
function optionalString(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') fail('VALIDATION', 'Valor inválido');
  return v.trim();
}
function requireEnum<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v))
    fail('VALIDATION', `Valor inválido para ${field}`, { field, allowed });
  return v as T;
}
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
function isValidPeriod(s: string): boolean {
  const m = /^(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const month = Number(m[1]);
  return month >= 1 && month <= 12;
}
function semesterOf(period: string): string {
  const [mm, yyyy] = period.split('/');
  return `${yyyy}-${Number(mm) <= 6 ? 1 : 2}`;
}
function currentPeriodSemester(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1 <= 6 ? 1 : 2}`;
}
function isOverdue(f: Pick<Finding, 'status' | 'deadline'>, todayIso: string): boolean {
  return !!f.deadline && UNRESOLVED.includes(f.status) && f.deadline < todayIso;
}
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 8) return 'A senha precisa ter no mínimo 8 caracteres.';
  if (!/[a-zA-Z]/.test(pw)) return 'A senha precisa conter ao menos uma letra.';
  if (!/[0-9]/.test(pw)) return 'A senha precisa conter ao menos um número.';
  return null;
}
function definedFields<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) if (obj[key] !== undefined) out[key] = obj[key];
  return out;
}
function applyTransition(f: Finding, to: FindingStatus, nowIso: string, userId: string): Finding {
  const next: Finding = { ...f, status: to, updatedAt: nowIso, updatedBy: userId };
  if (to === 'resolved') { next.resolvedAt = nowIso; next.resolvedBy = userId; }
  else { next.resolvedAt = undefined; next.resolvedBy = undefined; }
  return next;
}
function nextCode(findings: Finding[]): string {
  let max = 0;
  for (const f of findings) {
    const m = /^A-(\d+)$/.exec(f.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `A-${String(max + 1).padStart(4, '0')}`;
}
let seq = 1000;
function uid(prefix: string): string { return `${prefix}-${(++seq).toString(36)}`; }
function randomToken(): string { return `${uid('tok')}-${Math.random().toString(36).slice(2)}`; }
/** Readable temp password like "Kxq-4729" — not cryptographically important in the mock. */
function generateTempPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (pool: string) => pool[Math.floor(Math.random() * pool.length)]!;
  return `${pick(letters).toUpperCase()}${pick(letters)}${pick(letters)}-${pick(digits)}${pick(digits)}${pick(digits)}${pick(digits)}`;
}

// ---------------------------------------------------------------------------
// Mutable in-memory state
// ---------------------------------------------------------------------------
interface MockSession { token: string; userId: string; createdAt: string; expiresAt: string }
interface MockState {
  cities: City[]; departments: Department[]; checklistItems: ChecklistItem[];
  users: MockUser[]; sessions: MockSession[];
  visits: Visit[]; visitDepartments: VisitDepartment[];
  findings: Finding[]; findingReviews: FindingReview[];
  pdfStore: Map<string, { fileName: string; base64: string }>;
}
function buildFreshState(): MockState {
  const s: MockState = {
    cities: buildCities(), departments: buildDepartments(), checklistItems: buildChecklistItems(),
    users: buildUsers(), sessions: [],
    visits: buildVisits(), visitDepartments: buildVisitDepartments(),
    findings: buildFindings(), findingReviews: buildFindingReviews(),
    pdfStore: new Map(),
  };
  for (const vd of s.visitDepartments) {
    if (vd.pdfFileId) s.pdfStore.set(vd.pdfFileId, { fileName: `${vd.departmentId}.pdf`, base64: TINY_PDF_BASE64 });
  }
  return s;
}
let state: MockState = buildFreshState();
/** Resets the mock to pristine fixtures — mainly for test isolation between test files/cases. */
export function resetMockState(): void { state = buildFreshState(); }

// ---------------------------------------------------------------------------
// Session / scoping helpers
// ---------------------------------------------------------------------------
function toSessionUser(u: MockUser): SessionUser {
  return { id: u.id, name: u.name, login: u.login, role: u.role, cityId: u.cityId, mustChangePassword: u.mustChangePassword };
}
function currentUser(token: string | undefined): SessionUser {
  if (!token) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  const s = state.sessions.find(x => x.token === token);
  const nowIso = new Date().toISOString();
  if (!s || s.expiresAt < nowIso) fail('UNAUTHORIZED', 'Sessão expirada. Entre novamente.');
  const user = state.users.find(u => u.id === s.userId);
  if (!user || !user.active) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  return toSessionUser(user);
}
/** local users may only touch their own city — mirrors src/server/api/dispatcher.ts assertCityScope. */
function assertCityScope(user: SessionUser, cityId: string | undefined): void {
  if (user.role === 'local' && cityId !== user.cityId) fail('FORBIDDEN', 'Acesso restrito à sua cidade.');
}

// ---------------------------------------------------------------------------
// auth.*
// ---------------------------------------------------------------------------
function handleLogin(payload: { login?: unknown; password?: unknown }): { token: string; user: SessionUser } {
  const loginName = requireString(payload.login, 'usuário').toLowerCase();
  const password = requireString(payload.password, 'senha');
  const nowIso = new Date().toISOString();
  const user = state.users.find(u => u.login.toLowerCase() === loginName);

  const locked = !!user?.lockedUntil && user.lockedUntil > nowIso;
  const passwordOk = !!user && user.password === password;
  if (!user || !user.active || locked || !passwordOk) {
    if (user && user.active && !locked && !passwordOk) {
      user.failedAttempts += 1;
      if (user.failedAttempts >= MAX_FAILURES) user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
    }
    fail('UNAUTHORIZED', GENERIC_LOGIN_ERROR);
  }
  user.failedAttempts = 0;
  user.lockedUntil = undefined;
  const token = randomToken();
  state.sessions.push({
    token, userId: user.id, createdAt: nowIso,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(),
  });
  return { token, user: toSessionUser(user) };
}
function authChangePassword(user: SessionUser, payload: { currentPassword?: unknown; newPassword?: unknown }): void {
  const row = state.users.find(u => u.id === user.id);
  if (!row) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  const current = requireString(payload.currentPassword, 'senha atual');
  if (row.password !== current) fail('VALIDATION', 'Senha atual incorreta.');
  const newPw = requireString(payload.newPassword, 'nova senha');
  const policyError = checkPasswordPolicy(newPw);
  if (policyError) fail('VALIDATION', policyError);
  row.password = newPw;
  row.mustChangePassword = false;
  state.sessions = state.sessions.filter(s => s.userId !== row.id);
}

// ---------------------------------------------------------------------------
// cities.* / departments.* / checklistItems.* / users.*
// ---------------------------------------------------------------------------
function citiesList(user: SessionUser): City[] {
  const all = [...state.cities].sort((a, b) => a.name.localeCompare(b.name));
  return user.role === 'local' ? all.filter(c => c.id === user.cityId) : all;
}
function citiesSave(payload: { city: Partial<City> & { name?: unknown } }): City {
  const name = requireString(payload.city.name, 'nome');
  if (payload.city.id) {
    const existing = state.cities.find(c => c.id === payload.city.id);
    if (!existing) fail('NOT_FOUND', 'Cidade não encontrada.');
    const updated: City = { ...existing, name, active: payload.city.active ?? existing.active };
    state.cities[state.cities.findIndex(c => c.id === existing.id)] = updated;
    return updated;
  }
  const created: City = { id: uid('c'), name, active: payload.city.active ?? true };
  state.cities.push(created);
  return created;
}
function departmentsList(): Department[] {
  return [...state.departments].sort((a, b) => a.name.localeCompare(b.name));
}
function departmentsSave(payload: { department: Partial<Department> & { name?: unknown } }): Department {
  const name = requireString(payload.department.name, 'nome');
  if (payload.department.id) {
    const existing = state.departments.find(d => d.id === payload.department.id);
    if (!existing) fail('NOT_FOUND', 'Departamento não encontrado.');
    const updated: Department = { ...existing, name, active: payload.department.active ?? existing.active };
    state.departments[state.departments.findIndex(d => d.id === existing.id)] = updated;
    return updated;
  }
  const created: Department = { id: uid('d'), name, active: payload.department.active ?? true };
  state.departments.push(created);
  return created;
}
function checklistItemsList(user: SessionUser, payload: { departmentId?: string }): ChecklistItem[] {
  if (!payload.departmentId && user.role !== 'admin') fail('VALIDATION', 'Informe o departamento.');
  return payload.departmentId ? state.checklistItems.filter(i => i.departmentId === payload.departmentId) : [...state.checklistItems];
}
function checklistItemsSave(payload: { item: Partial<ChecklistItem> & { departmentId?: unknown } }): ChecklistItem {
  const departmentId = requireString(payload.item.departmentId, 'departamento');
  const itemRef = requireString(payload.item.itemRef, 'referência');
  const section = requireString(payload.item.section, 'seção');
  const text = requireString(payload.item.text, 'texto');
  const severity = requireEnum(payload.item.severity, 'severidade', SEVERITIES);
  const department = state.departments.find(d => d.id === departmentId);
  if (!department) fail('NOT_FOUND', 'Departamento não encontrado.');
  const clash = state.checklistItems.find(i =>
    i.departmentId === departmentId && i.itemRef === itemRef && i.active && i.id !== payload.item.id);
  if (clash) fail('CONFLICT', 'Já existe um item ativo com esta referência neste departamento.');
  if (payload.item.id) {
    const existing = state.checklistItems.find(i => i.id === payload.item.id);
    if (!existing) fail('NOT_FOUND', 'Item não encontrado.');
    const updated: ChecklistItem = {
      ...existing, departmentId, itemRef, section, text, severity, active: payload.item.active ?? existing.active,
    };
    state.checklistItems[state.checklistItems.findIndex(i => i.id === existing.id)] = updated;
    return updated;
  }
  const created: ChecklistItem = { id: uid('ci'), departmentId, itemRef, section, text, severity, active: payload.item.active ?? true };
  state.checklistItems.push(created);
  return created;
}
function parseTsv(departmentId: string, tsv: string, existing: ChecklistItem[]) {
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
function checklistItemsImportPaste(payload: {
  departmentId?: unknown; tsv?: unknown; apply?: boolean; deactivateAbsent?: string[];
}) {
  const departmentId = requireString(payload.departmentId, 'departamento');
  const tsv = requireString(payload.tsv, 'conteúdo colado');
  const existing = state.checklistItems.filter(i => i.departmentId === departmentId);
  const { rows, parsed } = parseTsv(departmentId, tsv, existing);
  const absent = existing.filter(i => i.active && !parsed.has(i.itemRef));
  if (payload.apply) {
    for (const [itemRef, data] of parsed) {
      const current = existing.find(i => i.itemRef === itemRef && i.active);
      if (current) state.checklistItems[state.checklistItems.findIndex(i => i.id === current.id)] = { ...current, ...data };
      else state.checklistItems.push({ id: uid('ci'), active: true, ...data });
    }
    for (const id of payload.deactivateAbsent ?? []) {
      const item = state.checklistItems.find(i => i.id === id);
      if (item && item.departmentId === departmentId)
        state.checklistItems[state.checklistItems.findIndex(i => i.id === id)] = { ...item, active: false };
    }
  }
  return { rows, absent };
}
function usersList(): (SessionUser & { active: boolean })[] {
  return state.users.map(u => ({ ...toSessionUser(u), active: u.active }));
}
function usersSave(payload: { user: Partial<SessionUser> & { name?: unknown; login?: unknown; active?: boolean } }) {
  const name = requireString(payload.user.name, 'nome');
  const loginName = requireString(payload.user.login, 'login').toLowerCase();
  const role = requireEnum(payload.user.role, 'perfil', ROLES);
  const cityId = optionalString(payload.user.cityId);
  if (role === 'local' && !cityId) fail('VALIDATION', 'Perfil local exige uma cidade.');
  const clash = state.users.find(u => u.login.toLowerCase() === loginName && u.id !== payload.user.id);
  if (clash) fail('CONFLICT', 'Já existe um usuário com este login.');
  if (payload.user.id) {
    const row = state.users.find(u => u.id === payload.user.id);
    if (!row) fail('NOT_FOUND', 'Usuário não encontrado.');
    const updated: MockUser = { ...row, name, login: loginName, role, cityId: role === 'local' ? cityId : undefined };
    if (payload.user.active === false && row.active) {
      updated.active = false;
      state.sessions = state.sessions.filter(s => s.userId !== row.id);
    } else if (payload.user.active === true) updated.active = true;
    state.users[state.users.findIndex(u => u.id === row.id)] = updated;
    return { user: toSessionUser(updated) };
  }
  const tempPassword = generateTempPassword();
  const created: MockUser = {
    id: uid('u'), name, login: loginName, role, cityId: role === 'local' ? cityId : undefined,
    active: true, mustChangePassword: true, password: tempPassword, failedAttempts: 0,
  };
  state.users.push(created);
  return { user: toSessionUser(created), tempPassword };
}
function usersResetPassword(payload: { userId?: unknown }) {
  const row = state.users.find(u => u.id === requireString(payload.userId, 'usuário'));
  if (!row) fail('NOT_FOUND', 'Usuário não encontrado.');
  const tempPassword = generateTempPassword();
  row.password = tempPassword;
  row.mustChangePassword = true;
  row.failedAttempts = 0;
  row.lockedUntil = undefined;
  state.sessions = state.sessions.filter(s => s.userId !== row.id);
  return { tempPassword };
}

// ---------------------------------------------------------------------------
// visits.* / visitDepartments.*
// ---------------------------------------------------------------------------
function visitsList(user: SessionUser, payload: { cityId?: string; period?: string }): Visit[] {
  const cityId = user.role === 'local' ? user.cityId : payload.cityId;
  return state.visits.filter(v => (!cityId || v.cityId === cityId) && (!payload.period || v.period === payload.period));
}
function visitsGet(user: SessionUser, payload: { id?: unknown }) {
  const id = requireString(payload.id, 'visita');
  const visit = state.visits.find(v => v.id === id);
  if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
  assertCityScope(user, visit.cityId);
  const departments = state.visitDepartments.filter(d => d.visitId === visit.id);
  return { visit, departments };
}
function visitsSave(user: SessionUser, payload: { visit: Partial<Visit> & { cityId?: unknown; period?: unknown; mainDate?: unknown } }): Visit {
  const cityId = requireString(payload.visit.cityId, 'cidade');
  const period = requireString(payload.visit.period, 'competência');
  const mainDate = requireString(payload.visit.mainDate, 'data');
  if (!isValidPeriod(period)) fail('VALIDATION', 'Competência inválida. Use o formato MM/AAAA.');
  if (!isValidDate(mainDate)) fail('VALIDATION', 'Data inválida.');
  const notes = optionalString(payload.visit.notes);

  if (payload.visit.id) {
    const existing = state.visits.find(v => v.id === payload.visit.id);
    if (!existing) fail('NOT_FOUND', 'Visita não encontrada.');
    assertCityScope(user, existing.cityId);
    const changingCityOrPeriod = existing.cityId !== cityId || existing.period !== period;
    if (changingCityOrPeriod) {
      const hasDepartments = state.visitDepartments.some(d => d.visitId === existing.id);
      if (hasDepartments)
        fail('CONFLICT', 'Não é possível alterar cidade ou competência: já existem departamentos registrados nesta visita.');
      const city = state.cities.find(c => c.id === cityId);
      if (!city) fail('NOT_FOUND', 'Cidade não encontrada.');
      if (!city.active) fail('VALIDATION', 'Cidade inativa.');
      const clash = state.visits.find(v => v.cityId === cityId && v.period === period && v.id !== existing.id);
      if (clash) fail('CONFLICT', 'Já existe uma visita desta cidade nesta competência.', { existingVisitId: clash.id });
    }
    const updated: Visit = {
      ...existing, cityId, period, mainDate,
      notes: payload.visit.notes !== undefined ? optionalString(payload.visit.notes) : existing.notes,
    };
    state.visits[state.visits.findIndex(v => v.id === existing.id)] = updated;
    return updated;
  }

  const city = state.cities.find(c => c.id === cityId);
  if (!city) fail('NOT_FOUND', 'Cidade não encontrada.');
  if (!city.active) fail('VALIDATION', 'Cidade inativa.');
  const clash = state.visits.find(v => v.cityId === cityId && v.period === period);
  if (clash) fail('CONFLICT', 'Já existe uma visita desta cidade nesta competência.', { existingVisitId: clash.id });

  const created: Visit = { id: uid('v'), cityId, period, mainDate, notes, createdAt: new Date().toISOString(), createdBy: user.id };
  state.visits.push(created);
  return created;
}
function visitsDelete(payload: { id?: unknown }): void {
  const id = requireString(payload.id, 'visita');
  const visit = state.visits.find(v => v.id === id);
  if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
  const hasDepartments = state.visitDepartments.some(d => d.visitId === id);
  if (hasDepartments)
    fail('CONFLICT', 'Não é possível excluir: existem departamentos registrados nesta visita. Correção manual na planilha (owner account) se necessário.');
  state.visits = state.visits.filter(v => v.id !== id);
}
function visitDepartmentsSave(
  user: SessionUser,
  payload: { visitDepartment: Partial<VisitDepartment> & { visitId?: unknown; departmentId?: unknown } },
): VisitDepartment {
  const input = payload.visitDepartment;
  const visitId = requireString(input.visitId, 'visita');
  const departmentId = requireString(input.departmentId, 'departamento');
  for (const field of COUNT_FIELDS) {
    const v = input[field];
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < 0))
      fail('VALIDATION', 'As contagens devem ser números inteiros não negativos.');
  }
  const patch = definedFields(input);

  const visit = state.visits.find(v => v.id === visitId);
  if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
  assertCityScope(user, visit.cityId);

  const existing = state.visitDepartments.find(d => d.visitId === visitId && d.departmentId === departmentId);
  if (!existing) {
    const department = state.departments.find(d => d.id === departmentId);
    if (!department || !department.active) fail('VALIDATION', 'Departamento inválido ou inativo.');
    const created: VisitDepartment = {
      ...(patch as Partial<VisitDepartment>),
      id: uid('vd'), visitId, departmentId, cityId: visit.cityId, period: visit.period,
      createdAt: new Date().toISOString(), createdBy: user.id,
    };
    state.visitDepartments.push(created);
    return created;
  }
  const updated: VisitDepartment = {
    ...existing, ...(patch as Partial<VisitDepartment>),
    id: existing.id, visitId: existing.visitId, departmentId: existing.departmentId,
    cityId: visit.cityId, period: visit.period,
  };
  state.visitDepartments[state.visitDepartments.findIndex(d => d.id === existing.id)] = updated;
  return updated;
}
function markDone(user: SessionUser, payload: { id?: unknown }): VisitDepartment {
  const id = requireString(payload.id, 'departamento da visita');
  const existing = state.visitDepartments.find(d => d.id === id);
  if (!existing) fail('NOT_FOUND', 'Registro não encontrado.');
  assertCityScope(user, existing.cityId);
  const updated: VisitDepartment = { ...existing, completedAt: new Date().toISOString(), completedBy: user.id };
  state.visitDepartments[state.visitDepartments.findIndex(d => d.id === existing.id)] = updated;
  return updated;
}
function visitDepartmentsDelete(payload: { id?: unknown }): void {
  const id = requireString(payload.id, 'departamento da visita');
  const vd = state.visitDepartments.find(d => d.id === id);
  if (!vd) fail('NOT_FOUND', 'Registro não encontrado.');
  const hasFindings = state.findings.some(f => f.visitDepartmentId === id);
  const hasReviews = state.findingReviews.some(r =>
    r.visitId === vd.visitId && state.findings.find(f => f.id === r.findingId)?.departmentId === vd.departmentId);
  if (hasFindings || hasReviews)
    fail('CONFLICT', 'Não é possível excluir: existem apontamentos ou revisões associados. Correção manual na planilha (owner account) se necessário.');
  state.visitDepartments = state.visitDepartments.filter(d => d.id !== id);
}
function uploadPdf(payload: { id?: unknown; fileName?: unknown; base64?: unknown }): VisitDepartment {
  const id = requireString(payload.id, 'departamento da visita');
  const fileName = requireString(payload.fileName, 'nome do arquivo');
  const base64 = requireString(payload.base64, 'arquivo');
  if (!/\.pdf$/i.test(fileName)) fail('VALIDATION', 'O arquivo precisa ser um PDF.');
  if ((base64.length * 3) / 4 > MAX_PDF_BYTES) fail('VALIDATION', 'O PDF excede o limite de 10 MB.');
  const vd = state.visitDepartments.find(d => d.id === id);
  if (!vd) fail('NOT_FOUND', 'Registro de departamento não encontrado.');
  const fileId = uid('file');
  state.pdfStore.set(fileId, { fileName, base64 });
  const updated: VisitDepartment = { ...vd, pdfFileId: fileId, pdfUrl: `https://drive.example/${fileId}` };
  state.visitDepartments[state.visitDepartments.findIndex(d => d.id === vd.id)] = updated;
  return updated;
}
function downloadPdf(user: SessionUser, payload: { visitDepartmentId?: unknown }): { fileName: string; base64: string } {
  const id = requireString(payload.visitDepartmentId, 'departamento da visita');
  const vd = state.visitDepartments.find(d => d.id === id);
  if (!vd) fail('NOT_FOUND', 'Registro não encontrado.');
  assertCityScope(user, vd.cityId);
  if (!vd.pdfFileId) fail('NOT_FOUND', 'Nenhum PDF anexado para este departamento.');
  const file = state.pdfStore.get(vd.pdfFileId);
  if (!file) fail('NOT_FOUND', 'Arquivo não encontrado.');
  return file;
}

// ---------------------------------------------------------------------------
// findings.* / findingReviews.*
// ---------------------------------------------------------------------------
function findingsList(user: SessionUser, payload: { filters?: FindingFilters }): Finding[] {
  const filters = payload.filters ?? {};
  const cityId = user.role === 'local' ? user.cityId : filters.cityId;
  const text = filters.text?.trim().toLowerCase();
  const today = todayIso();
  return state.findings
    .filter(f => !cityId || f.cityId === cityId)
    .filter(f => !filters.departmentId || f.departmentId === filters.departmentId)
    .filter(f => !filters.status || f.status === filters.status)
    .filter(f => !filters.period || f.period === filters.period)
    .filter(f => !filters.severity || f.severity === filters.severity)
    .filter(f => !filters.response || f.response === filters.response)
    .filter(f => !filters.overdue || isOverdue(f, today))
    .filter(f => !text || `${f.itemText} ${f.considerations ?? ''} ${f.code}`.toLowerCase().includes(text))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
function findingsGet(user: SessionUser, payload: { id?: unknown }): { finding: Finding; reviews: FindingReview[] } {
  const id = requireString(payload.id, 'apontamento');
  const finding = state.findings.find(f => f.id === id);
  if (!finding) fail('NOT_FOUND', 'Apontamento não encontrado.');
  assertCityScope(user, finding.cityId);
  const reviews = state.findingReviews.filter(r => r.findingId === id)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return { finding, reviews };
}
function findingsSave(user: SessionUser, payload: { finding: Partial<Finding> & { itemText?: unknown }; force?: boolean }): Finding {
  const input = payload.finding;
  const itemText = requireString(input.itemText, 'texto do item');
  if (input.deadline !== undefined && input.deadline !== '' && !isValidDate(input.deadline)) fail('VALIDATION', 'Prazo inválido.');
  const nowIso = new Date().toISOString();

  if (input.id) {
    const existing = state.findings.find(f => f.id === input.id);
    if (!existing) fail('NOT_FOUND', 'Apontamento não encontrado.');
    assertCityScope(user, existing.cityId);
    const severity = input.severity !== undefined ? requireEnum(input.severity, 'severidade', SEVERITIES) : existing.severity;
    const response = input.response !== undefined ? requireEnum(input.response, 'resposta', RESPONSES) : existing.response;
    const updated: Finding = {
      ...existing, itemText,
      itemRef: input.itemRef !== undefined ? optionalString(input.itemRef) : existing.itemRef,
      section: input.section !== undefined ? optionalString(input.section) : existing.section,
      severity, response,
      considerations: input.considerations !== undefined ? optionalString(input.considerations) : existing.considerations,
      deadline: input.deadline !== undefined ? optionalString(input.deadline) : existing.deadline,
      assignee: input.assignee !== undefined ? optionalString(input.assignee) : existing.assignee,
      updatedAt: nowIso, updatedBy: user.id,
    };
    state.findings[state.findings.findIndex(f => f.id === existing.id)] = updated;
    return updated;
  }

  const visitDepartmentId = requireString(input.visitDepartmentId, 'departamento da visita');
  const vd = state.visitDepartments.find(d => d.id === visitDepartmentId);
  if (!vd) fail('NOT_FOUND', 'Departamento da visita não encontrado.');
  assertCityScope(user, vd.cityId);

  const severity = requireEnum(input.severity, 'severidade', SEVERITIES);
  const response = requireEnum(input.response, 'resposta', RESPONSES);
  const itemRef = optionalString(input.itemRef);
  const section = optionalString(input.section);
  const considerations = optionalString(input.considerations);
  const deadline = optionalString(input.deadline);
  const assignee = optionalString(input.assignee);

  if (itemRef) {
    const dup = state.findings.find(f =>
      f.cityId === vd.cityId && f.departmentId === vd.departmentId && f.itemRef === itemRef && UNRESOLVED.includes(f.status));
    if (dup && !payload.force) fail('CONFLICT', 'Já existe um apontamento em aberto para este item.', { existingFindingId: dup.id });
  }

  const code = nextCode(state.findings);
  const created: Finding = {
    id: uid('f'), code, visitDepartmentId, visitId: vd.visitId, cityId: vd.cityId, departmentId: vd.departmentId, period: vd.period,
    itemRef, section, itemText, severity, response, considerations, status: 'open', deadline, assignee,
    createdAt: nowIso, createdBy: user.id, updatedAt: nowIso, updatedBy: user.id,
  };
  state.findings.push(created);
  return created;
}
function updateStatus(user: SessionUser, payload: { id?: unknown; status?: unknown; note?: unknown }): Finding {
  const id = requireString(payload.id, 'apontamento');
  const status = requireEnum(payload.status, 'status', STATUSES);
  const note = requireString(payload.note, 'observação');
  const existing = state.findings.find(f => f.id === id);
  if (!existing) fail('NOT_FOUND', 'Apontamento não encontrado.');
  assertCityScope(user, existing.cityId);
  const allowed = MANUAL_TRANSITIONS[existing.status];
  if (!allowed.includes(status)) fail('VALIDATION', `Transição de status não permitida: ${existing.status} → ${status}.`);
  const nowIso = new Date().toISOString();
  const updated = applyTransition(existing, status, nowIso, user.id);
  state.findings[state.findings.findIndex(f => f.id === existing.id)] = updated;
  const review: FindingReview = {
    id: uid('r'), findingId: existing.id, type: 'status_change', newStatus: status, notes: note,
    visitId: undefined, createdAt: nowIso, createdBy: user.id,
  };
  state.findingReviews.push(review);
  return updated;
}
function reviewQueue(user: SessionUser, payload: { visitId?: unknown; departmentId?: unknown }) {
  const visitId = requireString(payload.visitId, 'visita');
  const departmentId = requireString(payload.departmentId, 'departamento');
  const visit = state.visits.find(v => v.id === visitId);
  if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
  assertCityScope(user, visit.cityId);

  const reviewsThisVisit = new Map(
    state.findingReviews.filter(r => r.type === 'visit_review' && r.visitId === visitId).map(r => [r.findingId, r] as const),
  );
  return state.findings
    .filter(f => f.cityId === visit.cityId && f.departmentId === departmentId)
    .map(f => ({ finding: f, existingReview: reviewsThisVisit.get(f.id) }))
    .filter(item => item.existingReview || (UNRESOLVED.includes(item.finding.status) && item.finding.visitId !== visitId))
    .sort((a, b) => {
      const aRef = a.finding.itemRef;
      const bRef = b.finding.itemRef;
      if (aRef !== bRef) {
        if (aRef === undefined) return 1;
        if (bRef === undefined) return -1;
        return aRef < bRef ? -1 : 1;
      }
      return a.finding.createdAt < b.finding.createdAt ? -1 : a.finding.createdAt > b.finding.createdAt ? 1 : 0;
    });
}
function findingReviewsSave(
  user: SessionUser,
  payload: { findingId?: unknown; visitId?: unknown; result?: unknown; notes?: unknown },
): FindingReview {
  const findingId = requireString(payload.findingId, 'apontamento');
  const visitId = requireString(payload.visitId, 'visita');
  const result = requireEnum(payload.result, 'resultado', RESULTS);
  const notes = optionalString(payload.notes);
  if ((result === 'partial' || result === 'not_resolved') && !notes) fail('VALIDATION', 'Observação é obrigatória para este resultado.');

  const finding = state.findings.find(f => f.id === findingId);
  if (!finding) fail('NOT_FOUND', 'Apontamento não encontrado.');
  const visit = state.visits.find(v => v.id === visitId);
  if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
  assertCityScope(user, finding.cityId);
  if (visit.cityId !== finding.cityId) fail('VALIDATION', 'A visita não é da cidade deste apontamento.');

  const existing = state.findingReviews.find(r => r.type === 'visit_review' && r.findingId === findingId && r.visitId === visitId);
  if (!existing && (finding.status === 'resolved' || finding.status === 'cancelled'))
    fail('CONFLICT', 'Apontamento já resolvido/cancelado — reabra antes de revisar.', { findingId });
  if (existing && finding.status === 'cancelled' && (result === 'resolved' || result === 'partial'))
    fail('CONFLICT', 'Apontamento cancelado — reabra antes de corrigir a revisão.', { findingId });

  const nowIso = new Date().toISOString();
  let updatedFinding = finding;
  if (result === 'resolved') updatedFinding = applyTransition(finding, 'resolved', nowIso, user.id);
  else if (result === 'partial') updatedFinding = applyTransition(finding, 'in_treatment', nowIso, user.id);
  else if (result === 'not_resolved' && finding.status === 'resolved') updatedFinding = applyTransition(finding, 'open', nowIso, user.id);
  if (updatedFinding !== finding) state.findings[state.findings.findIndex(f => f.id === finding.id)] = updatedFinding;

  let review: FindingReview;
  if (existing) {
    review = { ...existing, result, notes, createdBy: user.id };
    state.findingReviews[state.findingReviews.findIndex(r => r.id === existing.id)] = review;
  } else {
    review = { id: uid('r'), findingId, type: 'visit_review', visitId, result, notes, createdAt: nowIso, createdBy: user.id };
    state.findingReviews.push(review);
  }
  return review;
}

// ---------------------------------------------------------------------------
// dashboard.summary — mirrors src/server/services/dashboard.ts aggregation shape.
// ---------------------------------------------------------------------------
function dashboardSummary(user: SessionUser, payload: { cityId?: string }) {
  const cityId = user.role === 'local' ? user.cityId : payload.cityId;
  const singleCityScope = !!cityId;
  const today = todayIso();
  const currentSemester = currentPeriodSemester();

  const allActiveCities = state.cities.filter(c => c.active);
  // Mirrors src/server/services/dashboard.ts exactly (final review wave, item 1):
  // single-city scope selects the scoped city even if it has since been deactivated.
  const citiesInScope = singleCityScope
    ? state.cities.filter(c => c.id === cityId)
    : allActiveCities;
  const activeDepartments = state.departments.filter(d => d.active);

  const findingsInScope = state.findings.filter(f => !cityId || f.cityId === cityId);
  const unresolved = findingsInScope.filter(f => UNRESOLVED.includes(f.status));

  const openByCityRows = citiesInScope.map(city => {
    const cityUnresolved = unresolved.filter(f => f.cityId === city.id);
    const overdue = cityUnresolved.filter(f => isOverdue(f, today)).length;
    return { cityId: city.id, cityName: city.name, open: cityUnresolved.length, overdue };
  });
  const openByCity = (singleCityScope ? openByCityRows : openByCityRows.filter(r => r.open > 0 || r.overdue > 0))
    .sort((a, b) => b.open - a.open || a.cityName.localeCompare(b.cityName));

  const openByDepartment = activeDepartments
    .map(d => ({ departmentId: d.id, departmentName: d.name, open: unresolved.filter(f => f.departmentId === d.id).length }))
    .filter(r => r.open > 0)
    .sort((a, b) => b.open - a.open || a.departmentName.localeCompare(b.departmentName));

  const overdue = unresolved.filter(f => isOverdue(f, today)).length;
  const highSeverityOpen = unresolved.filter(f => f.severity === 'high').length;

  const visitDepartmentsInScope = state.visitDepartments.filter(vd => !cityId || vd.cityId === cityId);
  const completedMissingPdfOrCounts = visitDepartmentsInScope
    .filter(vd => !!vd.completedAt && (!vd.pdfFileId || vd.countYes === undefined)).length;

  const visitsInScope = state.visits.filter(v => !cityId || v.cityId === cityId);
  const citiesWithVisitThisSemester = new Set(
    visitsInScope.filter(v => semesterOf(v.period) === currentSemester).map(v => v.cityId),
  );
  const citiesVisitedInSemester = singleCityScope
    ? { visited: citiesWithVisitThisSemester.has(cityId as string) ? 1 : 0, total: 1 }
    : {
        visited: allActiveCities.filter(c => citiesWithVisitThisSemester.has(c.id)).length,
        total: allActiveCities.length,
      };

  const cityNameById = new Map(state.cities.map(c => [c.id, c.name]));
  const latestVisits = [...visitsInScope]
    .sort((a, b) => (a.mainDate < b.mainDate ? 1 : a.mainDate > b.mainDate ? -1 : 0))
    .slice(0, 5)
    .map(visit => {
      const vds = state.visitDepartments.filter(vd => vd.visitId === visit.id);
      const completed = vds.filter(vd => !!vd.completedAt);
      return {
        visit, cityName: cityNameById.get(visit.cityId) ?? '',
        done: completed.length, total: vds.length,
        missingPdfOrCounts: completed.filter(vd => !vd.pdfFileId || vd.countYes === undefined).length,
      };
    });

  let resolutionRateSemester: number | undefined;
  if (singleCityScope) {
    const cityVisitIdsThisSemester = new Set(
      visitsInScope.filter(v => semesterOf(v.period) === currentSemester).map(v => v.id),
    );
    const reviews = state.findingReviews.filter(r => r.type === 'visit_review' && r.visitId && cityVisitIdsThisSemester.has(r.visitId));
    if (reviews.length > 0) resolutionRateSemester = reviews.filter(r => r.result === 'resolved').length / reviews.length;
  }

  return {
    openByCity, openByDepartment, overdue, highSeverityOpen, completedMissingPdfOrCounts,
    citiesVisitedInSemester, latestVisits, resolutionRateSemester,
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
function handle(action: ActionName, payload: unknown, user: SessionUser, token: string | undefined): unknown {
  switch (action) {
    case 'auth.logout': state.sessions = state.sessions.filter(s => s.token !== token); return undefined;
    case 'auth.me': return user;
    case 'auth.changePassword': authChangePassword(user, (payload ?? {}) as never); return undefined;
    case 'cities.list': return citiesList(user);
    case 'cities.save': return citiesSave(payload as never);
    case 'departments.list': return departmentsList();
    case 'departments.save': return departmentsSave(payload as never);
    case 'checklistItems.list': return checklistItemsList(user, (payload ?? {}) as never);
    case 'checklistItems.save': return checklistItemsSave(payload as never);
    case 'checklistItems.importPaste': return checklistItemsImportPaste(payload as never);
    case 'users.list': return usersList();
    case 'users.save': return usersSave(payload as never);
    case 'users.resetPassword': return usersResetPassword(payload as never);
    case 'visits.list': return visitsList(user, (payload ?? {}) as never);
    case 'visits.get': return visitsGet(user, payload as never);
    case 'visits.save': return visitsSave(user, payload as never);
    case 'visits.delete': visitsDelete(payload as never); return undefined;
    case 'visitDepartments.save': return visitDepartmentsSave(user, payload as never);
    case 'visitDepartments.markDone': return markDone(user, payload as never);
    case 'visitDepartments.delete': visitDepartmentsDelete(payload as never); return undefined;
    case 'visitDepartments.uploadPdf': return uploadPdf(payload as never);
    case 'visitDepartments.downloadPdf': return downloadPdf(user, payload as never);
    case 'findings.list': return findingsList(user, (payload ?? {}) as never);
    case 'findings.get': return findingsGet(user, payload as never);
    case 'findings.save': return findingsSave(user, payload as never);
    case 'findings.updateStatus': return updateStatus(user, payload as never);
    case 'findings.reviewQueue': return reviewQueue(user, payload as never);
    case 'findingReviews.save': return findingReviewsSave(user, payload as never);
    case 'dashboard.summary': return dashboardSummary(user, (payload ?? {}) as never);
    case 'auth.login':
      // handled in mockApi before role/session checks — unreachable here.
      return undefined;
    default:
      fail('NOT_FOUND', 'Ação desconhecida.');
  }
}

/**
 * Dev-mode implementation of `Actions` — envelope semantics identical to the real
 * dispatcher (src/server/api/dispatcher.ts): public `auth.login` bypasses the
 * session check; every other action requires a valid token (UNAUTHORIZED otherwise),
 * is blocked while `mustChangePassword` is set (except the allowlisted actions), and
 * is role-gated before running.
 */
export function mockApi<K extends ActionName>(
  action: K,
  payload: Actions[K]['p'],
  token: string | undefined,
): Envelope<Actions[K]['r']> {
  try {
    if (action === 'auth.login') {
      const data = handleLogin((payload ?? {}) as { login?: unknown; password?: unknown });
      return { ok: true, data: data as Actions[K]['r'] };
    }
    const user = currentUser(token);
    const minRole = ACTION_MIN_ROLE[action];
    if (minRole === undefined) fail('NOT_FOUND', 'Ação desconhecida.');
    if (user.mustChangePassword && !MUST_CHANGE_ALLOWLIST.has(action)) fail('FORBIDDEN', 'Troque sua senha para continuar.');
    if (ROLE_ORDER[user.role] < ROLE_ORDER[minRole]) fail('FORBIDDEN', 'Você não tem permissão para esta ação.');
    const data = handle(action, payload, user, token);
    return { ok: true, data: data as Actions[K]['r'] };
  } catch (e) {
    if (e instanceof MockFail) return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'INTERNAL', message: `Erro inesperado no mock: ${message}` } };
  }
}
