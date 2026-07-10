/**
 * DESIGN_REFERENCE §2 "Criticality tag (outlined)": ▲ Alta / ■ Média / ● Baixa.
 */
import type { Severity } from '../../shared/types';
import { t } from '../strings/pt';

export interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const classes = ['severity-badge', `severity-badge-${severity}`, className].filter(Boolean).join(' ');
  return <span className={classes}>{t.labels.criticalityTag[severity]}</span>;
}
