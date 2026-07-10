import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from '../../src/client/state/session';
import { NavProvider } from '../../src/client/state/nav';
import { ToastProvider } from '../../src/client/state/toasts';
import { AppShell } from '../../src/client/App';
import { resetMockState } from '../../src/client/lib/mock/server';
import { t } from '../../src/client/strings/pt';

/**
 * Shared hoisted control so the `lib/gas` mock factory below (which vitest hoists
 * above all imports) and the tests that flip the flag are looking at the same object —
 * see https://vitest.dev/api/vi.html#vi-hoisted. Only `mockGasControls.failNextLogin`
 * is ever set to `true`, and only by the one test that needs the re-login call to fail
 * (Fix 1's critical regression test below); every other `auth.login` call — including
 * the initial logins every other test in this file performs — passes straight through
 * to the real dev mock.
 */
const mockGasControls = vi.hoisted(() => ({ failNextLogin: false }));

/** Wraps the real `lib/gas` module, injecting a one-shot simulated network failure
 *  into a single `auth.login` call so Fix 1 (silent re-login after changePassword)
 *  can be exercised without touching business-rule state (wrong password, locked
 *  account, etc.) — this is purely a transport-level failure, same as a network blip. */
vi.mock('../../src/client/lib/gas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/client/lib/gas')>();
  return {
    ...actual,
    callApi: async (action: string, payload: unknown) => {
      if (action === 'auth.login' && mockGasControls.failNextLogin) {
        mockGasControls.failNextLogin = false;
        throw new Error('Falha de rede simulada (teste).');
      }
      return actual.callApi(action as never, payload as never);
    },
  };
});

beforeEach(() => {
  window.localStorage.clear();
  resetMockState();
  mockGasControls.failNextLogin = false;
});

afterEach(() => {
  cleanup();
});

/** Same provider stack App.tsx assembles (mirrors test/client/shell.test.tsx's Harness),
 *  minus the outer default export — this suite drives the real Login/ChangePassword
 *  forms directly instead of the session-hook shortcuts shell.test.tsx uses. */
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

async function waitForScreen(name: string) {
  await waitFor(
    () => expect(document.querySelector(`[data-screen="${name}"]`)).toBeTruthy(),
    { timeout: 3000 },
  );
}

/** Mirrors src/server/services/auth.ts#GENERIC_LOGIN_ERROR and its identical copy in
 *  the dev mock (src/client/lib/mock/server.ts) — NOT `t.auth.loginErrorMockupCopy`,
 *  which is deliberately different (traceability-only DESIGN_REFERENCE copy; see that
 *  constant's own comment in strings/pt.ts). */
const GENERIC_LOGIN_ERROR = 'Usuário ou senha inválidos. Após tentativas repetidas, aguarde 15 minutos.';

function ruleItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.rule-item'));
}

function fillLogin(username: string, password: string) {
  fireEvent.change(screen.getByLabelText(t.auth.username), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(t.auth.password), { target: { value: password } });
}

function submitLogin() {
  fireEvent.click(screen.getByRole('button', { name: t.auth.submit }));
}

describe('Login', () => {
  it('(1) wrong password shows the server generic message verbatim in the banner', async () => {
    render(<Harness />);
    await waitForScreen('login');

    fillLogin('jose', 'wrong-password');
    submitLogin();

    const banner = await screen.findByRole('alert');
    expect(within(banner).getByText(GENERIC_LOGIN_ERROR)).toBeTruthy();

    // Both fields switch to the error border (A2).
    expect(screen.getByLabelText(t.auth.username).className).toContain('input-error');
  });

  it('successful login lands on the dashboard placeholder', async () => {
    render(<Harness />);
    await waitForScreen('login');

    fillLogin('jose', 'Senha123');
    submitLogin();

    await waitForScreen('dashboard');
  });
});

