import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import type { Ctx } from '../src/server/services/ports';
import { dashboardSummary } from '../src/server/services/dashboard';

let p: ReturnType<typeof fakePorts>;
const ctx = (role: 'admin' | 'regional' | 'local' = 'regional', cityId?: string): Ctx =>
  ({ ports: p, user: { id: 'u1', name: 'X', login: 'x', role, cityId, mustChangePassword: false } });

// now = 2026-07-09T12:00:00.000Z (fakePorts default) → current semester '2026-2', today '2026-07-09'
beforeEach(() => {
  p = fakePorts();
  p.repos.cities.insert({ id: 'c1', name: 'Sumaré', active: true });
  p.repos.cities.insert({ id: 'c2', name: 'Americana', active: true });
  p.repos.departments.insert({ id: 'd1', name: 'Informática', active: true });

  // v1: c1, 10/2025 (semester 2025-2) — vd1 completed, NO pdfFileId → missing
  p.repos.visits.insert({
    id: 'v1', cityId: 'c1', period: '10/2025', mainDate: '2025-10-26',
    createdAt: '2025-10-26T00:00:00.000Z', createdBy: 'seed',
  });
  p.repos.visitDepartments.insert({
    id: 'vd1', visitId: 'v1', departmentId: 'd1', cityId: 'c1', period: '10/2025',
    completedAt: '2025-10-27T00:00:00.000Z', completedBy: 'seed',
    createdAt: '2025-10-26T00:00:00.000Z', createdBy: 'seed',
  });
  // f1: open, high, deadline 2026-07-01 → overdue (today 2026-07-09)
  p.repos.findings.insert({
    id: 'f1', code: 'A-0001', visitDepartmentId: 'vd1', visitId: 'v1', cityId: 'c1', departmentId: 'd1', period: '10/2025',
    itemText: 'Backup?', severity: 'high', response: 'no', status: 'open', deadline: '2026-07-01',
    createdAt: '2025-10-27T00:00:00.000Z', createdBy: 'seed', updatedAt: '2025-10-27T00:00:00.000Z', updatedBy: 'seed',
  });
  // f3: resolved, in c1 (via vd1) — should not count as open
  p.repos.findings.insert({
    id: 'f3', code: 'A-0003', visitDepartmentId: 'vd1', visitId: 'v1', cityId: 'c1', departmentId: 'd1', period: '10/2025',
    itemText: 'AV atualizado?', severity: 'low', response: 'no', status: 'resolved',
    resolvedAt: '2025-11-01T00:00:00.000Z', resolvedBy: 'seed',
    createdAt: '2025-10-27T00:00:00.000Z', createdBy: 'seed', updatedAt: '2025-11-01T00:00:00.000Z', updatedBy: 'seed',
  });

  // v2: c2, 04/2026 (semester 2026-1) — vd2 completed WITH pdf and counts → not missing
  p.repos.visits.insert({
    id: 'v2', cityId: 'c2', period: '04/2026', mainDate: '2026-04-20',
    createdAt: '2026-04-20T00:00:00.000Z', createdBy: 'seed',
  });
  p.repos.visitDepartments.insert({
    id: 'vd2', visitId: 'v2', departmentId: 'd1', cityId: 'c2', period: '04/2026',
    completedAt: '2026-04-21T00:00:00.000Z', completedBy: 'seed',
    pdfFileId: 'file-1', pdfUrl: 'https://drive.example/file-1',
    countYes: 5, countYesWithCaveats: 1, countNo: 0, countNotApplicable: 0,
    createdAt: '2026-04-20T00:00:00.000Z', createdBy: 'seed',
  });
  // f2: in_treatment, medium, no deadline (not overdue)
  p.repos.findings.insert({
    id: 'f2', code: 'A-0002', visitDepartmentId: 'vd2', visitId: 'v2', cityId: 'c2', departmentId: 'd1', period: '04/2026',
    itemText: 'Rede?', severity: 'medium', response: 'yes_with_caveats', status: 'in_treatment',
    createdAt: '2026-04-21T00:00:00.000Z', createdBy: 'seed', updatedAt: '2026-04-21T00:00:00.000Z', updatedBy: 'seed',
  });

  // v3: c1, 08/2026 (semester 2026-2 = current) — vd3 NOT completed
  p.repos.visits.insert({
    id: 'v3', cityId: 'c1', period: '08/2026', mainDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'seed',
  });
  p.repos.visitDepartments.insert({
    id: 'vd3', visitId: 'v3', departmentId: 'd1', cityId: 'c1', period: '08/2026',
    createdAt: '2026-08-01T00:00:00.000Z', createdBy: 'seed',
  });

  // Reviews inserted directly (bypassing saveReview) for c1's v3, current semester:
  // 2 resolved + 2 not_resolved → resolutionRateSemester for c1 = 0.5
  p.repos.findingReviews.insert({
    id: 'r1', findingId: 'f1', type: 'visit_review', visitId: 'v3', result: 'resolved',
    createdAt: '2026-08-02T00:00:00.000Z', createdBy: 'seed',
  });
  p.repos.findingReviews.insert({
    id: 'r2', findingId: 'f3', type: 'visit_review', visitId: 'v3', result: 'resolved',
    createdAt: '2026-08-02T00:00:00.000Z', createdBy: 'seed',
  });
  p.repos.findingReviews.insert({
    id: 'r3', findingId: 'f1', type: 'visit_review', visitId: 'v3', result: 'not_resolved', notes: 'ainda pendente',
    createdAt: '2026-08-02T00:00:00.000Z', createdBy: 'seed',
  });
  p.repos.findingReviews.insert({
    id: 'r4', findingId: 'f3', type: 'visit_review', visitId: 'v3', result: 'not_resolved', notes: 'ainda pendente',
    createdAt: '2026-08-02T00:00:00.000Z', createdBy: 'seed',
  });
});

