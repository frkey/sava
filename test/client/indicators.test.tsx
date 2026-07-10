/**
 * Task 9 — Indicadores (B3/DT6) + system-states pass. Same harness shape as
 * dashboard.test.tsx/admin.test.tsx — drives the real dev mock end to end. KPI/breakdown
 * numbers reuse dashboard.test.tsx's own fixture trace (src/client/lib/mock/fixtures.ts):
 *
 *   By city (openByCity, unfiltered — `dashboard.summary` with no `cityId` payload):
 *     c1 Sumaré open=5 overdue=1 · c2 Campinas open=1 overdue=1 · c3 Hortolândia open=1
 *     overdue=0 · c4 Indaiatuba open=2 overdue=1 · c5 Valinhos open=1 overdue=0 ·
 *     c6 Paulínia open=1 overdue=1. Totals: open=11, overdue=4, high=4.
 *   By department (openByDepartment, global — every unresolved finding's departmentId):
 *     Informática (f1,f2,f15, all c1) = 3 · Engenharia (f12,f13, c4) = 2 · Compras (f10,
 *     c2) / Contabilidade (f7, c3) / Piedade (f9, c5) / Presidência (f14, c6) /
 *     Secretaria (f6, c1) / Tesouraria (f4, c1) = 1 each.
 *
 * The gas.ts mock below intercepts `callApi` (records every call, same spy idiom as
 * admin.test.tsx) and adds a one-shot `failOnce` action name — set before a fetch you
 * want to fail, consumed (and cleared) the first time that action is called, every
 * other action passes through to the real dev mock unchanged. Used by test (4) for the
 * added F3 error-state coverage (admin/Users.tsx's `users.list`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from '../../src/client/state/session';
import { NavProvider, useNav } from '../../src/client/state/nav';
import { ToastProvider } from '../../src/client/state/toasts';
import { AppShell } from '../../src/client/App';
import { callApi } from '../../src/client/lib/gas';
import { resetMockState } from '../../src/client/lib/mock/server';
import { t } from '../../src/client/strings/pt';

const spyState = vi.hoisted(() => ({
  calls: [] as { action: string; payload: unknown }[],
  failOnce: null as string | null,
}));

vi.mock('../../src/client/lib/gas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/client/lib/gas')>();
  return {
    ...actual,
    callApi: async (action: string, payload: unknown) => {
      spyState.calls.push({ action, payload });
      if (spyState.failOnce === action) {
        spyState.failOnce = null;
        throw new actual.ApiError('INTERNAL', 'Falha simulada para teste.');
      }
      return actual.callApi(action as never, payload as never);
    },
  };
});

beforeEach(() => {
  window.localStorage.clear();
  resetMockState();
  spyState.calls.length = 0;
  spyState.failOnce = null;
});

afterEach(() => {
  cleanup();
});

function Harness({ children }: { children?: ReactNode }) {
  return (
    <SessionProvider>
      <NavProvider>
        <ToastProvider>
          {children}
          <AppShell />
        </ToastProvider>
      </NavProvider>
    </SessionProvider>
  );
}

function LoginButton({ login, password, label }: { login: string; password: string; label?: string }) {
  const session = useSession();
  return (
    <button onClick={() => { void session.login(login, password); }}>
      {label ?? `do-login-${login}`}
    </button>
  );
}

/** Programmatic nav to admin — same idiom as admin.test.tsx's GoAdmin. */
function GoAdmin() {
  const { go } = useNav();
  return <button onClick={() => go({ name: 'admin' })}>go-admin</button>;
}

async function waitForScreen(name: string) {
  await waitFor(
    () => expect(document.querySelector(`[data-screen="${name}"]`)).toBeTruthy(),
    { timeout: 3000 },
  );
}

/** dashboard.summary resolves ~400–800ms after mount — this is the moment the KPI
 *  grid's own text exists in the DOM (same idiom as dashboard.test.tsx). */
async function waitForKpis() {
  await waitFor(() => expect(screen.getByText(t.dashboard.kpi.open)).toBeTruthy(), { timeout: 3000 });
}

function kpiValue(labelText: string): string {
  const label = screen.getByText(labelText);
  const card = label.closest('.kpi-card');
  if (!card) throw new Error(`No .kpi-card ancestor for label "${labelText}"`);
  return card.querySelector('.kpi-value')?.textContent ?? '';
}

async function loginJoseAndGoToIndicators() {
  render(<Harness><LoginButton login="jose" password="Senha123" /></Harness>);
  fireEvent.click(screen.getByText('do-login-jose'));
  await waitForScreen('dashboard');
  fireEvent.click(within(screen.getByTestId('sidebar-nav')).getByText(t.nav.mobile.indicadores));
  await waitForScreen('indicators');
  await waitForKpis();
}

/** maria (u3) is seeded with mustChangePassword:true — completes the forced change
 *  first, mirroring dashboard.test.tsx's identical helper. */
