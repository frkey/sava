/**
 * Small presentational pieces shared by every step of the visit registration field
 * flow (D1–D6, spec §8.5) — see ../Visit.tsx's file header for how the steps fit
 * together. Kept out of Visit.tsx itself so that file stays focused on orchestration.
 */
import type { ReactNode } from 'react';
import { t } from '../../strings/pt';

export function VisitAppBar(
  { title, subtitle, onBack, right }: { title: ReactNode; subtitle?: ReactNode; onBack(): void; right?: ReactNode },
) {
  return (
    <div className="visit-appbar">
      <button type="button" className="subpage-back" aria-label={t.common.back} onClick={onBack}>‹</button>
      <div className="visit-appbar-titles">
        <div className="visit-appbar-title">{title}</div>
        {subtitle ? <div className="visit-appbar-subtitle">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}

/** "● salvo agora" (D4–D6 app bar) — shown once at least one save has happened during
 *  this department-flow session (see DepartmentFlow's `saved` state in Visit.tsx). Not
 *  wired to real request freshness — same reassurance-only role as D3's static
 *  "⟳ atualizado" (DeptGrid.tsx), just for the per-department sub-screens. */
export function SavedIndicator({ saved }: { saved: boolean }) {
  if (!saved) return null;
  return (
    <span className="visit-appbar-sync">
      <span className="visit-appbar-sync-dot" aria-hidden="true" />
      {t.common.savedNow}
    </span>
  );
}

export type DeptStep = 'participation' | 'review' | 'newFindings';

const STEP_ORDER: { key: DeptStep; label: string }[] = [
  { key: 'participation', label: t.visit.steps.participation },
  { key: 'review', label: t.visit.steps.review },
  { key: 'newFindings', label: t.visit.steps.newFindings },
];

/** Strips the "N · " ordinal prefix for the done-tab's "✓ {name}" label (D5/D6 app
 *  bars show "✓ Participação", never "✓ 1 · Participação"). */
function bareLabel(label: string): string {
  return label.replace(/^\d+\s*·\s*/, '');
}

export interface StepTabsProps {
  step: DeptStep;
  onChange(step: DeptStep): void;
  participationDone: boolean;
  reviewDone: boolean;
}

/** Free navigation between the three steps (no forward-only gate) — every step
 *  persists immediately and the flow is explicitly resumable/interruptible (spec
 *  §8.5), so nothing about visiting a later tab first is unsafe. */
export function StepTabs({ step, onChange, participationDone, reviewDone }: StepTabsProps) {
  const doneByKey: Record<DeptStep, boolean> = {
    participation: participationDone, review: reviewDone, newFindings: false,
  };
  return (
    <div className="visit-step-tabs">
      {STEP_ORDER.map(tab => {
        const isActive = tab.key === step;
        const done = doneByKey[tab.key];
        const cls = isActive ? 'visit-step-tab-active' : done ? 'visit-step-tab-done' : 'visit-step-tab-pending';
        return (
          <button
            key={tab.key}
            type="button"
            className={`visit-step-tab ${cls}`}
            onClick={() => onChange(tab.key)}
            data-step={tab.key}
          >
            {!isActive && done ? t.visit.stepDoneLabel(bareLabel(tab.label)) : tab.label}
          </button>
        );
      })}
    </div>
  );
}
