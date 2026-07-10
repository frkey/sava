/**
 * A3 — Password change (DESIGN_REFERENCE §8.1). Two modes sharing one screen:
 *  - `forced` (SessionUser.mustChangePassword): minimal app bar (logo only), no
 *    cancel, A3's "primeiro acesso" title/copy. Driven by App.tsx's top-level check —
 *    disappears reactively once the re-login below clears `mustChangePassword`.
 *  - `voluntary` (opened from the user menu, any time): app bar swaps to the
 *    sub-page pattern (§4: back "‹" + title), the back chevron doubles as Cancel via
 *    `onCancel`, and the "primeiro acesso" intro paragraph is skipped.
 *
 * CRITICAL: src/server/services/auth.ts#changePassword revokes every session for the
 * user ("client re-logs"), so the token this screen is currently using is dead the
 * instant the mutation below succeeds. The mockup's "Você continuará conectado após a
 * troca" promise is delivered as a silent re-login (`session.login` with the new
 * password), never `session.refreshMe()` — that would 401 against the now-revoked
 * token. See knowledge/.superpowers/sdd/task-2-report.md for how this was found.
 *
 * If that silent re-login itself fails (e.g. a network blip right after the password
 * change already took effect server-side), retrying on this screen would only confuse
 * the user (stale "senha atual" field, old password already dead) — so the catch
 * clears the local session (`session.clearLocal()`) and shows a dedicated toast
 * telling them to sign in again, instead of leaving them stranded here.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSession } from '../state/session';
import { useToast } from '../state/toasts';
import { useApiMutation } from '../hooks/useApi';
import { ApiError } from '../lib/gas';
import { Button } from '../components/Button';
import { t } from '../strings/pt';

export interface ChangePasswordProps {
  mode: 'forced' | 'voluntary';
  /** Required (renders the cancel affordance) when `mode === 'voluntary'`. Also
   *  called after a successful voluntary change, to dismiss back to the screen that
   *  was showing underneath — forced mode never passes this (its own disappearance is
   *  driven reactively by `mustChangePassword` clearing, see App.tsx). */
  onCancel?(): void;
}

const POLICY_MESSAGES = new Set([t.auth.policyMinLength, t.auth.policyLetter, t.auth.policyDigit]);

/** Mirrors src/server/lib/crypto.ts#checkPasswordPolicy exactly (min 8, ≥1 letter, ≥1 digit). */
function checkPolicy(pw: string): string | undefined {
  if (pw.length < 8) return t.auth.policyMinLength;
  if (!/[a-zA-Z]/.test(pw)) return t.auth.policyLetter;
  if (!/[0-9]/.test(pw)) return t.auth.policyDigit;
  return undefined;
}

