/**
 * Desktop sidebar (≥900px, DESIGN_REFERENCE §4): brand block, nav sections per role
 * via `desktopNavItems` (navItems.ts), footer user block opening the shared UserMenu.
 */
import { useState } from 'react';
import type { SessionUser } from '../../shared/types';
import { useNav } from '../state/nav';
import { desktopNavItems } from './navItems';
import { NavIcon } from './NavIcon';
import { UserMenu } from './UserMenu';
import { t } from '../strings/pt';
import { initials, roleLabel } from '../lib/format';

export interface SideBarProps {
  user: SessionUser;
  onChangePassword(): void;
}

export function SideBar({ user, onChangePassword }: SideBarProps) {
  const { screen, go } = useNav();
  const { items, admin } = desktopNavItems(user.role);
  const [menuOpen, setMenuOpen] = useState(false);
  const adminActive = admin ? admin.item.screen.name === screen.name : false;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-tile brand-tile-sidebar" aria-hidden="true">S</div>
        <div>
          <div className="sidebar-wordmark">{t.brand.wordmark}</div>
          <div className="sidebar-tagline">{t.brand.sidebarTagline}</div>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label={t.nav.mainNavigation} data-testid="sidebar-nav">
        {items.map(item => {
          const active = item.screen.name === screen.name;
          return (
            <button
              key={item.key}
              type="button"
              className={`sidebar-nav-item${active ? ' is-active' : ''}`}
              onClick={() => go(item.screen)}
              aria-current={active ? 'page' : undefined}
            >
              <NavIcon kind={item.icon} variant="sidebar" />
              {item.label}
            </button>
          );
        })}
        {admin ? (
          <>
            <div className="sidebar-section-label">{admin.sectionLabel}</div>
            <button
              type="button"
              className={`sidebar-nav-item${adminActive ? ' is-active' : ''}`}
              onClick={() => go(admin.item.screen)}
              aria-current={adminActive ? 'page' : undefined}
            >
              <NavIcon kind={admin.item.icon} variant="sidebar" />
              {admin.item.label}
            </button>
          </>
        ) : null}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="sidebar-user-trigger" onClick={() => setMenuOpen(open => !open)}>
          <span className="avatar avatar-sidebar" aria-hidden="true">{initials(user.name)}</span>
          <span className="sidebar-user-info">
            <span className="sidebar-user-name">{user.name}</span>
            <span className="sidebar-user-role">{roleLabel(user.role)}</span>
          </span>
          <span className="sidebar-user-more" aria-hidden="true">⋯</span>
        </button>
        {menuOpen ? (
          <UserMenu
            user={user}
            onClose={() => setMenuOpen(false)}
            onChangePassword={onChangePassword}
            anchor="sidebar"
          />
        ) : null}
      </div>
    </aside>
  );
}
