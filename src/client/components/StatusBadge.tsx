/**
 * DESIGN_REFERENCE §2 "Status badge (dot pill)": Aberto/Em tratamento/Resolvido/Cancelado.
 */
import type { FindingStatus } from '../../shared/types';
import { statusLabel } from '../strings/pt';

export interface StatusBadgeProps {
  status: FindingStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const classes = ['status-badge', `status-badge-${status}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      <span className="status-badge-dot" aria-hidden="true" />
      {statusLabel[status]}
    </span>
  );
}
