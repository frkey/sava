import type { DashboardSummary, VisitProgress } from '../../shared/types';
import { UNRESOLVED } from '../../shared/types';
import { semesterOf, currentPeriodSemester, isOverdue } from '../lib/validate';
import type { Ctx } from './ports';

/** Pure read-only aggregation — no lock, no audit (spec §7/§8.2). */
export function dashboardSummary(ctx: Ctx, payload: { cityId?: string }): DashboardSummary {
  // local users are forced to their own city; others may optionally scope by payload.cityId
  const cityId = ctx.user.role === 'local' ? ctx.user.cityId : payload.cityId;
  const singleCityScope = !!cityId;
  const today = ctx.ports.todayIso();
  const currentSemester = currentPeriodSemester(ctx.ports.now());

  const allActiveCities = ctx.ports.repos.cities.all().filter(c => c.active);
  // Single-city scope must select the scoped city even if it has since been
  // deactivated — filtering it out here would zero `openByCity` for that city while
  // `overdue`/`highSeverityOpen` (computed independently from `unresolved`) still
  // count its findings, an inconsistent dashboard (final review wave, item 1).
  const citiesInScope = singleCityScope
    ? ctx.ports.repos.cities.all().filter(c => c.id === cityId)
    : allActiveCities;
  const activeDepartments = ctx.ports.repos.departments.all().filter(d => d.active);

  const findingsInScope = ctx.ports.repos.findings.all().filter(f => !cityId || f.cityId === cityId);
  const unresolved = findingsInScope.filter(f => UNRESOLVED.includes(f.status));

  const openByCityRows = citiesInScope.map(city => {
    const cityUnresolved = unresolved.filter(f => f.cityId === city.id);
    const overdue = cityUnresolved.filter(f => isOverdue(f, today)).length;
    return { cityId: city.id, cityName: city.name, open: cityUnresolved.length, overdue };
  });
  const openByCity = (singleCityScope ? openByCityRows : openByCityRows.filter(r => r.open > 0 || r.overdue > 0))
    .sort((a, b) => b.open - a.open || a.cityName.localeCompare(b.cityName));

  const openByDepartment = activeDepartments
    .map(d => ({
      departmentId: d.id,
      departmentName: d.name,
      open: unresolved.filter(f => f.departmentId === d.id).length,
    }))
    .filter(r => r.open > 0)
    .sort((a, b) => b.open - a.open || a.departmentName.localeCompare(b.departmentName));

  const overdue = unresolved.filter(f => isOverdue(f, today)).length;
  const highSeverityOpen = unresolved.filter(f => f.severity === 'high').length;

  const visitDepartmentsInScope = ctx.ports.repos.visitDepartments.all().filter(vd => !cityId || vd.cityId === cityId);
  const completedMissingPdfOrCounts = visitDepartmentsInScope
    .filter(vd => !!vd.completedAt && (!vd.pdfFileId || vd.countYes === undefined)).length;

  const visitsInScope = ctx.ports.repos.visits.all().filter(v => !cityId || v.cityId === cityId);
  const citiesWithVisitThisSemester = new Set(
    visitsInScope.filter(v => semesterOf(v.period) === currentSemester).map(v => v.cityId),
  );
  const citiesVisitedInSemester = singleCityScope
    ? { visited: citiesWithVisitThisSemester.has(cityId as string) ? 1 : 0, total: 1 }
    : {
        visited: allActiveCities.filter(c => citiesWithVisitThisSemester.has(c.id)).length,
        total: allActiveCities.length,
      };

  const cityNameById = new Map(ctx.ports.repos.cities.all().map(c => [c.id, c.name]));
  const allVisitDepartments = ctx.ports.repos.visitDepartments.all();
  const latestVisits: VisitProgress[] = [...visitsInScope]
    .sort((a, b) => (a.mainDate < b.mainDate ? 1 : a.mainDate > b.mainDate ? -1 : 0))
    .slice(0, 5)
    .map(visit => {
      const vds = allVisitDepartments.filter(vd => vd.visitId === visit.id);
      const completed = vds.filter(vd => !!vd.completedAt);
      return {
        visit,
        cityName: cityNameById.get(visit.cityId) ?? '',
        done: completed.length,
        total: vds.length,
        missingPdfOrCounts: completed.filter(vd => !vd.pdfFileId || vd.countYes === undefined).length,
      };
    });

  let resolutionRateSemester: number | undefined;
  if (singleCityScope) {
    const cityVisitIdsThisSemester = new Set(
      visitsInScope.filter(v => semesterOf(v.period) === currentSemester).map(v => v.id),
    );
    const reviews = ctx.ports.repos.findingReviews.all()
      .filter(r => r.type === 'visit_review' && r.visitId && cityVisitIdsThisSemester.has(r.visitId));
    if (reviews.length > 0)
      resolutionRateSemester = reviews.filter(r => r.result === 'resolved').length / reviews.length;
  }

  return {
    openByCity, openByDepartment, overdue, highSeverityOpen, completedMissingPdfOrCounts,
    citiesVisitedInSemester, latestVisits, resolutionRateSemester,
  };
}
