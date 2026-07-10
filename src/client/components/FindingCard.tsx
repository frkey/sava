/**
 * DESIGN_REFERENCE §8.3 C1 mobile finding card: cidade · departamento header + status
 * badge, code chip + item text, severity/response tags, prazo (overdue rows get the
 * loud left-border + red pill per `--overdue` tokens). The same fields render as a DT2
 * desktop table row inline in Findings.tsx (CSS-switched, not this component — the
 * table row's grid layout is specific to DT2's six columns, not reusable here).
 */
import type { Finding } from '../../shared/types';
import { StatusBadge } from './StatusBadge';
import { SeverityBadge } from './SeverityBadge';
import { responseLabel } from '../strings/pt';
import { findingDeadlineDisplay, isOverdueClient } from '../lib/format';

export interface FindingCardProps {
  finding: Finding;
  cityName: string;
  departmentName: string;
  onClick(): void;
}

export function FindingCard({ finding, cityName, departmentName, onClick }: FindingCardProps) {
  const overdue = isOverdueClient(finding);
  const deadline = findingDeadlineDisplay(finding);

  return (
    <button
      type="button"
      className={`finding-card${overdue ? ' finding-card-overdue' : ''}`}
      onClick={onClick}
      data-finding-id={finding.id}
    >
      <div className="finding-card-header">
        <span className="finding-card-title">{cityName} · {departmentName}</span>
        <StatusBadge status={finding.status} />
      </div>
      <div className="finding-card-text">
        {finding.itemRef ? <span className="finding-code-chip">{finding.itemRef}</span> : null}
        {finding.itemText}
      </div>
      <div className="finding-card-footer">
        <SeverityBadge severity={finding.severity} />
        <span className="response-tag">{responseLabel[finding.response]}</span>
        <span className="finding-card-spacer" />
        <span className={`finding-deadline finding-deadline-${deadline.kind}`}>{deadline.text}</span>
      </div>
    </button>
  );
}
