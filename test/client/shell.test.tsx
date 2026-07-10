import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from '../../src/client/state/session';
import { NavProvider } from '../../src/client/state/nav';
import { ToastProvider } from '../../src/client/state/toasts';
import { AppShell } from '../../src/client/App';
import { useApiMutation } from '../../src/client/hooks/useApi';
import { callApi } from '../../src/client/lib/gas';
import { resetMockState } from '../../src/client/lib/mock/server';
import { t } from '../../src/client/strings/pt';

beforeEach(() => {
  window.localStorage.clear();
  resetMockState();
});

afterEach(() => {
  cleanup();
});

/** Same provider stack App.tsx assembles, minus the outer default export — lets tests
 *  inject small trigger components that drive the session hook directly (there's no
 *  real Login form to click through yet; that's Task 3). */
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

/** Invalidates the current session token server-side (mock auth.logout), then fires an
 *  authenticated mutation with the same (now-stale) client-held token — sequenced in
 *  one click so the invalidation is guaranteed to land before the follow-up call. */
function InvalidateThenCallButton() {
  const { run } = useApiMutation('dashboard.summary');
  return (
    <button
      onClick={() => {
        void (async () => {
          await callApi('auth.logout', undefined);
          await run({}).catch(() => undefined);
        })();
      }}
    >
      do-invalidate-then-call
    </button>
  );
}

/** Same idea as InvalidateThenCallButton, but fires TWO independent mutations
 *  concurrently (Promise.all) against the same now-stale token — regression coverage
 *  for the session.expire() latch: both fail UNAUTHORIZED, but only the first to run
 *  its error handler should show the session-expired toast. */
function InvalidateThenCallTwiceButton() {
  const first = useApiMutation('dashboard.summary');
  const second = useApiMutation('dashboard.summary');
  return (
    <button
      onClick={() => {
        void (async () => {
          await callApi('auth.logout', undefined);
          await Promise.all([
            first.run({}).catch(() => undefined),
            second.run({}).catch(() => undefined),
          ]);
        })();
      }}
    >
      do-invalidate-then-call-twice
    </button>
  );
}

// No @testing-library/jest-dom in this repo (Task 1 pinned RTL + user-event + jsdom
// only) — assertions below use plain DOM/chai checks (`.toBeTruthy()`/`.toBeNull()`)
// instead of `toBeInTheDocument()`.
async function waitForScreen(name: string) {
  await waitFor(
    () => expect(document.querySelector(`[data-screen="${name}"]`)).toBeTruthy(),
    { timeout: 3000 },
  );
}

describe('App shell', () => {
  it('(1) boots without a stored token and renders the login placeholder', async () => {
    render(<Harness />);
    await waitForScreen('login');
  });

  it('(2) regional login shows exactly Painel/Apontamentos/Registrar visita/Indicadores, no Administração', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /></Harness>);
    fireEvent.click(screen.getByText('do-login-jose'));
    await waitForScreen('dashboard');

    const nav = screen.getByTestId('sidebar-nav');
    const labels = within(nav).getAllByRole('button').map(b => b.textContent);
    expect(labels).toEqual(['Painel', 'Apontamentos', 'Registrar visita', 'Indicadores']);
    expect(within(nav).queryByText(t.nav.desktop.administracaoSectionLabel)).toBeNull();
  });

  it('(3) admin login nav includes Administração', async () => {
    render(<Harness><LoginButton login="sava.admin" password="Sava1234" /></Harness>);
    fireEvent.click(screen.getByText('do-login-sava.admin'));
    await waitForScreen('dashboard');

    const nav = screen.getByTestId('sidebar-nav');
    expect(within(nav).getByText(t.nav.desktop.administracaoSectionLabel)).toBeTruthy();
    expect(within(nav).getByText(t.nav.desktop.cadastros)).toBeTruthy();
  });

  it('(4) local user nav excludes Registrar visita (after completing the forced password change)', async () => {
    render(
      <Harness>
        <LoginButton login="maria" password="Senha123" />
        <LoginButton login="maria" password="NovaSenha123" label="do-relogin-maria" />
      </Harness>,
    );
    fireEvent.click(screen.getByText('do-login-maria'));
    // maria is seeded with mustChangePassword:true — the gate must show before any nav.
    await waitForScreen('change-password');
    expect(screen.queryByTestId('sidebar-nav')).toBeNull();

    // Complete the forced change out of band (Task 3 wires the real screen to do this).
    // The server revokes every session for the user on password change (spec: "client
    // re-logs" — src/server/services/auth.ts changePassword), so the client's promised
    // "você continuará conectado" (DESIGN_REFERENCE) is a silent re-login with the new
    // password, not a token refresh — mirrored here with a second `session.login` call.
    await callApi('auth.changePassword', { currentPassword: 'Senha123', newPassword: 'NovaSenha123' });
    fireEvent.click(screen.getByText('do-relogin-maria'));
    await waitForScreen('dashboard');

    const nav = screen.getByTestId('sidebar-nav');
    const labels = within(nav).getAllByRole('button').map(b => b.textContent);
    expect(labels).toEqual(['Painel', 'Apontamentos', 'Indicadores']);
    expect(within(nav).queryByText('Registrar visita')).toBeNull();
  });

  it('(5) UNAUTHORIZED mid-session returns to the login placeholder and shows a toast', async () => {
    render(
      <Harness>
        <LoginButton login="jose" password="Senha123" />
        <InvalidateThenCallButton />
      </Harness>,
    );
    fireEvent.click(screen.getByText('do-login-jose'));
    await waitForScreen('dashboard');

    fireEvent.click(screen.getByText('do-invalidate-then-call'));
    await waitForScreen('login');
    expect(screen.getByText(t.auth.sessionExpired)).toBeTruthy();
  });

  it('(5b) two mutations failing UNAUTHORIZED concurrently show exactly one session-expired toast', async () => {
    render(
      <Harness>
        <LoginButton login="jose" password="Senha123" />
        <InvalidateThenCallTwiceButton />
      </Harness>,
    );
    fireEvent.click(screen.getByText('do-login-jose'));
    await waitForScreen('dashboard');

    fireEvent.click(screen.getByText('do-invalidate-then-call-twice'));
    await waitForScreen('login');

    await waitFor(
      () => expect(screen.getAllByText(t.auth.sessionExpired).length).toBe(1),
      { timeout: 3000 },
    );
    // Give any stray second toast a chance to appear before asserting it never does.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getAllByText(t.auth.sessionExpired).length).toBe(1);
  });

  it('(6) useApiMutation toggles saving around the call', async () => {
    function MutationHarness() {
      const { run, saving } = useApiMutation('auth.login');
      return (
        <div>
          <span data-testid="saving-flag">{String(saving)}</span>
          <button onClick={() => { void run({ login: 'jose', password: 'Senha123' }); }}>do-run</button>
        </div>
      );
    }
    render(
      <SessionProvider>
        <NavProvider>
          <ToastProvider>
            <MutationHarness />
          </ToastProvider>
        </NavProvider>
      </SessionProvider>,
    );

    expect(screen.getByTestId('saving-flag').textContent).toBe('false');
    fireEvent.click(screen.getByText('do-run'));
    await waitFor(() => expect(screen.getByTestId('saving-flag').textContent).toBe('true'), { timeout: 2000 });
    await waitFor(() => expect(screen.getByTestId('saving-flag').textContent).toBe('false'), { timeout: 2000 });
  });
});
