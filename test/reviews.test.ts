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
  it('correcting a review to resolved/partial on a since-cancelled finding is CONFLICT (must reopen manually first)', () => {
    saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'partial', notes: 'parcial' });
    expect(p.repos.findings.byId(f1)!.status).toBe('in_treatment');
    updateStatus(ctx(), { id: f1, status: 'cancelled', note: 'cancelado manualmente' });
    expect(p.repos.findings.byId(f1)!.status).toBe('cancelled');
    expect(() => saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'resolved' }))
      .toThrow(/cancelado/i);
  });
  it('correcting a review to not_resolved on a cancelled finding is allowed and leaves status unchanged', () => {
    saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'partial', notes: 'parcial' });
    updateStatus(ctx(), { id: f1, status: 'cancelled', note: 'cancelado manualmente' });
    const review = saveReview(ctx(), { findingId: f1, visitId: visit2, result: 'not_resolved', notes: 'ainda pendente' });
    expect(review.result).toBe('not_resolved');
    expect(review.notes).toBe('ainda pendente');
    const f = p.repos.findings.byId(f1)!;
    expect(f.status).toBe('cancelled');
    expect(p.repos.findingReviews.rows.filter(r => r.findingId === f1 && r.type === 'visit_review')).toHaveLength(1);
  });
});
