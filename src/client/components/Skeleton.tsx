/**
 * DESIGN_REFERENCE §2 "Skeleton": pulsing blocks mirroring the shape they stand in for.
 */
import type { CSSProperties } from 'react';

export type SkeletonVariant = 'line' | 'card';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({ variant = 'line', width, height, className }: SkeletonProps) {
  const classes = ['skeleton', `skeleton-${variant}`, className].filter(Boolean).join(' ');
  const style: CSSProperties = { width, height };
  return <div className={classes} style={style} aria-hidden="true" />;
}
