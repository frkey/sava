import type { Visit, VisitDepartment } from '../../shared/types';
import { fail } from '../lib/errors';
import { requireString, optionalString, isValidDate, isValidPeriod } from '../lib/validate';
import type { Ctx } from './ports';
import { audit } from './ports';
import { assertCityScope } from '../api/dispatcher';

const COUNT_FIELDS = ['countYes', 'countYesWithCaveats', 'countNo', 'countNotApplicable'] as const;

/** Returns a shallow copy of obj keeping only properties whose value is not undefined. */
function definedFields<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

export function listVisits(ctx: Ctx, payload: { cityId?: string; period?: string }): Visit[] {
  const cityId = ctx.user.role === 'local' ? ctx.user.cityId : payload.cityId;
  return ctx.ports.repos.visits.all()
    .filter(v => (!cityId || v.cityId === cityId) && (!payload.period || v.period === payload.period));
}

export function getVisit(ctx: Ctx, payload: { id: string }): { visit: Visit; departments: VisitDepartment[] } {
  const id = requireString(payload.id, 'visita');
  const visit = ctx.ports.repos.visits.byId(id);
  if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
  assertCityScope(ctx, visit.cityId);
  const departments = ctx.ports.repos.visitDepartments.all().filter(d => d.visitId === visit.id);
  return { visit, departments };
}

export function saveVisit(
  ctx: Ctx,
  payload: { visit: Partial<Visit> & { cityId: string; period: string; mainDate: string } },
): Visit {
  const cityId = requireString(payload.visit.cityId, 'cidade');
  const period = requireString(payload.visit.period, 'competência');
  const mainDate = requireString(payload.visit.mainDate, 'data');
  if (!isValidPeriod(period)) fail('VALIDATION', 'Competência inválida. Use o formato MM/AAAA.');
  if (!isValidDate(mainDate)) fail('VALIDATION', 'Data inválida.');
  const notes = optionalString(payload.visit.notes);

  return ctx.ports.lock(() => {
    if (payload.visit.id) {
      const existing = ctx.ports.repos.visits.byId(payload.visit.id);
      if (!existing) fail('NOT_FOUND', 'Visita não encontrada.');
      assertCityScope(ctx, existing.cityId);
      const changingCityOrPeriod = existing.cityId !== cityId || existing.period !== period;
      if (changingCityOrPeriod) {
        const hasDepartments = ctx.ports.repos.visitDepartments.all().some(d => d.visitId === existing.id);
        if (hasDepartments)
          fail('CONFLICT', 'Não é possível alterar cidade ou competência: já existem departamentos registrados nesta visita.');
        const city = ctx.ports.repos.cities.byId(cityId);
        if (!city) fail('NOT_FOUND', 'Cidade não encontrada.');
        if (!city.active) fail('VALIDATION', 'Cidade inativa.');
        const clash = ctx.ports.repos.visits.all().find(v => v.cityId === cityId && v.period === period && v.id !== existing.id);
        if (clash) fail('CONFLICT', 'Já existe uma visita desta cidade nesta competência.', { existingVisitId: clash.id });
      }
      const updated: Visit = {
        ...existing, cityId, period, mainDate,
        notes: payload.visit.notes !== undefined ? optionalString(payload.visit.notes) : existing.notes,
      };
      ctx.ports.repos.visits.update(updated);
      audit(ctx.ports, ctx.user.id, 'visits.save', 'Visits', updated.id);
      ctx.ports.invalidateCache(['visits']);
      return updated;
    }

    const city = ctx.ports.repos.cities.byId(cityId);
    if (!city) fail('NOT_FOUND', 'Cidade não encontrada.');
    if (!city.active) fail('VALIDATION', 'Cidade inativa.');
    const clash = ctx.ports.repos.visits.all().find(v => v.cityId === cityId && v.period === period);
    if (clash) fail('CONFLICT', 'Já existe uma visita desta cidade nesta competência.', { existingVisitId: clash.id });

    const created: Visit = {
      id: ctx.ports.uuid(), cityId, period, mainDate, notes,
      createdAt: ctx.ports.now().toISOString(), createdBy: ctx.user.id,
    };
    ctx.ports.repos.visits.insert(created);
    audit(ctx.ports, ctx.user.id, 'visits.save', 'Visits', created.id);
    ctx.ports.invalidateCache(['visits']);
    return created;
  });
}

