/**
 * DESIGN_REFERENCE §2 "Buttons": primary / secondary (outline) / danger, loading
 * ("Salvando…" + spinner, per the canonical loading-button pattern), disabled.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { t } from '../strings/pt';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Overrides the default "Salvando…" loading label (DESIGN_REFERENCE §2: the
   *  loading-button pattern reuses the same shell with a context label, e.g.
   *  "Entrando…", "Salvando revisão…"). Defaults to `t.common.saving`. */
  loadingLabel?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, loading ? 'btn-loading' : '', className].filter(Boolean).join(' ');
  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {loading ? (
        <>
          <span className="btn-spinner" aria-hidden="true" />
          {loadingLabel ?? t.common.saving}
        </>
      ) : (
        children
      )}
    </button>
  );
}
