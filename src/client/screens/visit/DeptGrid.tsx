/**
 * D3 — department grid, spec §8.5 step B. Derives each active department's card state
 * purely from `visits.get`'s `departments` rows (no separate "state" field anywhere):
 *   - no row for the department            → não iniciado
 *   - row exists, `completedAt` unset      → iniciado
 *   - row exists, `completedAt` set        → concluído (+ "falta PDF/resumo" badge
 *     when `!pdfFileId || countYes === undefined`, spec §5's exact missing-data rule)
 *
 * The admin-only "Excluir visita" trigger calls `visits.delete` non-silently — the
 * default (non-silent) `useApiMutation` error toast already satisfies the task brief's
 * "CONFLICT → toast server message" (visits.delete CONFLICTs whenever ANY department
 * row exists on the visit, spec §5/§7, so this is realistically only actionable right
 * after creating a visit by mistake before touching any department).
 */
import { useState } from 'react';
import type { Department, Finding, Visit, VisitDepartment } from '../../../shared/types';
import { useApiMutation } from '../../hooks/useApi';
import { useToast } from '../../state/toasts';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { t } from '../../strings/pt';
import { formatDatePt } from '../../lib/format';
import { VisitAppBar } from './shared';

export interface DeptGridProps {
  visit: Visit;
  cityName: string;
  vds: VisitDepartment[];
  departments: Department[]; // active only
  findings: Finding[]; // every finding of the visit's city (used to count "N novos" per dept)
  isAdmin: boolean;
  onSelectDepartment(id: string): void;
  onBack(): void;
  onDeleted(): void;
}

type DeptState = 'done' | 'started' | 'notStarted';

function deptState(vd: VisitDepartment | undefined): DeptState {
  if (!vd) return 'notStarted';
  return vd.completedAt ? 'done' : 'started';
}

/** Mirrors src/server/services/dashboard.ts's missing-data rule
 *  (`!pdfFileId || countYes === undefined`) — keep in sync. */
function missingLabel(vd: VisitDepartment): string | undefined {
  const missingPdf = !vd.pdfFileId;
  const missingCounts = vd.countYes === undefined;
  if (missingPdf && missingCounts) return t.labels.missingBoth;
  if (missingPdf) return t.labels.missingPdf;
  if (missingCounts) return t.labels.missingSummary;
  return undefined;
}

function statusLine(state: DeptState, newCount: number): string {
  if (state === 'notStarted') return t.visit.cardStatus.notStarted;
  if (state === 'started') return t.visit.cardStatus.startedMissingReview;
  if (newCount === 0) return t.visit.cardStatus.doneNoNew;
  if (newCount === 1) return t.visit.cardStatus.doneWithOneNew;
  return t.visit.cardStatus.doneWithNew(newCount);
}

const STATE_CLASS: Record<DeptState, string> = { done: 'done', started: 'started', notStarted: 'not-started' };

export function DeptGrid({
  visit, cityName, vds, departments, findings, isAdmin, onSelectDepartment, onBack, onDeleted,
}: DeptGridProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMutation = useApiMutation('visits.delete');
  const toast = useToast();

  const vdByDept = new Map(vds.map(vd => [vd.departmentId, vd]));
  const doneCount = departments.filter(d => vdByDept.get(d.id)?.completedAt).length;
  const progressPct = departments.length ? (doneCount / departments.length) * 100 : 0;

  async function handleDelete() {
    try {
      await deleteMutation.run({ id: visit.id });
    } catch {
      return; // default (non-silent) error toast already shown, server message included
    }
    toast.show(t.visit.deleteVisitSuccessToast, 'success');
    onDeleted();
  }

  return (
    <div className="visit-screen" data-screen="visit">
      <VisitAppBar
        title={<>{cityName} · <span className="visit-appbar-period">{visit.period}</span></>}
        subtitle={t.visit.visitOfDate(formatDatePt(visit.mainDate))}
        onBack={onBack}
        right={
          isAdmin ? (
            <button type="button" className="visit-appbar-delete" onClick={() => setDeleteOpen(true)}>
              {t.visit.deleteVisitCta}
            </button>
          ) : (
            <span className="visit-appbar-sync">{t.common.synced}</span>
          )
        }
      />

      <div className="visit-grid-head">
        <div className="visit-grid-head-row">
          <span className="visit-grid-title">{t.visit.departmentsTitle}</span>
          {/* Mockup bolds only the done-count within "X de N concluídos" — plain text
           *  here since t.visit.progress returns one non-markup string (documented
           *  simplification, consistent with other small mockup deviations in this repo). */}
          <span className="visit-grid-count">{t.visit.progress(doneCount, departments.length)}</span>
        </div>
        <div className="visit-grid-track">
          <div className="visit-grid-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="visit-grid-helper">{t.visit.gridHelper}</div>
      </div>

      <div className="visit-grid-scroll">
        <div className="visit-grid">
          {departments.map(d => {
            const vd = vdByDept.get(d.id);
            const state = deptState(vd);
            const stateClass = STATE_CLASS[state];
            const newCount = findings.filter(f => f.visitId === visit.id && f.departmentId === d.id).length;
            const missing = state === 'done' && vd ? missingLabel(vd) : undefined;
            return (
              <button
                key={d.id}
                type="button"
                className={`visit-dept-card visit-dept-card-${stateClass}`}
                onClick={() => onSelectDepartment(d.id)}
                data-department-id={d.id}
                data-department-state={state}
              >
                <div className="visit-dept-card-head">
                  <span className={`visit-dept-card-icon visit-dept-card-icon-${stateClass}`} aria-hidden="true">
                    {state === 'done' ? '✓' : state === 'started' ? '◐' : ''}
                  </span>
                  {missing ? (
                    <span className="visit-dept-card-missing">{missing}</span>
                  ) : (
                    <span className="visit-dept-card-chevron" aria-hidden="true">›</span>
                  )}
                </div>
                <div className="visit-dept-card-name">{d.name}</div>
                <div className={`visit-dept-card-status visit-dept-card-status-${stateClass}`}>
                  {statusLine(state, newCount)}
                </div>
              </button>
            );
          })}
        </div>
        <div className="visit-grid-fade" aria-hidden="true" />
      </div>

      {deleteOpen ? (
        <Dialog
          open
          title={t.visit.deleteVisitConfirmTitle}
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>{t.common.back}</Button>
              <Button
                type="button" variant="danger" onClick={() => { void handleDelete(); }} loading={deleteMutation.saving}
              >
                {t.visit.deleteVisitCta}
              </Button>
            </>
          }
        >
          <div className="banner-text">{t.visit.deleteVisitConfirmBody}</div>
        </Dialog>
      ) : null}
    </div>
  );
}
