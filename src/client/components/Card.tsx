/**
 * DESIGN_REFERENCE §2 "Content card": white, bordered, radius 12, optional title + a
 * right-aligned link/action.
 */
import type { ReactNode } from 'react';

export interface CardProps {
  title?: string;
  rightAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, rightAction, children, className }: CardProps) {
  const classes = ['card', className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      {title || rightAction ? (
        <div className="card-header">
          {title ? <span className="card-title">{title}</span> : <span />}
          {rightAction ? <span className="card-right-action">{rightAction}</span> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </div>
  );
}
