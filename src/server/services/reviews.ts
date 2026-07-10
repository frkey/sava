import type { FindingReview, ReviewQueueItem, ReviewResult } from '../../shared/types';
import { UNRESOLVED } from '../../shared/types';
import { fail } from '../lib/errors';
import { requireString, requireEnum, optionalString } from '../lib/validate';
import type { Ctx } from './ports';
import { audit } from './ports';
import { assertCityScope } from '../api/dispatcher';
import { applyTransition } from './findings';

const RESULTS = ['resolved', 'not_resolved', 'partial'] as const;

export function reviewQueue(ctx: Ctx, payload: { visitId: string; departmentId: string }): ReviewQueueItem[] {
  const visitId = requireString(payload.visitId, 'visita');
  const departmentId = requireString(payload.departmentId, 'departamento');

  const visit = ctx.ports.repos.visits.byId(visitId);
  if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
  assertCityScope(ctx, visit.cityId);

  const reviewsThisVisit = new Map(
    ctx.ports.repos.findingReviews.all()
      .filter(r => r.type === 'visit_review' && r.visitId === visitId)
      .map(r => [r.findingId, r] as const),
  );

  return ctx.ports.repos.findings.all()
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

export function saveReview(
  ctx: Ctx,
  payload: { findingId: string; visitId: string; result: ReviewResult; notes?: string },
): FindingReview {
  const findingId = requireString(payload.findingId, 'apontamento');
  const visitId = requireString(payload.visitId, 'visita');
  const result = requireEnum(payload.result, 'resultado', RESULTS);
  const notes = optionalString(payload.notes);
  if ((result === 'partial' || result === 'not_resolved') && !notes)
    fail('VALIDATION', 'Observação é obrigatória para este resultado.');

  return ctx.ports.lock(() => {
    const finding = ctx.ports.repos.findings.byId(findingId);
    if (!finding) fail('NOT_FOUND', 'Apontamento não encontrado.');
    const visit = ctx.ports.repos.visits.byId(visitId);
    if (!visit) fail('NOT_FOUND', 'Visita não encontrada.');
    assertCityScope(ctx, finding.cityId);
    if (visit.cityId !== finding.cityId)
      fail('VALIDATION', 'A visita não é da cidade deste apontamento.');

    const existing = ctx.ports.repos.findingReviews.all()
      .find(r => r.type === 'visit_review' && r.findingId === findingId && r.visitId === visitId);

    if (!existing && (finding.status === 'resolved' || finding.status === 'cancelled'))
      fail('CONFLICT', 'Apontamento já resolvido/cancelado — reabra antes de revisar.', { findingId });

    if (existing && finding.status === 'cancelled' && (result === 'resolved' || result === 'partial'))
      fail('CONFLICT', 'Apontamento cancelado — reabra antes de corrigir a revisão.', { findingId });

    const nowIso = ctx.ports.now().toISOString();
    const meta = { nowIso, userId: ctx.user.id };

    let updatedFinding = finding;
    if (result === 'resolved') updatedFinding = applyTransition(finding, 'resolved', meta);
    else if (result === 'partial') updatedFinding = applyTransition(finding, 'in_treatment', meta);
    else if (result === 'not_resolved' && finding.status === 'resolved') updatedFinding = applyTransition(finding, 'open', meta);

    if (updatedFinding !== finding) ctx.ports.repos.findings.update(updatedFinding);

    let review: FindingReview;
    if (existing) {
      review = { ...existing, result, notes, createdBy: ctx.user.id };
      ctx.ports.repos.findingReviews.update(review);
    } else {
      review = {
        id: ctx.ports.uuid(), findingId, type: 'visit_review', visitId,
        result, notes, createdAt: nowIso, createdBy: ctx.user.id,
      };
      ctx.ports.repos.findingReviews.insert(review);
    }

    audit(ctx.ports, ctx.user.id, 'findingReviews.save', 'FindingReviews', review.id);
    ctx.ports.invalidateCache(['findings']);
    return review;
  });
}
