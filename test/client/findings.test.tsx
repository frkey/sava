/**
 * Task 5 — Apontamentos (lista + filtros). Drives the real dev mock end to end (login →
 * findings screen), same harness shape as dashboard.test.tsx/login.test.tsx. `callApi` is
 * wrapped (not fully mocked) so every call still resolves through the real mock server —
 * only a spy log is layered on top, mirroring login.test.tsx's `vi.hoisted` pattern.
 *
 * Fixture trace relevant to these tests (src/client/lib/mock/fixtures.ts#buildFindings):
 * 15 findings across 6 cities; c5 (Valinhos) has exactly one (`f9`, medium, open) and no
 * `high` finding at all — cityId:'c5' + severity:'high' is a reliable zero-result combo.
 * `f15` (Sumaré/Informática) has the most recent `createdAt` (isoDateTime(-1)) of all 15
 * findings, so `findings.list`'s `createdAt desc` sort always puts it first regardless of
 * when the suite runs.
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
import { t, statusLabel, severityLabel } from '../../src/client/strings/pt';
import type { FindingFilters } from '../../src/shared/types';

/** Records every `callApi` invocation (action + payload) without changing behavior —
 *  every call still resolves through the real dev mock. `vi.hoisted` per login.test.tsx's
 *  established pattern (the `vi.mock` factory below is hoisted above all imports). */
const spyState = vi.hoisted(() => ({ calls: [] as { action: string; payload: unknown }[] }));

vi.mock('../../src/client/lib/gas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/client/lib/gas')>();
  return {
    ...actual,
    callApi: async (action: string, payload: unknown) => {
      spyState.calls.push({ action, payload });
      return actual.callApi(action as never, payload as never);
    },
  };
});