export function ChangePassword({ mode, onCancel }: ChangePasswordProps) {
  const session = useSession();
  const toast = useToast();
  const changePassword = useApiMutation('auth.changePassword');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [currentError, setCurrentError] = useState<string | undefined>(undefined);
  const [newError, setNewError] = useState<string | undefined>(undefined);
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const minLengthOk = newPassword.length >= 8;
  const lettersNumbersOk = /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return; // double-submit guard
    setCurrentError(undefined);

    const policyError = checkPolicy(newPassword);
    setNewError(policyError);
    const mismatch = confirmPassword !== newPassword;
    setConfirmError(mismatch ? t.auth.confirmMismatch : undefined);
    if (policyError || mismatch) return;

    const user = session.user;
    if (!user) return;

    setBusy(true);
    try {
      await changePassword.run({ currentPassword, newPassword }, { silent: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : String(err);
      if (POLICY_MESSAGES.has(message)) setNewError(message);
      else setCurrentError(message);
      setBusy(false);
      return;
    }

    try {
      // Silent re-login (see file header) — the token above is already revoked.
      await session.login(user.login, newPassword);
    } catch {
      // changePassword already succeeded server-side (and revoked every session for
      // the user), but the immediate re-login failed — e.g. a network blip. Retrying
      // from this screen would fail confusingly ("Senha atual incorreta.") since the
      // old password no longer works, and the current-password field is now stale.
      // Clear the local session unconditionally — `expire()`'s latch exists to
      // coalesce concurrent UNAUTHORIZED failures into a single sessionExpired toast
      // and could no-op here, silently suppressing the toast below — so the app falls
      // through to the Login screen, with its own dedicated message instead of the
      // success toast.
      session.clearLocal();
      setBusy(false);
      toast.show(t.auth.passwordChangedSignInAgain, 'info');
      return;
    }
    setBusy(false);
    toast.show(t.auth.passwordChanged, 'success');
    onCancel?.();
  }

  const title = mode === 'forced' ? t.auth.changePasswordTitle : t.auth.changePasswordVoluntaryTitle;
  const currentPasswordLabel = mode === 'forced' ? t.auth.currentPasswordTemp : t.auth.currentPasswordPlain;

  return (
    <div className="change-password-screen" data-screen="change-password">
      <header className="cp-appbar">
        <div className="topbar-brand">
          {mode === 'voluntary' ? (
            <button type="button" className="subpage-back" aria-label={t.common.back} onClick={onCancel}>
              ‹
            </button>
          ) : null}
          <div className="brand-tile" aria-hidden="true">S</div>
          <span className="topbar-wordmark">{t.brand.wordmark}</span>
        </div>
      </header>

      <div className="cp-content">
        <div className="cp-inner">
          <div className={`cp-title${mode === 'forced' ? '' : ' cp-title-solo'}`}>{title}</div>
          {mode === 'forced' ? <div className="cp-intro">{t.auth.changePasswordIntro}</div> : null}

          <form onSubmit={e => { void handleSubmit(e); }} noValidate>
            <div className="field">
              <label className={`field-label${currentError ? ' is-error' : ''}`} htmlFor="cp-current">
                {currentPasswordLabel}
              </label>
              <input
                id="cp-current"
                type="password"
                className={`input${currentError ? ' input-error' : ''}`}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
              {currentError ? <div className="field-error-text" aria-live="polite">{currentError}</div> : null}
            </div>

            <div className="field">
              <label className={`field-label${newError ? ' is-error' : ''}`} htmlFor="cp-new">
                {t.auth.newPassword}
              </label>
              <div className={`input-password${newError ? ' input-error' : ''}`}>
                <input
                  id="cp-new"
                  type={showNew ? 'text' : 'password'}
                  className="input-password-field"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-pressed={showNew}
                  onClick={() => setShowNew(s => !s)}
                >
                  {showNew ? t.auth.hidePassword : t.auth.showPassword}
                </button>
              </div>
              {newError ? <div className="field-error-text">{newError}</div> : null}
              <div className="rule-checklist" aria-live="polite">
                <span className={`rule-item${minLengthOk ? ' is-done' : ''}`}>
                  {minLengthOk ? '✓' : '·'} {t.auth.ruleMinLength}
                </span>
                <span className={`rule-item${lettersNumbersOk ? ' is-done' : ''}`}>
                  {lettersNumbersOk ? '✓' : '·'} {t.auth.ruleLettersNumbers}
                </span>
              </div>
            </div>

            <div className="field">
              <label className={`field-label${confirmError ? ' is-error' : ''}`} htmlFor="cp-confirm">
                {t.auth.confirmNewPassword}
              </label>
              <input
                id="cp-confirm"
                type="password"
                className={`input${confirmError ? ' input-error' : ''}`}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              {confirmError ? <div className="field-error-text">{confirmError}</div> : null}
            </div>

            <Button type="submit" loading={busy} className="cp-submit">
              {t.auth.savePasswordCta}
            </Button>
            <div className="cp-submit-helper">{t.auth.savePasswordHelper}</div>
          </form>
        </div>
      </div>
    </div>
  );
}
