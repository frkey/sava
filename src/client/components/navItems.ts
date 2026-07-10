/**
 * Nav sections per role (DESIGN_REFERENCE §4). Pure data — no React — so both
 * NavBar (mobile) and SideBar (desktop) render from the same source of truth and stay
 * in sync, and so the role→items mapping is directly unit-testable.
 */
import type { Role } from '../../shared/types';
import type { Screen } from '../state/nav';
import { t } from '../strings/pt';

export type NavIconKind = 'dashboard' | 'findings' | 'register' | 'indicators' | 'admin';

export interface NavItemDef {
  key: string;
  screen: Screen;
  label: string;
  icon: NavIconKind;
}

function baseItems(
  labels: { dashboard: string; findings: string; register: string; indicators: string },
  includeRegister: boolean,
): NavItemDef[] {
  const items: NavItemDef[] = [
    { key: 'dashboard', screen: { name: 'dashboard' }, label: labels.dashboard, icon: 'dashboard' },
    { key: 'findings', screen: { name: 'findings' }, label: labels.findings, icon: 'findings' },
  ];
  if (includeRegister) items.push({ key: 'visit', screen: { name: 'visit' }, label: labels.register, icon: 'register' });
  items.push({ key: 'indicators', screen: { name: 'indicators' }, label: labels.indicators, icon: 'indicators' });
  return items;
}

/**
 * Mobile bottom nav (DESIGN_REFERENCE §4 "Mobile"):
 * regional 4 tabs · local 3 tabs (no Registrar) · admin 5 tabs (abbreviated + "Mais").
 */
export function mobileNavItems(role: Role): NavItemDef[] {
  const abbreviated = role === 'admin';
  const items = baseItems(
    {
      dashboard: t.nav.mobile.painel,
      findings: abbreviated ? t.nav.mobile.apontamentosShort : t.nav.mobile.apontamentos,
      register: t.nav.mobile.registrar,
      indicators: abbreviated ? t.nav.mobile.indicadoresShort : t.nav.mobile.indicadores,
    },
    role !== 'local',
  );
  if (role === 'admin') items.push({ key: 'admin', screen: { name: 'admin' }, label: t.nav.mobile.mais, icon: 'admin' });
  return items;
}

/**
 * Desktop sidebar (DESIGN_REFERENCE §4 "Desktop"): regional/local get the base 4 (3
 * for local); admin additionally gets an "ADMINISTRAÇÃO" section with "Cadastros".
 */
export function desktopNavItems(role: Role): { items: NavItemDef[]; admin?: { sectionLabel: string; item: NavItemDef } } {
  const items = baseItems(
    {
      dashboard: t.nav.mobile.painel,
      findings: t.nav.mobile.apontamentos,
      register: t.nav.desktop.registrarVisita,
      indicators: t.nav.mobile.indicadores,
    },
    role !== 'local',
  );
  if (role !== 'admin') return { items };
  return {
    items,
    admin: {
      sectionLabel: t.nav.desktop.administracaoSectionLabel,
      item: { key: 'admin', screen: { name: 'admin' }, label: t.nav.desktop.cadastros, icon: 'admin' },
    },
  };
}
