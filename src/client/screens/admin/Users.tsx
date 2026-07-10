/**
 * §8.6 Usuários — DESIGN_REFERENCE E2 (mobile card list) / DT4 (desktop table), same
 * dual-render CSS-switch idiom as Findings.tsx's `.finding-list`/`.finding-table-wrap`.
 * Search ("Buscar por nome ou login…") is client-side — `users.list` has no text
 * filter parameter.
 *
 * The desktop table's ATIVO toggle is a read-only visual (per the task brief,
 * deactivation only happens via UserForm's edit-mode toggle) — clicking a row/card
 * anywhere opens UserForm in edit mode, which owns both the ativo toggle and the
 * "Resetar senha" action.
 */
import { useMemo, useState } from 'react';
import type { SessionUser } from '../../../shared/types';
import { useApiCall } from '../../hooks/useApi';
import { useToast } from '../../state/toasts';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { t } from '../../strings/pt';
import { initials, roleLabel } from '../../lib/format';
import { UserForm, type AdminUser } from './UserForm';
import { TempPasswordDialog } from './TempPasswordDialog';

export function Users() {
  const usersResult = useApiCall('users.list', undefined, []);
  const citiesResult = useApiCall('cities.list', undefined, []);
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [formTarget, setFormTarget] = useState<'create' | AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string; isReset: boolean } | null>(null);

  const users = usersResult.data ?? [];
  const cities = citiesResult.data ?? [];
  const cityNameById = useMemo(() => new Map(cities.map(c => [c.id, c.name])), [cities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => u.name.toLowerCase().includes(q) || u.login.toLowerCase().includes(q));
  }, [users, search]);

  function handleSaved(result: { name: string; tempPassword?: string }) {
    // `users.save` only ever returns a tempPassword when creating a brand-new user (no
    // `id` in the payload — src/server/services/masterdata.ts#saveUser); editing an
    // existing user never does. So whenever this fires with a tempPassword while
    // `formTarget` was an existing user (edit mode), the temp password can only have
    // come from `users.resetPassword` (UserForm's "Resetar senha" confirm) — not a
    // creation — and the dialog title must say so instead of "Usuário criado".
    const isReset = formTarget !== 'create';
    setFormTarget(null);
    usersResult.reload();
    if (result.tempPassword) setTempPassword({ name: result.name, password: result.tempPassword, isReset });
    else toast.show(t.admin.changesSavedToast, 'success');
  }

  function cityLabelFor(u: SessionUser): string {
    if (u.role !== 'local' || !u.cityId) return '';
    return cityNameById.get(u.cityId) ?? '';
  }

  // F3 state (task 9 pass): `users.list` is this screen's primary fetch — same
  // "EmptyState + Repetir" fallback Dashboard.tsx/Findings.tsx use for theirs, only
  // while nothing has loaded yet (a later reload failure leaves the existing list up).
  if (usersResult.error && users.length === 0) {
    return (
      <div className="admin-list-screen">
        <EmptyState
          title={t.admin.loadErrorTitle.users}
          action={<Button variant="secondary" onClick={usersResult.reload}>{t.toasts.retry}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="admin-list-screen">
      <div className="admin-section-header">
        <span className="admin-section-title">{t.admin.sections.users}</span>
        <Button onClick={() => setFormTarget('create')}>{t.admin.addNewUser}</Button>
      </div>

      <div className="findings-search-wrap">
        <span className="search-icon" aria-hidden="true" />
        <input
          className="search-input"
          type="search"
          placeholder={t.admin.searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label={t.admin.searchPlaceholder}
        />
      </div>

      {usersResult.loading && users.length === 0 ? (
        <div className="admin-list">
          {[0, 1, 2].map(i => <Skeleton key={i} variant="card" height={70} />)}
        </div>
      ) : (
        <>
          {/* Mobile cards (E2) */}
          <div className="admin-user-list">
            {filtered.map(u => (
              <button
                key={u.id}
                type="button"
                className={`admin-card admin-card-row${u.active ? '' : ' admin-card-inactive'}`}
                onClick={() => setFormTarget(u)}
                data-user-id={u.id}
              >
                <span className="admin-card-avatar" aria-hidden="true">{initials(u.name)}</span>
                <span className="admin-card-body">
                  <span className="admin-card-name">{u.name}</span>
                  <span className="admin-card-meta">
                    {u.login} · {roleLabel(u.role)}
                    {cityLabelFor(u) ? ` — ${cityLabelFor(u)}` : ''}
                  </span>
                </span>
                {u.mustChangePassword ? (
                  <span className="small-badge small-badge-warning">{t.labels.tempPasswordBadge}</span>
                ) : null}
                {!u.active ? (
                  <span className="small-badge small-badge-neutral">{t.labels.inactiveBadge}</span>
                ) : null}
                <span className="admin-card-chevron" aria-hidden="true">›</span>
              </button>
            ))}
          </div>

          {/* Desktop table (DT4) */}
          <div className="admin-table-wrap">
            <div className="admin-table-header">
              <span>{t.admin.usersTableHeaders.name}</span>
              <span>{t.admin.usersTableHeaders.login}</span>
              <span>{t.admin.usersTableHeaders.role}</span>
              <span>{t.admin.usersTableHeaders.city}</span>
              <span>{t.admin.usersTableHeaders.active}</span>
              <span style={{ textAlign: 'right' }}>{t.admin.usersTableHeaders.actions}</span>
            </div>
            {filtered.map(u => (
              <div
                key={u.id}
                className={`admin-table-row${u.active ? '' : ' admin-table-row-inactive'}`}
                data-user-id={u.id}
              >
                <span>
                  {u.name}
                  {u.mustChangePassword ? (
                    <span className="small-badge small-badge-warning" style={{ marginLeft: 6 }}>
                      {t.labels.tempPasswordBadge}
                    </span>
                  ) : null}
                </span>
                <span className="admin-table-login">{u.login}</span>
                <span><span className={`role-badge role-badge-${u.role}`}>{roleLabel(u.role)}</span></span>
                <span className={cityLabelFor(u) ? '' : 'admin-table-dash'}>{cityLabelFor(u) || '—'}</span>
                <span>
                  <span className="toggle-track toggle-track-positive" aria-hidden="true">
                    <span className={`toggle-track-bg${u.active ? ' is-on' : ''}`} />
                    <span className={`toggle-thumb${u.active ? ' is-on' : ''}`} />
                  </span>
                </span>
                <button type="button" className="admin-table-action" onClick={() => setFormTarget(u)}>
                  {u.active ? t.admin.editResetPassword : t.admin.editReactivate}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {formTarget ? (
        <UserForm
          mode={formTarget === 'create' ? 'create' : 'edit'}
          user={formTarget === 'create' ? undefined : formTarget}
          cities={cities}
          onClose={() => setFormTarget(null)}
          onSaved={handleSaved}
        />
      ) : null}

      {tempPassword ? (
        <TempPasswordDialog
          name={tempPassword.name}
          password={tempPassword.password}
          title={tempPassword.isReset ? t.admin.passwordResetTitle : undefined}
          onClose={() => setTempPassword(null)}
        />
      ) : null}
    </div>
  );
}