beforeEach(() => {
  window.localStorage.clear();
  resetMockState();
  spyState.calls.length = 0;
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

/** Programmatic navigation the real nav (NavBar/SideBar) can't reach directly — the
 *  optional `filters` payload only comes from Dashboard KPI taps in the real app. */
function GoFindings({ filters }: { filters?: FindingFilters }) {
  const { go } = useNav();
  return <button onClick={() => go({ name: 'findings', filters })}>go-findings</button>;
}

function NavSpy() {
  const { screen: current } = useNav();
  return <div data-testid="nav-spy">{JSON.stringify(current)}</div>;
}

function navSpyScreen(): unknown {
  return JSON.parse(screen.getByTestId('nav-spy').textContent ?? '{}');
}

async function waitForScreen(name: string) {
  await waitFor(
    () => expect(document.querySelector(`[data-screen="${name}"]`)).toBeTruthy(),
    { timeout: 3000 },
  );
}

/** The list only exists once `findings.list` resolves — the count line is the simplest
 *  reliable marker (present for both the desktop-table and mobile-card render). */
async function waitForFindingsLoaded() {
  await waitFor(() => {
    const calls = spyState.calls.filter(c => c.action === 'findings.list');
    expect(calls.length).toBeGreaterThan(0);
  }, { timeout: 3000 });
  await waitFor(() => expect(document.querySelector('.findings-count')).toBeTruthy(), { timeout: 3000 });
}

function lastFindingsListPayload(): { filters?: FindingFilters } {
  const calls = spyState.calls.filter(c => c.action === 'findings.list');
  const last = calls[calls.length - 1];
  if (!last) throw new Error('findings.list was never called');
  return last.payload as { filters?: FindingFilters };
}

async function loginJose() {
  render(<Harness><LoginButton login="jose" password="Senha123" /><NavSpy /></Harness>);
  fireEvent.click(screen.getByText('do-login-jose'));
  await waitForScreen('dashboard');
}

async function goToFindings() {
  fireEvent.click(within(screen.getByTestId('sidebar-nav')).getByText(t.nav.mobile.apontamentos));
  await waitForScreen('findings');
  await waitForFindingsLoaded();
}

/** maria (u3, local, cityId c1) is seeded with mustChangePassword:true — completes the
 *  forced change first, mirroring dashboard.test.tsx's identical helper. */
async function loginMariaPastForcedChange() {
  render(<Harness><LoginButton login="maria" password="Senha123" /><LoginButton login="maria" password="NovaSenha123" label="do-relogin-maria" /><NavSpy /></Harness>);
  fireEvent.click(screen.getByText('do-login-maria'));
  await waitForScreen('change-password');
  await callApi('auth.changePassword', { currentPassword: 'Senha123', newPassword: 'NovaSenha123' });
  fireEvent.click(screen.getByText('do-relogin-maria'));
  await waitForScreen('dashboard');
}

function openFilterSheet() {
  fireEvent.click(screen.getByRole('button', { name: t.findings.filtersTitle }));
  return screen.getByTestId('filter-sheet');
}

describe('Findings', () => {
  it('(1) filters set in the sheet compose into the findings.list payload exactly', async () => {
    await loginJose();
    await goToFindings();

    const sheet = openFilterSheet();

    fireEvent.change(within(sheet).getByLabelText(t.findings.filterLabels.city), { target: { value: 'c2' } });
    fireEvent.change(within(sheet).getByLabelText(t.findings.filterLabels.department), { target: { value: 'd20' } });
    fireEvent.click(within(sheet).getByRole('button', { name: statusLabel.open }));
    fireEvent.change(within(sheet).getByLabelText(t.findings.filterLabels.period), { target: { value: '08/2026' } });
    fireEvent.change(within(sheet).getByLabelText(t.findings.filterLabels.responseType), { target: { value: 'no' } });
    fireEvent.click(within(sheet).getByRole('button', { name: severityLabel.high }));
    fireEvent.click(within(sheet).getByLabelText(t.findings.overdueOnly));

    fireEvent.click(within(sheet).getByRole('button', { name: t.findings.applyFilters() }));

    await waitFor(() => {
      expect(lastFindingsListPayload()).toEqual({
        filters: {
          cityId: 'c2', departmentId: 'd20', status: 'open', period: '08/2026',
          severity: 'high', response: 'no', overdue: true,
        },
      });
    });
  });

  it('(2) initial filters passed via nav (Dashboard KPI taps) seed the first payload and render a chip', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoFindings filters={{ severity: 'high' }} /><NavSpy /></Harness>);
    fireEvent.click(screen.getByText('do-login-jose'));
    await waitForScreen('dashboard');
    fireEvent.click(screen.getByText('go-findings'));
    await waitForScreen('findings');

    await waitFor(() => {
      const calls = spyState.calls.filter(c => c.action === 'findings.list');
      expect(calls.length).toBeGreaterThan(0);
    });

    expect(lastFindingsListPayload()).toEqual({ filters: { severity: 'high' } });
    await waitFor(() => expect(screen.getByText(severityLabel.high)).toBeTruthy());

    // Give the search debounce a chance to fire — it must NOT add a second call, since
    // the (empty) search box never changed.
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(spyState.calls.filter(c => c.action === 'findings.list')).toHaveLength(1);
  });

  it('(3) local role: the sheet\'s cidade select is locked to her own city', async () => {
    await loginMariaPastForcedChange();
    fireEvent.click(within(screen.getByTestId('sidebar-nav')).getByText(t.nav.mobile.apontamentos));
    await waitForScreen('findings');
    await waitForFindingsLoaded();

    const sheet = openFilterSheet();
    const citySelect = within(sheet).getByLabelText(t.findings.filterLabels.city) as HTMLSelectElement;
    expect(citySelect.disabled).toBe(true);
    expect(citySelect.value).toBe('c1');
  });

  it('(4) search debounce: rapid typing emits exactly ONE findings.list call carrying filters.text', async () => {
    await loginJose();
    await goToFindings();

    const before = spyState.calls.filter(c => c.action === 'findings.list').length;

    const search = screen.getByPlaceholderText(t.findings.searchPlaceholder);
    fireEvent.change(search, { target: { value: 'i' } });
    fireEvent.change(search, { target: { value: 'in' } });
    fireEvent.change(search, { target: { value: 'inv' } });
    fireEvent.change(search, { target: { value: 'inventário' } });

    // Nothing fires immediately off the back of typing.
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(spyState.calls.filter(c => c.action === 'findings.list').length).toBe(before);

    await waitFor(() => {
      expect(spyState.calls.filter(c => c.action === 'findings.list').length).toBe(before + 1);
    }, { timeout: 2000 });

    expect(lastFindingsListPayload()).toEqual({ filters: { text: 'inventário' } });

    // Settle further — still exactly one extra call (debounce collapsed the 4 keystrokes).
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(spyState.calls.filter(c => c.action === 'findings.list').length).toBe(before + 1);
  });

  it('(5) a filter combo with zero matches renders the F1 empty state', async () => {
    await loginJose();
    await goToFindings();

    const sheet = openFilterSheet();
    fireEvent.change(within(sheet).getByLabelText(t.findings.filterLabels.city), { target: { value: 'c5' } });
    fireEvent.click(within(sheet).getByRole('button', { name: severityLabel.high }));
    fireEvent.click(within(sheet).getByRole('button', { name: t.findings.applyFilters() }));

    await waitFor(() => expect(screen.getByText(t.dashboard.emptyTitle)).toBeTruthy());
    expect(document.querySelectorAll('.finding-card')).toHaveLength(0);
  });

  it('(6) tapping a finding card navigates to its detail screen', async () => {
    await loginJose();
    await goToFindings();

    const first = document.querySelector('.finding-card') as HTMLElement;
    expect(first).toBeTruthy();
    const findingId = first.dataset.findingId;
    expect(findingId).toBeTruthy();

    fireEvent.click(first);

    // No filters were ever set in this test, so `filters` is still `{}` — `from` carries
    // it along regardless, ready to be restored on back-nav (see test (7)).
    expect(navSpyScreen()).toEqual({ name: 'finding', id: findingId, from: {} });
  });

  it('(7) back from finding detail preserves the filters that were active when the user navigated there', async () => {
    await loginJose();
    await goToFindings();

    const sheet = openFilterSheet();
    fireEvent.change(within(sheet).getByLabelText(t.findings.filterLabels.city), { target: { value: 'c2' } });
    fireEvent.click(within(sheet).getByRole('button', { name: severityLabel.high }));
    fireEvent.click(within(sheet).getByRole('button', { name: t.findings.applyFilters() }));

    await waitFor(() => {
      expect(lastFindingsListPayload()).toEqual({ filters: { cityId: 'c2', severity: 'high' } });
    });

    const first = document.querySelector('.finding-card') as HTMLElement;
    expect(first).toBeTruthy();
    fireEvent.click(first);
    await waitForScreen('finding');

    expect(navSpyScreen()).toMatchObject({
      name: 'finding',
      from: { cityId: 'c2', severity: 'high' },
    });

    // Wait for the loaded detail (skeleton renders no back link) before clicking it.
    // Scoped by class, not text: the back link's label ("Apontamentos") collides with
    // the still-mounted sidebar nav item of the same name.
    await waitFor(() => expect(document.querySelector('.finding-detail-backlink')).toBeTruthy());
    fireEvent.click(document.querySelector('.finding-detail-backlink') as HTMLElement);
    await waitForScreen('findings');
    await waitForFindingsLoaded();

    // Chips restored (scoped to the chip row — a plain city-name text query would also
    // match the card/table renderings of the same finding).
    const chipTexts = Array.from(document.querySelectorAll('.active-filter-chip')).map(el => el.textContent ?? '');
    expect(chipTexts.some(text => text.includes('Campinas'))).toBe(true);
    expect(chipTexts.some(text => text.includes(severityLabel.high))).toBe(true);

    // Payload roundtrips too — the re-mounted Findings refetched with the restored filters.
    await waitFor(() => {
      expect(lastFindingsListPayload()).toEqual({ filters: { cityId: 'c2', severity: 'high' } });
    });
  });
});