describe('ChangePassword — forced mode', () => {
  /** Logs maria in (mustChangePassword: true seed) and waits for the forced gate. */
  async function loginMaria() {
    render(<Harness />);
    await waitForScreen('login');
    fillLogin('maria', 'Senha123');
    submitLogin();
    await waitForScreen('change-password');
  }

  function fillChange(current: string, next: string, confirm: string) {
    fireEvent.change(screen.getByLabelText(t.auth.currentPasswordTemp), { target: { value: current } });
    fireEvent.change(screen.getByLabelText(t.auth.newPassword), { target: { value: next } });
    fireEvent.change(screen.getByLabelText(t.auth.confirmNewPassword), { target: { value: confirm } });
  }

  function submitChange() {
    fireEvent.click(screen.getByRole('button', { name: t.auth.savePasswordCta }));
  }

  it('(2) each policy violation blocks submit with the exact pt-BR message; checklist ticks live', async () => {
    await loginMaria();

    const newPasswordInput = screen.getByLabelText(t.auth.newPassword);

    // Too short — blocks with the min-length message, no digit/letter check yet.
    fireEvent.change(newPasswordInput, { target: { value: 'ab1' } });
    fireEvent.change(screen.getByLabelText(t.auth.confirmNewPassword), { target: { value: 'ab1' } });
    fireEvent.change(screen.getByLabelText(t.auth.currentPasswordTemp), { target: { value: 'Senha123' } });
    submitChange();
    expect(await screen.findByText(t.auth.policyMinLength)).toBeTruthy();
    // Still shows the mock, no API call fired — screen still on change-password.
    expect(document.querySelector('[data-screen="change-password"]')).toBeTruthy();

    // Long enough, but no digit.
    fillChange('Senha123', 'somelongpassword', 'somelongpassword');
    submitChange();
    expect(await screen.findByText(t.auth.policyDigit)).toBeTruthy();

    // Long enough, but no letter.
    fillChange('Senha123', '12345678', '12345678');
    submitChange();
    expect(await screen.findByText(t.auth.policyLetter)).toBeTruthy();

    // Checklist ticks as rules become satisfied (plain DOM query — a regex matcher via
    // getByText/getAllByText would also match ancestor containers whose concatenated
    // text happens to contain the rule copy, since RTL's regex matching isn't anchored
    // to a single leaf node).
    fireEvent.change(newPasswordInput, { target: { value: '' } });
    expect(ruleItems()).toHaveLength(2);
    expect(ruleItems().every(el => !el.className.includes('is-done'))).toBe(true);

    fireEvent.change(newPasswordInput, { target: { value: 'NovaSenha1' } });
    await waitFor(() => {
      expect(ruleItems().every(el => el.className.includes('is-done'))).toBe(true);
    });
  });

  it('(3) confirmação mismatch shows an inline error and blocks submit', async () => {
    await loginMaria();

    fillChange('Senha123', 'NovaSenha1', 'NovaSenha2');
    submitChange();

    expect(await screen.findByText(t.auth.confirmMismatch)).toBeTruthy();
    expect(document.querySelector('[data-screen="change-password"]')).toBeTruthy();
  });

  it('(4) forced mode renders no cancel affordance', async () => {
    await loginMaria();
    expect(screen.queryByRole('button', { name: t.common.back })).toBeNull();
  });

  it('(5) full forced flow: login -> change password -> lands authenticated on dashboard WITHOUT manual re-login', async () => {
    await loginMaria();

    fillChange('Senha123', 'NovaSenha1', 'NovaSenha1');
    submitChange();

    // Silent re-login happens automatically — no extra button click, no return to
    // the login screen in between.
    await waitForScreen('dashboard');
    expect(await screen.findByText(t.auth.passwordChanged)).toBeTruthy();

    const nav = screen.getByTestId('sidebar-nav');
    const labels = within(nav).getAllByRole('button').map(b => b.textContent);
    expect(labels).toEqual(['Painel', 'Apontamentos', 'Indicadores']);
  });

  it('wrong "senha atual" surfaces the server VALIDATION message inline, not a global toast', async () => {
    await loginMaria();

    fillChange('senha-errada', 'NovaSenha1', 'NovaSenha1');
    submitChange();

    expect(await screen.findByText('Senha atual incorreta.')).toBeTruthy();
    // Screen stays put — no silent re-login attempted, no forced move to dashboard.
    expect(document.querySelector('[data-screen="change-password"]')).toBeTruthy();
    // Shown inline only — useApiMutation's run() is called with {silent: true}, so
    // this VALIDATION error must not also surface as a global toast.
    expect(document.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('(7 · Fix 1) re-login failure after a successful changePassword lands on Login with exactly one info toast, no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      await loginMaria();

      // auth.changePassword itself must still succeed — only the immediate re-login
      // (the very next auth.login call) is made to fail, simulating a network blip
      // right after the password change already took effect server-side.
      mockGasControls.failNextLogin = true;
      fillChange('Senha123', 'NovaSenha1', 'NovaSenha1');
      submitChange();

      // Stranded-on-forced-screen would show `[data-screen="change-password"]` forever;
      // the fix falls through to Login instead.
      await waitForScreen('login');

      expect(await screen.findByText(t.auth.passwordChangedSignInAgain)).toBeTruthy();
      // The ordinary success toast must NOT also fire on this path.
      expect(screen.queryByText(t.auth.passwordChanged)).toBeNull();
      expect(document.querySelectorAll('.toast')).toHaveLength(1);

      // Give any stray microtask/rejection a chance to surface before asserting none did.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});

describe('ChangePassword — voluntary mode', () => {
  async function loginJoseAndOpenVoluntaryChange() {
    render(<Harness />);
    await waitForScreen('login');
    fillLogin('jose', 'Senha123');
    submitLogin();
    await waitForScreen('dashboard');

    // Open the user menu (desktop sidebar footer trigger) and click "Alterar senha"
    // (a role="menuitem" button, per UserMenu.tsx — not the generic "button" role).
    fireEvent.click(screen.getByText('José Almeida'));
    fireEvent.click(screen.getByRole('menuitem', { name: t.common.changePassword }));
    await waitForScreen('change-password');
  }

  it('(6) voluntary mode cancel returns to the screen underneath', async () => {
    await loginJoseAndOpenVoluntaryChange();

    expect(screen.getByRole('button', { name: t.common.back })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.common.back }));

    await waitForScreen('dashboard');
    expect(document.querySelector('[data-screen="change-password"]')).toBeNull();
  });

  it('voluntary mode completes a change and silently re-lands on the dashboard', async () => {
    await loginJoseAndOpenVoluntaryChange();

    // Voluntary mode drops the "(temporária)" qualifier from the current-password label.
    fireEvent.change(screen.getByLabelText(t.auth.currentPasswordPlain), { target: { value: 'Senha123' } });
    fireEvent.change(screen.getByLabelText(t.auth.newPassword), { target: { value: 'OutraSenha1' } });
    fireEvent.change(screen.getByLabelText(t.auth.confirmNewPassword), { target: { value: 'OutraSenha1' } });
    fireEvent.click(screen.getByRole('button', { name: t.auth.savePasswordCta }));

    await waitForScreen('dashboard');
    expect(await screen.findByText(t.auth.passwordChanged)).toBeTruthy();
  });
});
