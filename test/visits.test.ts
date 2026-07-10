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
  it('partial update without a notes key preserves existing notes; empty string clears them', () => {
    const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25', notes: 'obs inicial' } });
    expect(v.notes).toBe('obs inicial');
    const updated = saveVisit(ctx(), { visit: { id: v.id, cityId: 'c1', period: '04/2026', mainDate: '2026-04-26' } });
    expect(updated.notes).toBe('obs inicial');
    const cleared = saveVisit(ctx(), { visit: { id: v.id, cityId: 'c1', period: '04/2026', mainDate: '2026-04-26', notes: '' } });
    expect(cleared.notes).toBeUndefined();
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
  it('department delete guard only blocks reviews tied to findings of that same department', () => {
    p.repos.departments.insert({ id: 'd2', name: 'Manutenção', active: true });

    // A previous visit where d1 had a finding.
    const prevVisit = saveVisit(ctx(), { visit: { cityId: 'c1', period: '10/2025', mainDate: '2025-10-10' } });
    const prevVd = saveVisitDepartment(ctx(), { visitDepartment: { visitId: prevVisit.id, departmentId: 'd1' } });
    p.repos.findings.insert({
      id: 'f-prev', code: 'A-0002', visitDepartmentId: prevVd.id, visitId: prevVisit.id, cityId: 'c1',
      departmentId: 'd1', period: '10/2025', itemText: 'x', severity: 'high', response: 'no',
      status: 'open', createdAt: '', createdBy: '', updatedAt: '', updatedBy: '',
    });

    // Current visit with two departments; the previous d1 finding gets reviewed during this visit.
    const v = saveVisit(ctx(), { visit: { cityId: 'c1', period: '04/2026', mainDate: '2026-04-25' } });
    const vd1 = saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd1' } });
    const vd2 = saveVisitDepartment(ctx(), { visitDepartment: { visitId: v.id, departmentId: 'd2' } });
    p.repos.findingReviews.insert({
      id: 'fr1', findingId: 'f-prev', type: 'visit_review', visitId: v.id,
      result: 'resolved', createdAt: '', createdBy: 'u1',
    });

    // d2's row has nothing to do with the reviewed finding: deletion succeeds.
    expect(() => deleteVisitDepartment(ctx('admin'), { id: vd2.id })).not.toThrow();
    // d1's row is the department of the reviewed finding: still blocked.
    expect(() => deleteVisitDepartment(ctx('admin'), { id: vd1.id })).toThrow(/CONFLICT|apontamentos|revis/i);
  });
});
