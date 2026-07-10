/**
 * Task 4 — Dashboard (B1/B2/DT1). Drives the real dev mock end to end (login → dashboard
 * screen), same harness shape as shell.test.tsx/login.test.tsx. Expected KPI numbers are
 * hand-derived from `src/client/lib/mock/fixtures.ts` (see the arithmetic in comments
 * below) rather than re-implemented — the point is to catch drift between
 * Dashboard.tsx's aggregation-consuming logic and what the fixtures actually contain,
 * not to re-derive the mock's own dashboard.summary algorithm.
 *
 * Fixture trace (buildFindings/buildVisits/buildVisitDepartments, all cities active):
 *   c1 Sumaré:      unresolved f1(high,overdue) f2(med) f4(med) f6(low) f15(low) → open=5, overdue=1, high=1
 *   c2 Campinas:    f10(high,overdue)                                              → open=1, overdue=1, high=1
 *   c3 Hortolândia: f7(med)                                                        → open=1, overdue=0, high=0
 *   c4 Indaiatuba:  f12(high,overdue) f13(med)                                     → open=2, overdue=1, high=1
 *   c5 Valinhos:    f9(med)                                                        → open=1, overdue=0, high=0
 *   c6 Paulínia:    f14(high,overdue)                                              → open=1, overdue=1, high=1
 * Totals: open=11, overdue=4, high=4. completedMissingPdfOrCounts=0 (every `completed()`
 * fixture visitDepartment always sets pdfFileId + all four counts — nothing is missing).
 * citiesVisitedInSemester: only v3 (c1) has period "cur" (this calendar month); v1/v2/v4..v8
 * are ±6/±12 months away, which — by construction (6-month shift always flips the
 * semester half, 12-month shift always flips the year) — can never equal the current
 * semester regardless of when this suite runs. → visited=1, total=6 (regional) / 1 (local, c1).
 * latestVisits (top 5 of 8, by mainDate desc): v3 (Sumaré, done1/total2 — vd6 in
 * progress) first, then ALL FOUR "p6" visits share one calendar month, so they fill the
 * remaining slots by day-of-month: v8(day25,Paulínia) > v6(day20,Indaiatuba) >
 * v2(day10,Sumaré's *other* visit) > v4(day8,Campinas) — that's already 5 total, so
 * every "p12" visit (v1/v5/v7) falls off the cut entirely. Confirmed visually (dev
 * server screenshot) after an initial trace mistakenly omitted v2 from the p6 group.
 * c1-scoped openByDepartment: Informática(f2,f15)=2, Secretaria(f6)=1, Tesouraria(f4)=1
 * — before f1 is resolved by test (2b)'s setup mutation (see there for the post-mutation
 * numbers, which drop c1's open/overdue/high by exactly f1's contribution).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from '../../src/client/state/session';
import { NavProvider, useNav } from '../../src/client/state/nav';
import { ToastProvider } from '../../src/client/state/toasts';
import { AppShell } from '../../src/client/App';
import { callApi } from '../../src/client/lib/gas';
import { mockApi, resetMockState } from '../../src/client/lib/mock/server';
import { t } from '../../src/client/strings/pt';

beforeEach(() => {
  window.localStorage.clear();
  resetMockState();
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

/** Renders the current nav Screen as JSON so KPI/visit-card tap targets are inspectable
 *  without a real 'findings'/'visit' screen implementation to land on yet. */
function NavSpy() {
  const { screen: current } = useNav();
  return <div data-testid="nav-spy">{JSON.stringify(current)}</div>;
}

async function waitForScreen(name: string) {
  await waitFor(
    () => expect(document.querySelector(`[data-screen="${name}"]`)).toBeTruthy(),
    { timeout: 3000 },
  );
}

/** dashboard.summary resolves ~400–800ms after the screen mounts (lib/gas.ts's dev
 *  latency simulation) — this is the moment the KPI grid's own text exists in the DOM. */
async function waitForKpis() {
  await waitFor(() => expect(screen.getByText(t.dashboard.kpi.open)).toBeTruthy(), { timeout: 3000 });
}

function kpiValue(labelText: string): string {
  const label = screen.getByText(labelText);
  const card = label.closest('.kpi-card');
  if (!card) throw new Error(`No .kpi-card ancestor for label "${labelText}"`);
  return card.querySelector('.kpi-value')?.textContent ?? '';
}

function navSpyScreen(): unknown {
  return JSON.parse(screen.getByTestId('nav-spy').textContent ?? '{}');
}

/** maria (u3) is seeded with mustChangePassword:true (the only local fixture user) —
 *  completes the forced change first, mirroring shell.test.tsx test (4). */
async function loginMariaPastForcedChange() {
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
  await waitForKpis();
}