describe('dashboardSummary', () => {
  it('regional, no city scope: aggregates across all active cities', () => {
    const s = dashboardSummary(ctx('regional'), {});

    expect(s.openByCity).toEqual([
      { cityId: 'c2', cityName: 'Americana', open: 1, overdue: 0 },
      { cityId: 'c1', cityName: 'Sumaré', open: 1, overdue: 1 },
    ]);
    expect(s.openByDepartment).toEqual([
      { departmentId: 'd1', departmentName: 'Informática', open: 2 },
    ]);
    expect(s.overdue).toBe(1);
    expect(s.highSeverityOpen).toBe(1);
    expect(s.completedMissingPdfOrCounts).toBe(1);
    expect(s.citiesVisitedInSemester).toEqual({ visited: 1, total: 2 });

    expect(s.latestVisits.map(vp => vp.visit.id)).toEqual(['v3', 'v2', 'v1']);
    const [vp3, vp2, vp1] = s.latestVisits;
    expect(vp3).toMatchObject({ cityName: 'Sumaré', done: 0, total: 1, missingPdfOrCounts: 0 });
    expect(vp2).toMatchObject({ cityName: 'Americana', done: 1, total: 1, missingPdfOrCounts: 0 });
    expect(vp1).toMatchObject({ cityName: 'Sumaré', done: 1, total: 1, missingPdfOrCounts: 1 });

    expect(s.resolutionRateSemester).toBeUndefined();
  });

  it('local user of c1: forced to own city everywhere, including resolution rate', () => {
    const s = dashboardSummary(ctx('local', 'c1'), { cityId: 'c2' }); // payload ignored for local

    expect(s.openByCity).toEqual([
      { cityId: 'c1', cityName: 'Sumaré', open: 1, overdue: 1 },
    ]);
    expect(s.openByDepartment).toEqual([
      { departmentId: 'd1', departmentName: 'Informática', open: 1 },
    ]);
    expect(s.overdue).toBe(1);
    expect(s.highSeverityOpen).toBe(1);
    expect(s.completedMissingPdfOrCounts).toBe(1);
    expect(s.citiesVisitedInSemester).toEqual({ visited: 1, total: 1 });
    expect(s.latestVisits.map(vp => vp.visit.id)).toEqual(['v3', 'v1']);
    expect(s.resolutionRateSemester).toBe(0.5);
  });

  it('regional with payload.cityId c2: scoped to c2, no reviews in current semester → rate undefined', () => {
    const s = dashboardSummary(ctx('regional'), { cityId: 'c2' });

    expect(s.openByCity).toEqual([
      { cityId: 'c2', cityName: 'Americana', open: 1, overdue: 0 },
    ]);
    expect(s.openByDepartment).toEqual([
      { departmentId: 'd1', departmentName: 'Informática', open: 1 },
    ]);
    expect(s.overdue).toBe(0);
    expect(s.highSeverityOpen).toBe(0);
    expect(s.completedMissingPdfOrCounts).toBe(0);
    expect(s.citiesVisitedInSemester).toEqual({ visited: 0, total: 1 });
    expect(s.latestVisits.map(vp => vp.visit.id)).toEqual(['v2']);
    expect(s.resolutionRateSemester).toBeUndefined();
  });

  it('single city in scope with zero open findings is still listed (not dropped)', () => {
    // c2 has no unresolved findings at all in this variant
    p.repos.findings.rows.length = 0;
    const s = dashboardSummary(ctx('regional'), { cityId: 'c2' });
    expect(s.openByCity).toEqual([
      { cityId: 'c2', cityName: 'Americana', open: 0, overdue: 0 },
    ]);
  });

  it('regional, no scope: cities with zero open/overdue are excluded from openByCity', () => {
    p.repos.findings.rows.length = 0;
    const s = dashboardSummary(ctx('regional'), {});
    expect(s.openByCity).toEqual([]);
  });

  it('single-city scope on a since-deactivated city: openByCity still reflects the true unresolved count, consistent with overdue/highSeverityOpen (final review wave, item 1)', () => {
    p.repos.cities.update({ id: 'c1', name: 'Sumaré', active: false });
    const s = dashboardSummary(ctx('regional'), { cityId: 'c1' });
    // c1 has f1 (open, high, overdue) and f3 (resolved, not counted) — same as the
    // "local user of c1" case above, just via an explicit payload.cityId and with the
    // city deactivated in between. Before the fix, `citiesInScope` was derived from
    // the *active-only* city list even in single-city scope, so a deactivated scoped
    // city was filtered out and `openByCity` came back empty/zeroed while `overdue`/
    // `highSeverityOpen` (computed independently from `unresolved`) still counted its
    // findings — an inconsistent dashboard.
    expect(s.openByCity).toEqual([
      { cityId: 'c1', cityName: 'Sumaré', open: 1, overdue: 1 },
    ]);
    expect(s.overdue).toBe(1);
    expect(s.highSeverityOpen).toBe(1);
  });
});
