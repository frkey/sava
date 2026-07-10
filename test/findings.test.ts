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
