/**
 * §8.6 E4 — temp password shown once, after `users.save` (create) or
 * `users.resetPassword`. Bespoke scrim/panel (not the shared Dialog component): the
 * password must only be dismissed via the explicit "Concluído — já copiei a senha"
 * button — no backdrop-click or Escape close, since losing this screen loses the one
 * chance to read the password ("Ela não poderá ser vista de novo.", DESIGN_REFERENCE
 * §8.6).
 */
import { useState } from 'react';
import { Button } from '../../components/Button';
import { t } from '../../strings/pt';

export interface TempPasswordDialogProps {
  name: string;
  password: string;
  /** Defaults to the "user created" copy — pass `t.admin.passwordResetTitle` when this
   *  dialog follows `users.resetPassword` for an existing user instead of `users.save`
   *  creating a new one, so the title doesn't misleadingly say "Usuário criado". */
  title?: string;
  onClose(): void;
}

export function TempPasswordDialog({ name, password, title, onClose }: TempPasswordDialogProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard API denied — the password is still visible in the
      // secret box for manual copy, so this is a silent no-op.
    }
  }

  return (
    <div className="temp-password-scrim" role="dialog" aria-modal="true" aria-label={title ?? t.admin.userCreatedTitle}>
      <div className="temp-password-panel">
        <div className="temp-password-icon" aria-hidden="true">✓</div>
        <div className="temp-password-title">{title ?? t.admin.userCreatedTitle}</div>
        <div className="temp-password-body">{t.admin.deliverPasswordInPerson(name)}</div>

        <div className="temp-password-secret-box">
          <span className="temp-password-secret" data-testid="temp-password-secret">{password}</span>
          <Button
            type="button"
            variant="secondary"
            className="temp-password-copy-btn"
            onClick={() => { void handleCopy(); }}
          >
            {copied ? '✓' : t.admin.copy}
          </Button>
        </div>

        <div className="banner banner-warning">
          <span className="banner-icon" aria-hidden="true">!</span>
          <span className="banner-text">{t.admin.forcedChangeNotice}</span>
        </div>

        <Button type="button" variant="secondary" className="temp-password-done-btn" onClick={onClose}>
          {t.admin.doneCopiedPassword}
        </Button>
      </div>
    </div>
  );
}