describe('Dashboard', () => {
  it('(1) regional sees KPI values and lists consistent with the fixture data', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /></Harness>);
    fireEvent.click(screen.getByText('do-login-jose'));
    await waitForScreen('dashboard');
    await waitForKpis();

    expect(kpiValue(t.dashboard.kpi.open)).toBe('11');
    expect(kpiValue(t.dashboard.kpi.overdue)).toBe('4');
    expect(kpiValue(t.dashboard.kpi.highSeverityOpen)).toBe('4');
    expect(kpiValue(t.dashboard.kpi.completedMissingPdfOrSummary)).toBe('0');
    expect(screen.getByText(t.dashboard.citiesVisitedOfTotal(1, 6))).toBeTruthy();

    const cityRows = Array.from(document.querySelectorAll('.bar-row'));
    expect(cityRows.length).toBe(6);
    const sumareRow = cityRows.find(r => r.textContent?.includes('Sumaré'));
    expect(sumareRow?.querySelector('.bar-row-count')?.textContent).toBe('5');
    expect(sumareRow?.querySelector('.bar-row-overdue')?.textContent).toBe(t.dashboard.overdueBadge(1));
    // Indaiatuba (open=2) must outrank the four open=1 cities (bar list is sorted desc).
    const indaiatubaRow = cityRows.find(r => r.textContent?.includes('Indaiatuba'));
    expect(indaiatubaRow?.querySelector('.bar-row-count')?.textContent).toBe('2');

    expect(document.querySelector('.dashboard-cta')).toBeTruthy();

    const visitRows = Array.from(document.querySelectorAll('.visit-row'));
    expect(visitRows.length).toBe(5);
    const sumareVisit = visitRows.find(r => r.textContent?.includes('Sumaré'));
    expect(sumareVisit?.textContent).toContain(t.visit.progress(1, 2));
    expect(sumareVisit?.querySelector('.visit-status-chip')?.textContent).toBe(t.labels.visitStatus.inProgress);
  });

  it('(2a) local sees only her own city, no CTA, no por-cidade list — falls back to the PDF KPI without a rate', async () => {
    await loginMariaPastForcedChange();

    expect(document.querySelector('.dashboard-title')?.textContent).toBe('Sumaré');
    expect(document.querySelector('.dashboard-cta')).toBeNull();
    expect(screen.queryByText(t.dashboard.openByCityTitle)).toBeNull();
    expect(screen.getByText(t.dashboard.openByDepartmentTitle)).toBeTruthy();

    expect(kpiValue(t.dashboard.kpi.open)).toBe('5');
    expect(kpiValue(t.dashboard.kpi.overdue)).toBe('1');
    expect(kpiValue(t.dashboard.kpi.highSeverityOpen)).toBe('1');
    expect(kpiValue(t.dashboard.kpi.completedMissingPdfOrSummary)).toBe('0');
    expect(screen.queryByText(t.dashboard.kpi.resolvedSemester)).toBeNull();
  }, 10000);

  it('(2b) local shows the positive resolution-rate KPI card once the server computes one', async () => {
    // Setup mutation via the mock directly (bypasses the client token-provider so it
    // doesn't fight over the one active session the Harness below will create) —
    // same "call the API to seed state, then render" idiom as login.test.tsx test (4)'s
    // `callApi('auth.changePassword', ...)` step, one level lower since this needs a
    // *different* user's (jose, regional) token than the screen under test (maria).
    const login = mockApi('auth.login', { login: 'jose', password: 'Senha123' }, undefined);
    if (!login.ok) throw new Error(`setup: jose login failed: ${login.error.message}`);
    // f1 (open, high, c1) reviewed as resolved on v3 (c1's current-semester visit) →
    // resolutionRateSemester becomes 1/1 = 100% for c1, and f1 drops out of c1's
    // open/overdue/high counts (it was the only overdue + only high-severity finding).
    const review = mockApi(
      'findingReviews.save',
      { findingId: 'f1', visitId: 'v3', result: 'resolved' },
      login.data.token,
    );
    if (!review.ok) throw new Error(`setup: findingReviews.save failed: ${review.error.message}`);

    await loginMariaPastForcedChange();

    expect(kpiValue(t.dashboard.kpi.resolvedSemester)).toBe('100%');
    expect(screen.queryByText(t.dashboard.kpi.completedMissingPdfOrSummary)).toBeNull();
    expect(kpiValue(t.dashboard.kpi.open)).toBe('4');
    expect(kpiValue(t.dashboard.kpi.overdue)).toBe('0');
    expect(kpiValue(t.dashboard.kpi.highSeverityOpen)).toBe('0');
  }, 10000);

  it('(3) KPI taps navigate to Apontamentos with the matching filters payload', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><NavSpy /></Harness>);
    fireEvent.click(screen.getByText('do-login-jose'));
    await waitForScreen('dashboard');
    await waitForKpis();

    fireEvent.click(screen.getByText(t.dashboard.kpi.open));
    expect(navSpyScreen()).toEqual({ name: 'findings' });

    const sidebarNav = screen.getByTestId('sidebar-nav');
    fireEvent.click(within(sidebarNav).getByText(t.nav.mobile.painel));
    await waitForScreen('dashboard');
    await waitForKpis();

    fireEvent.click(screen.getByText(t.dashboard.kpi.overdue));
    expect(navSpyScreen()).toEqual({ name: 'findings', filters: { overdue: true } });

    fireEvent.click(within(screen.getByTestId('sidebar-nav')).getByText(t.nav.mobile.painel));
    await waitForScreen('dashboard');
    await waitForKpis();

    fireEvent.click(screen.getByText(t.dashboard.kpi.highSeverityOpen));
    expect(navSpyScreen()).toEqual({ name: 'findings', filters: { severity: 'high' } });
  }, 10000);

  it('(4) a visit card tap navigates to the visit screen with its visitId', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><NavSpy /></Harness>);
    fireEvent.click(screen.getByText('do-login-jose'));
    await waitForScreen('dashboard');
    await waitForKpis();

    const visitRows = Array.from(document.querySelectorAll('.visit-row'));
    const sumareVisit = visitRows.find(r => r.textContent?.includes('Sumaré'));
    if (!sumareVisit) throw new Error('Sumaré visit row not found');
    fireEvent.click(sumareVisit);

    expect(navSpyScreen()).toEqual({ name: 'visit', visitId: 'v3' });
  });

  it('(5) skeletons render while dashboard.summary is in flight, then clear once loaded', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /></Harness>);
    fireEvent.click(screen.getByText('do-login-jose'));
    await waitForScreen('dashboard');

    expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0);

    await waitForKpis();
    expect(document.querySelectorAll('.skeleton').length).toBe(0);
  });
});