async function loginMariaPastForcedChangeAndGoToIndicators() {
  render(
    <Harness>
      <LoginButton login="maria" password="Senha123" />
      <LoginButton login="maria" password="NovaSenha123" label="do-relogin-maria" />
    </Harness>,
  );
  fireEvent.click(screen.getByText('do-login-maria'));
  await waitForScreen('change-password');
  await callApi('auth.changePassword', { currentPassword: 'Senha123', newPassword: 'NovaSenha123' });
  fireEvent.click(screen.getByText('do-relogin-maria'));
  await waitForScreen('dashboard');
  fireEvent.click(within(screen.getByTestId('sidebar-nav')).getByText(t.nav.mobile.indicadores));
  await waitForScreen('indicators');
  await waitForKpis();
}

describe('Indicators', () => {
  it('(1a) regional sees the Looker button, disabled (LOOKER_URL unset) with the unconfigured helper', async () => {
    await loginJoseAndGoToIndicators();

    const btn = document.querySelector('.indicators-looker-btn') as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    expect(btn!.disabled).toBe(true);
    expect(document.querySelector('.indicators-looker-helper')?.textContent)
      .toBe(t.indicators.lookerUnconfiguredHelper);
  });

  it('(1b) local sees no Looker button at all', async () => {
    await loginMariaPastForcedChangeAndGoToIndicators();

    expect(document.querySelector('.indicators-looker-wrap')).toBeNull();
    expect(document.querySelector('.indicators-looker-btn')).toBeNull();
  }, 10000);

  it('(2) pills switch the rendered cut (por cidade ↔ por departamento)', async () => {
    await loginJoseAndGoToIndicators();

    // Default cut: "Por cidade" — CIDADE/ABERTOS/VENCIDOS, one row per city with open>0.
    expect(document.querySelector('.indicators-table-wrap')?.getAttribute('data-cut')).toBe('city');
    expect(screen.getByText(t.indicators.headers.city)).toBeTruthy();
    expect(screen.getByText(t.indicators.headers.overdue)).toBeTruthy();
    const sumareRow = document.querySelector('[data-city-id="c1"]');
    expect(sumareRow?.querySelector('.indicators-table-open')?.textContent).toBe('5');
    expect(sumareRow?.querySelector('.indicators-table-overdue')?.textContent).toBe('1');
    // Hortolândia has overdue=0 — muted zero styling, not the loud danger class.
    const hortolandiaRow = document.querySelector('[data-city-id="c3"]');
    expect(hortolandiaRow?.querySelector('.indicators-table-overdue-zero')?.textContent).toBe('0');

    fireEvent.click(screen.getByText(t.indicators.segments.byDepartment));

    // Switched cut: DEPARTAMENTO/ABERTOS, no VENCIDOS column at all.
    expect(document.querySelector('.indicators-table-wrap')?.getAttribute('data-cut')).toBe('department');
    expect(screen.getByText(t.indicators.headers.department)).toBeTruthy();
    expect(screen.queryByText(t.indicators.headers.overdue)).toBeNull();
    expect(document.querySelector('[data-city-id="c1"]')).toBeNull();
    const informaticaRow = document.querySelector('[data-department-id="d11"]');
    expect(informaticaRow?.textContent).toContain('Informática');
    expect(informaticaRow?.querySelector('.indicators-table-open')?.textContent).toBe('3');

    // Switching back restores the city cut.
    fireEvent.click(screen.getByText(t.indicators.segments.byCity));
    expect(document.querySelector('.indicators-table-wrap')?.getAttribute('data-cut')).toBe('city');
    expect(document.querySelector('[data-city-id="c1"]')).toBeTruthy();
  });

  it('(3) KPI numbers are consistent with the fixture data (same counts as Painel)', async () => {
    await loginJoseAndGoToIndicators();

    expect(kpiValue(t.dashboard.kpi.open)).toBe('11');
    expect(kpiValue(t.dashboard.kpi.overdue)).toBe('4');
    expect(kpiValue(t.dashboard.kpi.highSeverityOpen)).toBe('4');
    expect(kpiValue(t.dashboard.kpi.completedMissingPdfOrSummary)).toBe('0');
    expect(screen.getByText(t.dashboard.citiesVisitedOfTotal(1, 6))).toBeTruthy();
  });

  it('(4) F3 added coverage: a failing users.list renders the retry EmptyState on the admin Users tab, and retry recovers it', async () => {
    render(<Harness><LoginButton login="sava.admin" password="Sava1234" /><GoAdmin /></Harness>);
    fireEvent.click(screen.getByText('do-login-sava.admin'));
    await waitForScreen('dashboard');

    spyState.failOnce = 'users.list';
    fireEvent.click(screen.getByText('go-admin'));
    await waitForScreen('admin');

    await waitFor(() => expect(screen.getByText(t.admin.loadErrorTitle.users)).toBeTruthy(), { timeout: 3000 });
    expect(document.querySelector('.admin-user-list')).toBeNull();

    fireEvent.click(screen.getByText(t.toasts.retry));

    await waitFor(() => expect(document.querySelector('.admin-user-list')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText(t.admin.loadErrorTitle.users)).toBeNull();
  }, 10000);
});
