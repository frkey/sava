import { SHEET_COLUMNS, rowToObject, objectToRow } from './mapping';
import type { Repos, SessionsTable, SessionRow, AuditEntry } from '../services/ports';

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

/**
 * Optional cross-request cache (CacheService, wired in gas/wiring.ts) for the small,
 * rarely-changing master-data tabs that are read on nearly every request. Keys match the
 * service-layer `invalidateCache([...])` calls (masterdata.ts), so a save through either
 * path clears the same entry. Only tiny tabs are cached cross-request — checklist items
 * can exceed CacheService's 100 KB/value limit, so they use the per-request memo only.
 */
export interface CrossCache {
  get(key: string): string | null;
  put(key: string, value: string): void;
  remove(key: string): void;
}
const CACHEABLE: Record<string, string> = { Cities: 'cities', Departments: 'departments' };

function readAll<T>(sheet: Sheet): T[] {
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] ?? []).map(String);
  return values.slice(1).map(r => rowToObject<T>(headers, r));
}

function findRowIndexById(sheet: Sheet, headers: string[], idCol: string, id: string): number {
  const col = headers.indexOf(idCol) + 1;
  const colValues = sheet.getRange(2, col, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < colValues.length; i++) if (String(colValues[i]![0]) === id) return i + 2;
  return -1;
}

/**
 * One tab's CRUD. `all()`/`byId()` share a **per-request memo** (each gasPorts() builds a
 * fresh sheetsRepos, so the memo lives exactly one api() call): the first read hits the
 * sheet — or the cross-request cache for CACHEABLE tabs — and every later read in the same
 * request is free. Any write clears the memo (and the cross-cache entry), so a read after a
 * write in the same request still sees fresh data. Writes locate rows by a fresh id-column
 * scan (findRowIndexById), never via the memo, so a stale memo can never misdirect a write.
 */
function table<T extends { id: string }>(sheet: Sheet, tab: string, cross?: CrossCache) {
  const headers = SHEET_COLUMNS[tab]!;
  const cacheKey = CACHEABLE[tab];
  let memo: T[] | undefined;
  const load = (): T[] => {
    if (memo) return memo;
    if (cacheKey && cross) {
      const hit = cross.get(cacheKey);
      if (hit !== null) return (memo = JSON.parse(hit) as T[]);
    }
    memo = readAll<T>(sheet);
    if (cacheKey && cross) cross.put(cacheKey, JSON.stringify(memo));
    return memo;
  };
  const invalidate = () => {
    memo = undefined;
    if (cacheKey && cross) cross.remove(cacheKey);
  };
  return {
    all: () => load(),
    byId: (id: string) => load().find(o => o.id === id),
    insert: (row: T) => {
      sheet.appendRow(objectToRow(headers, row as Record<string, unknown>) as string[]);
      invalidate();
    },
    update: (row: T) => {
      const idx = findRowIndexById(sheet, headers, 'id', row.id);
      if (idx < 0) throw new Error(`row not found: ${tab}/${row.id}`);
      sheet.getRange(idx, 1, 1, headers.length).setValues([objectToRow(headers, row as Record<string, unknown>)]);
      invalidate();
    },
    remove: (id: string) => {
      const idx = findRowIndexById(sheet, headers, 'id', id);
      if (idx < 0) throw new Error(`row not found: ${tab}/${id}`);
      sheet.deleteRow(idx);
      invalidate();
    },
  };
}

/**
 * Sessions are not memoized: reads are ~1 per request, and deleteByUserId/deleteExpired map
 * array indices to sheet rows, which a stale memo would corrupt — the tiny win isn't worth
 * that risk. Not cross-request cached either (session state must never be stale).
 */
function sessionsTable(sheet: Sheet): SessionsTable {
  const headers = SHEET_COLUMNS['Sessions']!;
  const allRows = () => readAll<SessionRow>(sheet);
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

export function sheetsRepos(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, cross?: CrossCache): Repos {
  const s = (name: string) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error(`missing tab: ${name}`);
    return sheet;
  };
  return {
    cities: table(s('Cities'), 'Cities', cross),
    departments: table(s('Departments'), 'Departments', cross),
    checklistItems: table(s('ChecklistItems'), 'ChecklistItems', cross),
    users: table(s('Users'), 'Users', cross),
    sessions: sessionsTable(s('Sessions')),
    visits: table(s('Visits'), 'Visits', cross),
    visitDepartments: table(s('VisitDepartments'), 'VisitDepartments', cross),
    findings: table(s('Findings'), 'Findings', cross),
    findingReviews: table(s('FindingReviews'), 'FindingReviews', cross),
    audit: { append: (e: AuditEntry) => s('AuditLog').appendRow(objectToRow(SHEET_COLUMNS['AuditLog']!, e as unknown as Record<string, unknown>) as string[]) },
  };
}
