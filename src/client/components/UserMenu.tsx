/**
 * Identity dropdown shared by the mobile topbar avatar and the desktop sidebar footer
 * (DESIGN_REFERENCE §2 "Dropdown menu (user)" / §4 "User menu"): identity row +
 * "Alterar senha" + "Sair" (destructive).
 */
import { useSession } from '../state/session';
import { t } from '../strings/pt';
import { initials, roleLabel } from '../lib/format';
import type { SessionUser } from '../../shared/types';

export interface UserMenuProps {
  user: SessionUser;
  onClose(): void;
  /** Opens the voluntary (non-forced) ChangePassword screen — wired from App.tsx down
   *  through Chrome/SideBar. The forced gate driven by `mustChangePassword` is handled
   *  separately, at the App shell level. */
  onChangePassword(): void;
  anchor?: 'topbar' | 'sidebar';
}

export function UserMenu({ user, onClose, onChangePassword, anchor = 'topbar' }: UserMenuProps) {
  const session = useSession();

  function handleChangePassword() {
    onClose();
    onChangePassword();
  }

  async function handleLogout() {
    onClose();
    await session.logout();
  }

  return (
    <div className={`user-menu user-menu-${anchor}`} role="menu">
      <div className="user-menu-identity">
        <span className="avatar avatar-menu" aria-hidden="true">{initials(user.name)}</span>
        <div>
          <div className="user-menu-name">{user.name}</div>
          <div className="user-menu-role">{roleLabel(user.role)}</div>
        </div>
      </div>
      <button type="button" className="user-menu-item" role="menuitem" onClick={handleChangePassword}>
        {t.common.changePassword}
      </button>
      <button type="button" className="user-menu-item user-menu-item-danger" role="menuitem" onClick={() => { void handleLogout(); }}>
        {t.common.logout}
      </button>
    </div>
  );
}
