import type {
  Ports, Table, SessionsTable, SessionRow, UserRow, AuditEntry, FilesPort,
} from '../src/server/services/ports';
import type { City, Department, ChecklistItem, Visit, VisitDepartment, Finding, FindingReview } from '../src/shared/types';

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
    remove: (id) => {
      const i = rows.findIndex(r => r.id === id);
      if (i < 0) throw new Error(`remove: id not found ${id}`);
      rows.splice(i, 1);
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
// repos here exposes each fake table's `.rows` array (beyond the plain `Repos` interface)
// so tests can assert on raw stored rows directly, e.g. `p.repos.users.rows`.
type FakeRepos = {
  cities: Table<City> & { rows: City[] };
  departments: Table<Department> & { rows: Department[] };
  checklistItems: Table<ChecklistItem> & { rows: ChecklistItem[] };
  users: Table<UserRow> & { rows: UserRow[] };
  sessions: SessionsTable & { rows: SessionRow[] };
  visits: Table<Visit> & { rows: Visit[] };
  visitDepartments: Table<VisitDepartment> & { rows: VisitDepartment[] };
  findings: Table<Finding> & { rows: Finding[] };
  findingReviews: Table<FindingReview> & { rows: FindingReview[] };
  audit: { append(e: AuditEntry): void };
};
export function fakePorts(overrides: Partial<{ nowIso: string }> = {}): Omit<Ports, 'repos'> & {
  repos: FakeRepos;
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
  const repos: FakeRepos = {
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
