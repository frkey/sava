/**
 * Mobile bottom nav (<900px, DESIGN_REFERENCE §4). Sections per role via
 * `mobileNavItems` (navItems.ts).
 */
import type { Role } from '../../shared/types';
import { useNav } from '../state/nav';
import { mobileNavItems } from './navItems';
import { NavIcon } from './NavIcon';
import { t } from '../strings/pt';

export interface NavBarProps {
  role: Role;
}

export function NavBar({ role }: NavBarProps) {
  const { screen, go } = useNav();
  const items = mobileNavItems(role);

  return (
    <nav className="bottom-nav" aria-label={t.nav.mainNavigation} data-testid="bottom-nav">
      {items.map(item => {
        const active = item.screen.name === screen.name;
        return (
          <button
            key={item.key}
            type="button"
            className={`bottom-nav-item${active ? ' is-active' : ''}`}
            onClick={() => go(item.screen)}
            aria-current={active ? 'page' : undefined}
          >
            <NavIcon kind={item.icon} variant="bottom" />
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
