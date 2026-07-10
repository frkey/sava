/**
 * DESIGN_REFERENCE §2 "Empty state" (F1): icon circle + title + body + optional action.
 */
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state-icon">{icon}</div> : null}
      <div className="empty-state-title">{title}</div>
      {hint ? <div className="empty-state-hint">{hint}</div> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
