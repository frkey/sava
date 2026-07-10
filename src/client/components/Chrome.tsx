/**
 * Topbar chrome (DESIGN_REFERENCE §4): mobile app bar (logo + wordmark + avatar,
 * <900px) and desktop topbar (screen title, ≥900px) — both rendered, CSS picks which
 * is visible at the current viewport (components.css).
 */
import { useState } from 'react';
import type { SessionUser } from '../../shared/types';
import { useNav, type Screen } from '../state/nav';
import { UserMenu } from './UserMenu';
import { t } from '../strings/pt';
import { initials } from '../lib/format';

export interface ChromeProps {
  user: SessionUser;
  onChangePassword(): void;
}

function screenTitle(screen: Screen): string {
  switch (screen.name) {
    case 'dashboard': return t.nav.mobile.painel;
    case 'findings': return t.nav.mobile.apontamentos;
    case 'finding': return t.findings.detailTitle;
    // no 'visit' case: that screen renders full-bleed with its own app bar, hoisted
    // above this Chrome entirely (App.tsx AppShell) — this switch never sees it.
    case 'admin': return t.admin.title;
    case 'indicators': return t.nav.mobile.indicadores;
    default: return t.brand.wordmark;
  }
}

export function Chrome({ user, onChangePassword }: ChromeProps) {
  const { screen } = useNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = screenTitle(screen);

  return (
    <>
      <header className="topbar-mobile" data-testid="topbar-mobile">
        <div className="topbar-brand">
          <div className="brand-tile brand-tile-sm" aria-hidden="true">S</div>
          <span className="topbar-wordmark">{t.brand.wordmark}</span>
        </div>
        <div className="topbar-avatar-wrap">
          <button
            type="button"
            className={`avatar avatar-topbar${menuOpen ? ' is-open' : ''}`}
            onClick={() => setMenuOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {initials(user.name)}
          </button>
          {menuOpen ? (
            <>
              <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
              <UserMenu
                user={user}
                onClose={() => setMenuOpen(false)}
                onChangePassword={onChangePassword}
                anchor="topbar"
              />
            </>
          ) : null}
        </div>
      </header>
      <header className="topbar-desktop" data-testid="topbar-desktop">
        <span className="topbar-title">{title}</span>
      </header>
    </>
  );
}