export function deleteVisit(ctx: Ctx, payload: { id: string }): void {
  const id = requireString(payload.id, 'visita');
  ctx.ports.lock(() => {
    const visit = ctx.ports.repos.visits.byId(id);
    if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
    const hasDepartments = ctx.ports.repos.visitDepartments.all().some(d => d.visitId === id);
    if (hasDepartments)
      fail('CONFLICT', 'Não é possível excluir: existem departamentos registrados nesta visita. Correção manual na planilha (owner account) se necessário.');
    ctx.ports.repos.visits.remove(id);
    audit(ctx.ports, ctx.user.id, 'visits.delete', 'Visits', id);
    ctx.ports.invalidateCache(['visits']);
  });
}

export function saveVisitDepartment(
  ctx: Ctx,
  payload: { visitDepartment: Partial<VisitDepartment> & { visitId: string; departmentId: string } },
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

  return ctx.ports.lock(() => {
    const visit = ctx.ports.repos.visits.byId(visitId);
    if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
    assertCityScope(ctx, visit.cityId);

    const existing = ctx.ports.repos.visitDepartments.all()
      .find(d => d.visitId === visitId && d.departmentId === departmentId);

    if (!existing) {
      const department = ctx.ports.repos.departments.byId(departmentId);
      if (!department || !department.active) fail('VALIDATION', 'Departamento inválido ou inativo.');
      const created: VisitDepartment = {
        ...patch,
        id: ctx.ports.uuid(), visitId, departmentId,
        cityId: visit.cityId, period: visit.period,
        createdAt: ctx.ports.now().toISOString(), createdBy: ctx.user.id,
      };
      ctx.ports.repos.visitDepartments.insert(created);
      audit(ctx.ports, ctx.user.id, 'visitDepartments.save', 'VisitDepartments', created.id);
      ctx.ports.invalidateCache(['visitDepartments']);
      return created;
    }

    const updated: VisitDepartment = {
      ...existing,
      ...patch,
      id: existing.id, visitId: existing.visitId, departmentId: existing.departmentId,
      cityId: visit.cityId, period: visit.period,
    };
    ctx.ports.repos.visitDepartments.update(updated);
    audit(ctx.ports, ctx.user.id, 'visitDepartments.save', 'VisitDepartments', updated.id);
    ctx.ports.invalidateCache(['visitDepartments']);
    return updated;
  });
}

export function markDone(ctx: Ctx, payload: { id: string }): VisitDepartment {
  const id = requireString(payload.id, 'departamento da visita');
  return ctx.ports.lock(() => {
    const existing = ctx.ports.repos.visitDepartments.byId(id);
    if (!existing) fail('NOT_FOUND', 'Registro não encontrado.');
    assertCityScope(ctx, existing.cityId);
    const updated: VisitDepartment = {
      ...existing, completedAt: ctx.ports.now().toISOString(), completedBy: ctx.user.id,
    };
    ctx.ports.repos.visitDepartments.update(updated);
    audit(ctx.ports, ctx.user.id, 'visitDepartments.markDone', 'VisitDepartments', updated.id);
    ctx.ports.invalidateCache(['visitDepartments']);
    return updated;
  });
}

export function deleteVisitDepartment(ctx: Ctx, payload: { id: string }): void {
  const id = requireString(payload.id, 'departamento da visita');
  ctx.ports.lock(() => {
    const vd = ctx.ports.repos.visitDepartments.byId(id);
    if (!vd) fail('NOT_FOUND', 'Registro não encontrado.');
    const hasFindings = ctx.ports.repos.findings.all().some(f => f.visitDepartmentId === id);
    const hasReviews = ctx.ports.repos.findingReviews.all().some(r =>
      r.visitId === vd.visitId && ctx.ports.repos.findings.byId(r.findingId)?.departmentId === vd.departmentId,
    );
    if (hasFindings || hasReviews)
      fail('CONFLICT', 'Não é possível excluir: existem apontamentos ou revisões associados. Correção manual na planilha (owner account) se necessário.');
    ctx.ports.repos.visitDepartments.remove(id);
    audit(ctx.ports, ctx.user.id, 'visitDepartments.delete', 'VisitDepartments', id);
    ctx.ports.invalidateCache(['visitDepartments']);
  });
}
