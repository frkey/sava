/**
 * DESIGN_REFERENCE §2 "Modal": scrim + white panel, title, body, footer actions.
 * Closes on scrim click and Escape.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { t } from '../strings/pt';

export interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose(): void;
  /** Extra class on `.dialog-panel` — e.g. PdfViewer.tsx widens the panel for the
   *  embedded PDF iframe. Optional, additive; existing callers are unaffected. */
  className?: string;
}

export function Dialog({ open, title, children, footer, onClose, className }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const panelClass = ['dialog-panel', className].filter(Boolean).join(' ');

  return (
    <div className="dialog-scrim" onClick={onClose}>
      <div className={panelClass} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <div className="dialog-title">{title}</div>
          <button type="button" className="dialog-close" aria-label={t.common.close} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
