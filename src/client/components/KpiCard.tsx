/**
 * DESIGN_REFERENCE §2 "KPI card": number 700 28–32px + label 500 12.5–13px `ink-600` +
 * optional sub 400 12px `ink-350`. Alert variant (vencidos): border `danger-border`,
 * number `danger-solid`, label `danger-text`. Positive variant (resolution rate):
 * number `success-text`. Renders as a `<button>` (not `<div>`) whenever `onClick` is
 * given — Dashboard.tsx wires each dashboard KPI's tap-to-filter navigation into
 * Apontamentos through this prop.
 */
import type { ReactNode } from 'react';

export type KpiCardVariant = 'default' | 'alert' | 'positive';

export interface KpiCardProps {
  value: ReactNode;
  label: string;
  sub?: string;
  variant?: KpiCardVariant;
  onClick?(): void;
}

export function KpiCard({ value, label, sub, variant = 'default', onClick }: KpiCardProps) {
  const classes = [
    'kpi-card',
    variant !== 'default' ? `kpi-card-${variant}` : '',
    onClick ? 'kpi-card-clickable' : '',
  ].filter(Boolean).join(' ');

  const content = (
    <>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </>
  );

  return onClick ? (
    <button type="button" className={classes} onClick={onClick}>{content}</button>
  ) : (
    <div className={classes}>{content}</div>
  );
}
