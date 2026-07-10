/**
 * Task 8 — Admin (E1–E6/DT4/DT5). Drives the real dev mock end to end (login → admin
 * screen), same harness shape as visit.test.tsx/findings.test.tsx. No
 * @testing-library/jest-dom in this repo (see shell.test.tsx) — assertions use plain
 * DOM/chai checks instead of `toBeDisabled()`/`toBeInTheDocument()`.
 *
 * Fixture trace (src/client/lib/mock/fixtures.ts):
 *   - sava.admin/Sava1234 (u1, admin); jose/Senha123 (u2, regional, active, no
 *     mustChangePassword — used for the reset-password test).
 *   - Informática (d11) seeds 12 checklist items ci1..ci12 (itemRef 1.1..7.2, see
 *     buildChecklistItems). ci1='1.1' (low), ci3='2.1' (high), ci2='1.3' (low).
 *   - Sumaré (c1) has 5 unresolved findings (f1,f2,f4,f6,f15 — see dashboard.test.tsx's
 *     own trace of the same fixtures) — used for the Cidades deactivate-warning count.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from '../../src/client/state/session';
import { NavProvider, useNav } from '../../src/client/state/nav';
import { ToastProvider } from '../../src/client/state/toasts';
import { AppShell } from '../../src/client/App';
import { resetMockState } from '../../src/client/lib/mock/server';
import { t } from '../../src/client/strings/pt';

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

function LoginButton({ login, password }: { login: string; password: string }) {
  const session = useSession();
  return <button onClick={() => { void session.login(login, password); }}>{`do-login-${login}`}</button>;
}

/** Programmatic nav — same idiom as visit.test.tsx's GoVisit/findings.test.tsx's
 *  GoFindings — reaches `{name:'admin'}` directly regardless of what the real nav
 *  offers the logged-in role (needed for test 1's defense-in-depth redirect). */
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
async function loginAdmin() {
  fireEvent.click(screen.getByText('do-login-sava.admin'));
  await waitForScreen('dashboard');
}
async function loginJose() {
  fireEvent.click(screen.getByText('do-login-jose'));
  await waitForScreen('dashboard');
}
async function goToAdmin() {
  fireEvent.click(screen.getByText('go-admin'));
  await waitFor(() => expect(document.querySelector('.admin-tabs')).toBeTruthy(), { timeout: 3000 });
}
function switchTab(tab: string) {
  fireEvent.click(document.querySelector(`[data-tab="${tab}"]`)!);
}
function lastCallPayload(action: string): unknown {
  const calls = spyState.calls.filter(c => c.action === action);
  const last = calls[calls.length - 1];
  if (!last) throw new Error(`${action} was never called`);
  return last.payload;
}

