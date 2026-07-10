/**
 * A1/A2 — Login (DESIGN_REFERENCE §8.1). Centered brand block, usuário/senha fields
 * (senha with a show/hide toggle), submit via `session.login` directly (not
 * `useApiMutation`) so the Button's loading state and the in-card error banner are
 * fully under this screen's control — a failed login must never also fire the global
 * UNAUTHORIZED toast (see state/session.ts: `expire()` is a no-op with no active
 * session, so this is safe either way, but calling `session.login` directly keeps the
 * intent obvious). On failure, the ApiError's own message is shown verbatim (the
 * server's generic, credential-agnostic copy — spec §6) in an A2-style banner, with
 * both fields switched to the error border.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSession } from '../state/session';
import { ApiError } from '../lib/gas';
import { Button } from '../components/Button';
import { t } from '../strings/pt';

export function Login() {
  const session = useSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSaving(true);
    try {
      await session.login(login, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const hasError = error !== undefined;

  return (
    <div className="login-screen" data-screen="login">
      <div className="login-content">
        <div className="login-brand">
          <div className="brand-tile brand-tile-login" aria-hidden="true">S</div>
          <div className="login-wordmark">{t.brand.wordmark}</div>
          <div className="login-subtitle">{t.brand.loginSubtitle}</div>
        </div>

        {hasError ? (
          <div className="banner banner-error" role="alert">
            <span className="banner-icon" aria-hidden="true">!</span>
            <span className="banner-text">{error}</span>
          </div>
        ) : null}

        <form onSubmit={e => { void handleSubmit(e); }} noValidate>
          <div className="field">
            <label className="field-label" htmlFor="login-username">{t.auth.username}</label>
            <input
              id="login-username"
              className={`input${hasError ? ' input-error' : ''}`}
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder={t.auth.loginPlaceholder}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="login-password">{t.auth.password}</label>
            <div className={`input-password${hasError ? ' input-error' : ''}`}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="input-password-field"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(s => !s)}
              >
                {showPassword ? t.auth.hidePassword : t.auth.showPassword}
              </button>
            </div>
          </div>
          <Button type="submit" loading={saving} loadingLabel={t.auth.submitting} className="login-submit">
            {t.auth.submit}
          </Button>
        </form>

        <div className="login-footer">{t.auth.forgotPassword}</div>
      </div>
    </div>
  );
}
