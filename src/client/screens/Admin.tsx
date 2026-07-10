/**
 * §8.6 Admin — DESIGN_REFERENCE E1–E6/DT4/DT5. Reachable only via the sidebar/
 * bottom-nav "Cadastros"/"Mais" item (admin role only, navItems.ts) — App.tsx also
 * redirects non-admins away defensively (mirrors the local/visit guard there).
 *
 * Simplification: E1's mobile-only hub (Usuários/Cidades/Departamentos/Catálogo
 * cards, each opening its own full back-chevron screen with the bottom nav gone) is
 * collapsed into the same tab switcher DT4 already uses on desktop — one `tab`
 * state, four responsive tab buttons, the selected section's self-contained
 * component swapped in below. This avoids building a second hub→drill-down
 * navigation layer parallel to the tabs for what is otherwise a purely cosmetic
 * mobile/desktop split in the mockups: every field/action E1's rows and DT4's tabs
 * offer is still reachable, just via tabs at both breakpoints.
 */
import { useState } from 'react';
import { t } from '../strings/pt';
import { Users } from './admin/Users';
import { Cities } from './admin/Cities';
import { Departments } from './admin/Departments';
import { Catalog } from './admin/Catalog';

type AdminTab = 'users' | 'cities' | 'departments' | 'catalog';

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'users', label: t.admin.sections.users },
  { key: 'cities', label: t.admin.sections.cities },
  { key: 'departments', label: t.admin.sections.departments },
  { key: 'catalog', label: t.admin.sections.catalog },
];

export function Admin() {
  const [tab, setTab] = useState<AdminTab>('users');

  return (
    <div className="admin-screen">
      <div className="admin-tabs" role="tablist" aria-label={t.admin.title}>
        {TABS.map(item => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`admin-tab${tab === item.key ? ' is-active' : ''}`}
            onClick={() => setTab(item.key)}
            data-tab={item.key}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div data-active-tab={tab}>
        {tab === 'users' ? <Users /> : null}
        {tab === 'cities' ? <Cities /> : null}
        {tab === 'departments' ? <Departments /> : null}
        {tab === 'catalog' ? <Catalog /> : null}
      </div>
    </div>
  );
}
