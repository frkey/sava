import type { Finding, FindingReview, FindingStatus, FindingFilters } from '../../shared/types';
import { UNRESOLVED } from '../../shared/types';
import { fail } from '../lib/errors';
import { requireString, requireEnum, optionalString, isValidDate, isOverdue } from '../lib/validate';
import type { Ctx } from './ports';
import { audit } from './ports';
import { assertCityScope } from '../api/dispatcher';

const SEVERITIES = ['high', 'medium', 'low'] as const;
const RESPONSES = ['no', 'yes_with_caveats'] as const;
const STATUSES = ['open', 'in_treatment', 'resolved', 'cancelled'] as const;

const MANUAL_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  open: ['in_treatment', 'resolved', 'cancelled'],
  in_treatment: ['open', 'resolved', 'cancelled'], // open↔in_treatment both manual
  resolved: ['open'],
  cancelled: ['open'],
};

/** Pure — reused by Task 12 (automatic transitions during visit review). */
export function applyTransition(f: Finding, to: FindingStatus, meta: { nowIso: string; userId: string }): Finding {
  const next = { ...f, status: to, updatedAt: meta.nowIso, updatedBy: meta.userId };
  if (to === 'resolved') { next.resolvedAt = meta.nowIso; next.resolvedBy = meta.userId; }
  else { next.resolvedAt = undefined; next.resolvedBy = undefined; }
  return next;
}

/** Next sequential code, zero-padded to 4 digits (e.g. A-0001). Pure. */
export function nextCode(findings: Finding[]): string {
  let max = 0;
  for (const f of findings) {
    const m = /^A-(\d+)$/.exec(f.code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `A-${String(max + 1).padStart(4, '0')}`;
}

export function listFindings(ctx: Ctx, payload: { filters?: FindingFilters }): Finding[] {
  const filters = payload.filters ?? {};
  const cityId = ctx.user.role === 'local' ? ctx.user.cityId : filters.cityId;
  const text = filters.text?.trim().toLowerCase();
  const today = ctx.ports.todayIso();
  return ctx.ports.repos.findings.all()
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

export function getFinding(ctx: Ctx, payload: { id: string }): { finding: Finding; reviews: FindingReview[] } {
  const id = requireString(payload.id, 'apontamento');
  const finding = ctx.ports.repos.findings.byId(id);
  if (!finding) fail('NOT_FOUND', 'Apontamento não encontrado.');
  assertCityScope(ctx, finding.cityId);
  const reviews = ctx.ports.repos.findingReviews.all()
    .filter(r => r.findingId === id)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return { finding, reviews };
}

export function saveFinding(
  ctx: Ctx,
  payload: { finding: Partial<Finding> & { itemText: string }; force?: boolean },
): Finding {
  const input = payload.finding;
  const itemText = requireString(input.itemText, 'texto do item');
  if (input.deadline !== undefined && input.deadline !== '' && !isValidDate(input.deadline))
    fail('VALIDATION', 'Prazo inválido.');

  return ctx.ports.lock(() => {
    const nowIso = ctx.ports.now().toISOString();

    if (input.id) {
      const existing = ctx.ports.repos.findings.byId(input.id);
      if (!existing) fail('NOT_FOUND', 'Apontamento não encontrado.');
      assertCityScope(ctx, existing.cityId);

      const severity = input.severity !== undefined
        ? requireEnum(input.severity, 'severidade', SEVERITIES)
        : existing.severity;
      const response = input.response !== undefined
        ? requireEnum(input.response, 'resposta', RESPONSES)
        : existing.response;

      const updated: Finding = {
        ...existing,
        itemText,
        itemRef: input.itemRef !== undefined ? optionalString(input.itemRef) : existing.itemRef,
        section: input.section !== undefined ? optionalString(input.section) : existing.section,
        severity,
        response,
        considerations: input.considerations !== undefined ? optionalString(input.considerations) : existing.considerations,
        deadline: input.deadline !== undefined ? optionalString(input.deadline) : existing.deadline,
        assignee: input.assignee !== undefined ? optionalString(input.assignee) : existing.assignee,
        updatedAt: nowIso, updatedBy: ctx.user.id,
      };
      ctx.ports.repos.findings.update(updated);
      audit(ctx.ports, ctx.user.id, 'findings.save', 'Findings', updated.id);
      ctx.ports.invalidateCache(['findings']);
      return updated;
    }

    const visitDepartmentId = requireString(input.visitDepartmentId, 'departamento da visita');
    const vd = ctx.ports.repos.visitDepartments.byId(visitDepartmentId);
    if (!vd) fail('NOT_FOUND', 'Departamento da visita não encontrado.');
    assertCityScope(ctx, vd.cityId);

    const severity = requireEnum(input.severity, 'severidade', SEVERITIES);
    const response = requireEnum(input.response, 'resposta', RESPONSES);
    const itemRef = optionalString(input.itemRef);
    const section = optionalString(input.section);
    const considerations = optionalString(input.considerations);
    const deadline = optionalString(input.deadline);
    const assignee = optionalString(input.assignee);

    if (itemRef) {
      const dup = ctx.ports.repos.findings.all().find(f =>
        f.cityId === vd.cityId && f.departmentId === vd.departmentId
        && f.itemRef === itemRef && UNRESOLVED.includes(f.status));
      if (dup && !payload.force)
        fail('CONFLICT', 'Já existe um apontamento em aberto para este item.', { existingFindingId: dup.id });
    }

    const code = nextCode(ctx.ports.repos.findings.all());
    const created: Finding = {
      id: ctx.ports.uuid(), code, visitDepartmentId,
      visitId: vd.visitId, cityId: vd.cityId, departmentId: vd.departmentId, period: vd.period,
      itemRef, section, itemText, severity, response, considerations,
      status: 'open', deadline, assignee,
      createdAt: nowIso, createdBy: ctx.user.id, updatedAt: nowIso, updatedBy: ctx.user.id,
    };
    ctx.ports.repos.findings.insert(created);
    audit(ctx.ports, ctx.user.id, 'findings.save', 'Findings', created.id);
    ctx.ports.invalidateCache(['findings']);
    return created;
  });
}

export function updateStatus(ctx: Ctx, payload: { id: string; status: FindingStatus; note: string }): Finding {
  const id = requireString(payload.id, 'apontamento');
  const status = requireEnum(payload.status, 'status', STATUSES);
  const note = requireString(payload.note, 'observação');

  return ctx.ports.lock(() => {
    const existing = ctx.ports.repos.findings.byId(id);
    if (!existing) fail('NOT_FOUND', 'Apontamento não encontrado.');
    assertCityScope(ctx, existing.cityId);

    const allowed = MANUAL_TRANSITIONS[existing.status];
    if (!allowed.includes(status))
      fail('VALIDATION', `Transição de status não permitida: ${existing.status} → ${status}.`);

    const nowIso = ctx.ports.now().toISOString();
    const updated = applyTransition(existing, status, { nowIso, userId: ctx.user.id });
    ctx.ports.repos.findings.update(updated);

    const review: FindingReview = {
      id: ctx.ports.uuid(), findingId: existing.id, type: 'status_change',
      newStatus: status, notes: note, visitId: undefined,
      createdAt: nowIso, createdBy: ctx.user.id,
    };
    ctx.ports.repos.findingReviews.insert(review);

    audit(ctx.ports, ctx.user.id, 'findings.updateStatus', 'Findings', updated.id);
    ctx.ports.invalidateCache(['findings']);
    return updated;
  });
}
