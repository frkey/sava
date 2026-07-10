/**
 * §8.6 E3 (new user) / DT4 footnote ("Editar" reuses the same form) — nome, login,
 * perfil, cidade (local only, required), ativo (edit only, per the task brief — a
 * brand-new user is always active, so the toggle only has a meaningful choice once
 * the user already exists). "Perfil" renders as a `<select>` per the task brief
 * rather than E3's three radio option-cards; the role description text (E3's card
 * subtitles) is kept as a hint under the select so it isn't lost.
 *
 * VALIDATION/CONFLICT (login já existe) render as an inline banner via `{silent:
 * true}` — same idiom as VisitStart.tsx — instead of the default toast.
 *
 * "Resetar senha" swaps the dialog into a confirm view (`view` state) rather than
 * stacking a second Dialog on top: one scrim, simpler than nesting.
 */
import { useState } from 'react';
import type { City, Role, SessionUser } from '../../../shared/types';
import { useApiMutation } from '../../hooks/useApi';
import { ApiError } from '../../lib/gas';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/Button';
import { t } from '../../strings/pt';

export type AdminUser = SessionUser & { active: boolean };

export interface UserFormProps {
  mode: 'create' | 'edit';
  /** Required when `mode === 'edit'`. */
  user?: AdminUser;
  cities: City[];
  onClose(): void;
  /** Fires after `users.save` (create/edit) or `users.resetPassword` succeeds.
   *  `tempPassword` is set for create and for a password reset; absent for a plain
   *  edit save. */
  onSaved(result: { name: string; tempPassword?: string }): void;
}

const ROLES: Role[] = ['admin', 'regional', 'local'];

export function UserForm({ mode, user, cities, onClose, onSaved }: UserFormProps) {
  const [name, setName] = useState(user?.name ?? '');
  const [login, setLogin] = useState(user?.login ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'local');
  const [cityId, setCityId] = useState(user?.cityId ?? '');
  const [active, setActive] = useState(user?.active ?? true);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [view, setView] = useState<'form' | 'resetConfirm'>('form');

  const saveMutation = useApiMutation('users.save');
  const resetMutation = useApiMutation('users.resetPassword');

  // Active cities to pick from, plus the user's current city even if it has since
  // been deactivated (so an existing assignment never silently disappears from the
  // select).
  const cityOptions = cities.filter(c => c.active || c.id === user?.cityId);
  const canSubmit = name.trim() !== '' && login.trim() !== '' && (role !== 'local' || cityId !== '');

  async function handleSubmit() {
    if (!canSubmit) return;
    setFormError(undefined);
    try {
      const result = await saveMutation.run(
        {
          user: {
            ...(mode === 'edit' && user ? { id: user.id } : {}),
            name: name.trim(),
            login: login.trim(),
            role,
            cityId: role === 'local' ? cityId : undefined,
            ...(mode === 'edit' ? { active } : {}),
          },
        },
        { silent: true },
      );
      onSaved({ name: result.user.name, tempPassword: result.tempPassword });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function handleResetConfirm() {
    if (!user) return;
    setFormError(undefined);
    try {
      const result = await resetMutation.run({ userId: user.id }, { silent: true });
      onSaved({ name: user.name, tempPassword: result.tempPassword });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : String(err));
      setView('form');
    }
  }

  if (view === 'resetConfirm') {
    return (
      <Dialog
        open
        title={t.admin.resetPasswordConfirmTitle}
        onClose={onClose}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => { setFormError(undefined); setView('form'); }}>{t.common.back}</Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => { void handleResetConfirm(); }}
              loading={resetMutation.saving}
            >
              {t.admin.resetPasswordCta}
            </Button>
          </>
        }
      >
        {formError ? (
          <div className="banner banner-error" role="alert">
            <span className="banner-icon" aria-hidden="true">!</span>
            <span className="banner-text">{formError}</span>
          </div>
        ) : null}
        <div className="banner-text">{t.admin.resetPasswordConfirmBody}</div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title={mode === 'create' ? t.admin.userForm.title : t.admin.editUserTitle}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t.common.back}</Button>
          <Button
            type="button"
            disabled={!canSubmit}
            loading={saveMutation.saving}
            onClick={() => { void handleSubmit(); }}
          >
            {mode === 'create' ? t.admin.createUserCta : t.findings.editSaveCta}
          </Button>
        </>
      }
    >
      {formError ? (
        <div className="banner banner-error" role="alert">
          <span className="banner-icon" aria-hidden="true">!</span>
          <span className="banner-text">{formError}</span>
        </div>
      ) : null}

      <div className="field">
        <label className="field-label" htmlFor="user-form-name">{t.admin.userForm.name}</label>
        <input id="user-form-name" className="input" value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="user-form-login">{t.admin.userForm.login}</label>
        <input
          id="user-form-login"
          className="input input-mono"
          value={login}
          onChange={e => setLogin(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="user-form-role">{t.admin.userForm.role}</label>
        <select
          id="user-form-role"
          className="select"
          value={role}
          onChange={e => setRole(e.target.value as Role)}
        >
          {ROLES.map(r => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
        <div className="field-hint">{t.admin.roleDescriptions[role]}</div>
      </div>

      {role === 'local' ? (
        <div className="field">
          <label className="field-label" htmlFor="user-form-city">{t.admin.userForm.city}</label>
          <select
            id="user-form-city"
            className="select"
            value={cityId}
            onChange={e => setCityId(e.target.value)}
          >
            <option value="">{t.visit.cityPlaceholder}</option>
            {cityOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      ) : null}

      {mode === 'edit' ? (
        <label className="toggle-row">
          <span className="toggle-track toggle-track-positive">
            <input
              type="checkbox"
              className="toggle-input"
              checked={active}
              onChange={e => setActive(e.target.checked)}
            />
            <span className="toggle-track-bg" aria-hidden="true" />
            <span className="toggle-thumb" aria-hidden="true" />
          </span>
          <span>{t.admin.userForm.active}</span>
        </label>
      ) : (
        <div className="field-hint">{t.admin.createUserHelper}</div>
      )}

      {mode === 'edit' ? (
        <button type="button" className="user-form-reset-link" onClick={() => { setFormError(undefined); setView('resetConfirm'); }}>
          {t.admin.resetPasswordCta}
        </button>
      ) : null}
    </Dialog>
  );
}