describe('Admin', () => {
  it('(1) non-admin never renders Admin — stale nav to admin redirects to dashboard', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoAdmin /></Harness>);
    await loginJose();

    fireEvent.click(screen.getByText('go-admin'));
    await waitFor(() => expect(document.querySelector('[data-screen="dashboard"]')).toBeTruthy(), { timeout: 3000 });
    expect(document.querySelector('.admin-screen')).toBeNull();
  });

  it('(2) create user: local role blocks submit until cidade is chosen; success shows the temp password once; duplicate login is an inline error, no toast', async () => {
    render(<Harness><LoginButton login="sava.admin" password="Sava1234" /><GoAdmin /></Harness>);
    await loginAdmin();
    await goToAdmin();
    await waitFor(() => expect(document.querySelector('.admin-table-wrap')).toBeTruthy(), { timeout: 3000 });

    fireEvent.click(screen.getByText(t.admin.addNewUser));
    const dialog = await screen.findByRole('dialog', { name: t.admin.userForm.title });
    const submitBtn = within(dialog).getByRole('button', { name: t.admin.createUserCta }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText(t.admin.userForm.name), { target: { value: 'Novo Usuário' } });
    fireEvent.change(within(dialog).getByLabelText(t.admin.userForm.login), { target: { value: 'novo.usuario' } });
    // role defaults to 'local' in create mode — cidade is required and still empty.
    expect(submitBtn.disabled).toBe(true);

    const citySelect = within(dialog).getByLabelText(t.admin.userForm.city) as HTMLSelectElement;
    await waitFor(() => expect(citySelect.options.length).toBeGreaterThan(1), { timeout: 3000 });
    fireEvent.change(citySelect, { target: { value: 'c1' } });
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);
    const tempDialog = await screen.findByRole('dialog', { name: t.admin.userCreatedTitle });
    const secret = within(tempDialog).getByTestId('temp-password-secret').textContent ?? '';
    expect(secret).toMatch(/^[A-Z][a-z]{2}-\d{4}$/);
    expect(lastCallPayload('users.save')).toMatchObject({ user: { name: 'Novo Usuário', login: 'novo.usuario', role: 'local', cityId: 'c1' } });

    fireEvent.click(within(tempDialog).getByRole('button', { name: t.admin.doneCopiedPassword }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.admin.userCreatedTitle })).toBeNull());

    // Duplicate login (case-insensitive against jose's) → inline banner error, dialog
    // stays open, no toast.
    fireEvent.click(screen.getByText(t.admin.addNewUser));
    const dialog2 = await screen.findByRole('dialog', { name: t.admin.userForm.title });
    fireEvent.change(within(dialog2).getByLabelText(t.admin.userForm.name), { target: { value: 'Outro' } });
    fireEvent.change(within(dialog2).getByLabelText(t.admin.userForm.login), { target: { value: 'JOSE' } });
    fireEvent.change(within(dialog2).getByLabelText(t.admin.userForm.role), { target: { value: 'regional' } });
    fireEvent.click(within(dialog2).getByRole('button', { name: t.admin.createUserCta }));

    await waitFor(() => expect(within(dialog2).getByRole('alert').textContent).toMatch(/já existe/i), { timeout: 3000 });
    expect(document.querySelector('.toast-error')).toBeNull();
    expect(screen.getByRole('dialog', { name: t.admin.userForm.title })).toBeTruthy();
  });

  it('(3) reset password shows a new temp password dialog', async () => {
    render(<Harness><LoginButton login="sava.admin" password="Sava1234" /><GoAdmin /></Harness>);
    await loginAdmin();
    await goToAdmin();
    await waitFor(() => expect(document.querySelector('.admin-user-list [data-user-id="u2"]')).toBeTruthy(), { timeout: 3000 });

    fireEvent.click(document.querySelector('.admin-user-list [data-user-id="u2"]')!);
    const editDialog = await screen.findByRole('dialog', { name: t.admin.editUserTitle });
    fireEvent.click(within(editDialog).getByRole('button', { name: t.admin.resetPasswordCta }));

    const confirmDialog = await screen.findByRole('dialog', { name: t.admin.resetPasswordConfirmTitle });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.admin.resetPasswordCta }));

    // Reset (unlike create) must not claim "Usuário criado" for an existing user —
    // task-10 UI-walkthrough fix (src/client/screens/admin/Users.tsx/TempPasswordDialog.tsx).
    const tempDialog = await screen.findByRole('dialog', { name: t.admin.passwordResetTitle });
    const secret = within(tempDialog).getByTestId('temp-password-secret').textContent ?? '';
    expect(secret).toMatch(/^[A-Z][a-z]{2}-\d{4}$/);
    expect(lastCallPayload('users.resetPassword')).toEqual({ userId: 'u2' });
  });

  it('(4) catalog import: preview classifies novo/alterado/inalterado/inválido + lists absent; confirming with one absent checked sends only that id', async () => {
    render(<Harness><LoginButton login="sava.admin" password="Sava1234" /><GoAdmin /></Harness>);
    await loginAdmin();
    await goToAdmin();
    switchTab('catalog');

    const deptSelect = await screen.findByLabelText(t.findings.filterLabels.department) as HTMLSelectElement;
    await waitFor(() => expect(deptSelect.options.length).toBeGreaterThan(1), { timeout: 3000 });
    fireEvent.change(deptSelect, { target: { value: 'd11' } });

    const tsv = [
      '1.1\tROTINAS\tAta de reunião do departamento registrada\tBaixa', // unchanged
      '2.1\tINFRAESTRUTURA\tNobreak dos servidores testado e revisado\tAlta', // changed (text)
      '9.9\tNOVIDADE\tItem novo de teste\tMédia', // new
      'linha quebrada sem tabulação', // invalid
    ].join('\n');
    fireEvent.change(screen.getByLabelText(t.admin.pasteChecklistLabel), { target: { value: tsv } });
    fireEvent.click(screen.getByRole('button', { name: t.admin.previewChangesCta }));

    await waitFor(() => expect(document.querySelector('.import-table-wrap')).toBeTruthy(), { timeout: 3000 });
    expect(document.querySelector('[data-kind="unchanged"]')?.textContent).toContain(t.admin.importDiff.unchanged);
    expect(document.querySelector('[data-kind="changed"]')?.textContent).toContain(t.admin.importDiff.changed);
    expect(document.querySelector('[data-kind="new"]')?.textContent).toContain(t.admin.importDiff.new);
    expect(document.querySelector('[data-kind="invalid"]')?.textContent).toContain(t.admin.importDiff.invalid);

    // ci2 = itemRef '1.3', an existing active Informática item never mentioned in the
    // pasted text above → listed as absent, checkbox default UNCHECKED.
    const absentCheckbox = document.querySelector('[data-absent-id="ci2"] .import-absent-checkbox') as HTMLInputElement;
    expect(absentCheckbox).toBeTruthy();
    expect(absentCheckbox.checked).toBe(false);
    fireEvent.click(absentCheckbox);

    fireEvent.click(screen.getByText(/^Aplicar:/));
    await waitFor(() => {
      expect(lastCallPayload('checklistItems.importPaste')).toMatchObject({
        departmentId: 'd11', apply: true, deactivateAbsent: ['ci2'],
      });
    }, { timeout: 3000 });
  });

  it('(5) deactivating a city with open findings shows the inline warning copy', async () => {
    render(<Harness><LoginButton login="sava.admin" password="Sava1234" /><GoAdmin /></Harness>);
    await loginAdmin();
    await goToAdmin();
    switchTab('cities');

    await waitFor(() => {
      const card = document.querySelector('[data-entity-id="c1"]');
      expect(card?.textContent).toContain(t.admin.openFindingsCount(5));
    }, { timeout: 3000 });

    fireEvent.click(document.querySelector('[data-entity-id="c1"] .toggle-input')!);

    await waitFor(() => expect(document.querySelector('[data-entity-id="c1"] .master-card-warning')).toBeTruthy(), { timeout: 3000 });
    expect(document.querySelector('[data-entity-id="c1"] .master-card-warning')!.textContent)
      .toContain(t.admin.cityDeactivateWarning(5));
  });

  it('(6) temp password dialog: when navigator.clipboard is undefined, Copiar button stays in non-copied state', async () => {
    render(<Harness><LoginButton login="sava.admin" password="Sava1234" /><GoAdmin /></Harness>);
    await loginAdmin();
    await goToAdmin();

    fireEvent.click(screen.getByText(t.admin.addNewUser));
    const dialog = await screen.findByRole('dialog', { name: t.admin.userForm.title });

    fireEvent.change(within(dialog).getByLabelText(t.admin.userForm.name), { target: { value: 'Test User' } });
    fireEvent.change(within(dialog).getByLabelText(t.admin.userForm.login), { target: { value: 'test.clipboard' } });
    const citySelect = within(dialog).getByLabelText(t.admin.userForm.city) as HTMLSelectElement;
    await waitFor(() => expect(citySelect.options.length).toBeGreaterThan(1), { timeout: 3000 });
    fireEvent.change(citySelect, { target: { value: 'c1' } });

    // Stub navigator.clipboard as undefined to simulate unavailable API
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

    try {
      fireEvent.click(within(dialog).getByRole('button', { name: t.admin.createUserCta }));
      const tempDialog = await screen.findByRole('dialog', { name: t.admin.userCreatedTitle });

      const copyBtn = within(tempDialog).getByRole('button', { name: t.admin.copy });
      fireEvent.click(copyBtn);

      // Flush microtasks/timers BEFORE asserting: the buggy variant
      // (`await navigator.clipboard?.writeText(...)`) flips to the copied state one
      // microtask later, which a waitFor-first-pass check never observes — proven by
      // mutation testing in review. A settled synchronous assert catches it.
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(copyBtn.textContent).toBe(t.admin.copy);
    } finally {
      // Restore original clipboard
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    }
  });
});
