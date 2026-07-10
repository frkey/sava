/**
 * Task 6 — Finding detail (C3/C4/C5/DT3, simplified per FindingDetail.tsx/PdfViewer.tsx
 * file headers). Same harness shape as findings.test.tsx/dashboard.test.tsx — drives the
 * real dev mock end to end. Navigation to the detail screen is programmatic (`GoFinding`
 * below), mirroring dashboard.test.tsx's `GoFindings`/`NavSpy` pattern, since clicking
 * through the findings list is already covered by findings.test.tsx test (6).
 *
 * Fixture trace (src/client/lib/mock/fixtures.ts):
 *   f1 — city c1 (Sumaré), status open, high, overdue deadline, assignee+considerations
 *        set, visitDepartmentId 'vd1' (has a PDF in the mock's pdfStore), ZERO existing
 *        FindingReview rows.
 *   f3 — city c1, status resolved, already has ONE visit_review (r2, visitId v2,
 *        result 'resolved'). c1's visits by mainDate desc are v3 (current period,
 *        ~2 days ago) > v2 (p6, ~months ago) > v1 (p12, ~a year ago) — so
 *        ReviewDialog's default-selected visit (most recent) is v3, NOT v2, so a fresh
 *        review submitted without changing the visit select targets a visit with no
 *        existing review row for f3 → the "NEW review on resolved finding" CONFLICT
 *        path (src/client/lib/mock/server.ts findingReviewsSave).
 *   f15 — city c1, visitDepartmentId 'vd6' (participation-only, no pdfFileId/counts —
 *        the D3 "iniciado" fixture) — downloading its PDF is the NOT_FOUND case.
 *
 * jsdom doesn't implement `URL.createObjectURL`/`revokeObjectURL` at all (confirmed:
 * calling either throws "is not a function") — stubbed in `beforeEach` before any test
 * spies on them. jsdom's default `window.innerWidth` is 1024 (≥ the 900px desktop
 * breakpoint FindingDetail.tsx checks), so the PDF happy-path test naturally exercises
 * the desktop PdfViewer-dialog branch without resizing anything.
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
import { t, statusLabel, reviewResultLabel } from '../../src/client/strings/pt';

/** Records every `callApi` invocation without changing behavior — every call still
 *  resolves through the real dev mock. Same `vi.hoisted` pattern as
 *  findings.test.tsx/login.test.tsx. Used by test (6) to lock in the fix for a
 *  cross-city `visits.list` race a code review caught: FindingDetail must never fire
 *  `visits.list` with an unscoped (`cityId: undefined`) payload — see
 *  FindingDetailBody's file-header comment in src/client/screens/FindingDetail.tsx. */
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
  if (!('createObjectURL' in URL)) (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => '';
  if (!('revokeObjectURL' in URL)) (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

/** Programmatic nav straight to a finding's detail screen — bypasses the findings list
 *  (already covered by findings.test.tsx test (6)). Renders one button per id so a test
 *  can jump between several findings (e.g. comparing StatusDialog for two statuses). */
function GoFindings({ ids }: { ids: string[] }) {
  const { go } = useNav();
  return (
    <>
      {ids.map(id => (
        <button key={id} onClick={() => go({ name: 'finding', id })}>{`go-finding-${id}`}</button>
      ))}
    </>
  );
}

async function waitForScreen(name: string) {
  await waitFor(
    () => expect(document.querySelector(`[data-screen="${name}"]`)).toBeTruthy(),
    { timeout: 3000 },
  );
}

async function waitForFindingLoaded() {
  await waitFor(() => expect(document.querySelector('.finding-detail-card')).toBeTruthy(), { timeout: 3000 });
}

async function goToFinding(findingId: string) {
  fireEvent.click(screen.getByText(`go-finding-${findingId}`));
  await waitForScreen('finding');
  await waitForFindingLoaded();
}

async function loginJoseAndOpen(findingId: string, otherIds: string[] = []) {
  render(
    <Harness>
      <LoginButton login="jose" password="Senha123" />
      <GoFindings ids={[findingId, ...otherIds]} />
    </Harness>,
  );
  fireEvent.click(screen.getByText('do-login-jose'));
  await waitForScreen('dashboard');
  await goToFinding(findingId);
}

/** maria (u3, local, cityId c1) is seeded with mustChangePassword:true — completes the
 *  forced change first, mirroring findings.test.tsx's identical helper. */
async function loginMariaAndOpen(findingId: string) {
  render(
    <Harness>
      <LoginButton login="maria" password="Senha123" />
      <LoginButton login="maria" password="NovaSenha123" label="do-relogin-maria" />
      <GoFindings ids={[findingId]} />
    </Harness>,
  );
  fireEvent.click(screen.getByText('do-login-maria'));
  await waitForScreen('change-password');
  await callApi('auth.changePassword', { currentPassword: 'Senha123', newPassword: 'NovaSenha123' });
  fireEvent.click(screen.getByText('do-relogin-maria'));
  await waitForScreen('dashboard');
  await goToFinding(findingId);
}

describe('FindingDetail', () => {
  it('(1) local role sees no action buttons (Editar/Mudar status/Registrar revisão), but keeps the PDF button', async () => {
    await loginMariaAndOpen('f1');

    expect(screen.queryByText(t.findings.actions.edit)).toBeNull();
    expect(screen.queryByText(t.findings.actions.changeStatus)).toBeNull();
    expect(screen.queryByText(t.findings.actions.registerReview)).toBeNull();
    expect(screen.getByText(t.findings.viewPdf)).toBeTruthy();
  });

  it('(2) StatusDialog offers exactly the legal transitions from the current status', async () => {
    await loginJoseAndOpen('f1', ['f3']); // status: open
    fireEvent.click(screen.getByText(t.findings.actions.changeStatus));
    const dialog = screen.getByRole('dialog', { name: t.findings.actions.changeStatus });
    const openOptions = within(dialog).getAllByText(/^(Em tratamento|Resolvido|Cancelado)$/, { selector: '.option-card-title' });
    expect(openOptions.map(el => el.textContent).sort()).toEqual(
      [statusLabel.in_treatment, statusLabel.resolved, statusLabel.cancelled].sort(),
    );
    expect(within(dialog).queryByText(statusLabel.open, { selector: '.option-card-title' })).toBeNull();
    fireEvent.click(within(dialog).getByLabelText(t.common.close));

    await goToFinding('f3'); // f3: status resolved
    fireEvent.click(screen.getByText(t.findings.actions.changeStatus));
    const dialog2 = screen.getByRole('dialog', { name: t.findings.actions.changeStatus });
    const resolvedOptions = within(dialog2).getAllByText(/.+/, { selector: '.option-card-title' });
    expect(resolvedOptions.map(el => el.textContent)).toEqual([statusLabel.open]);
  });

  it('(3) confirm is disabled until justificativa is filled; a successful updateStatus refreshes the timeline', async () => {
    await loginJoseAndOpen('f1');
    expect(document.querySelectorAll('[data-entry-kind="status_change"]')).toHaveLength(0);

    fireEvent.click(screen.getByText(t.findings.actions.changeStatus));
    const dialog = screen.getByRole('dialog', { name: t.findings.actions.changeStatus });
    const confirmBtn = within(dialog).getByText(t.findings.confirmChange).closest('button')!;
    expect(confirmBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.click(within(dialog).getByText(statusLabel.in_treatment));
    expect(confirmBtn.hasAttribute('disabled')).toBe(true); // still no note

    const noteField = within(dialog).getByLabelText(t.findings.justificationLabel);
    fireEvent.change(noteField, { target: { value: 'Orçamento aprovado.' } });
    expect(confirmBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(confirmBtn);

    await waitFor(() => expect(screen.getByText(t.findings.statusChangeSuccess)).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t.findings.actions.changeStatus })).toBeNull());
    await waitFor(() => {
      expect(document.querySelectorAll('[data-entry-kind="status_change"]')).toHaveLength(1);
    });
    expect(document.querySelector('.status-badge-detail')?.textContent).toContain(statusLabel.in_treatment);
  });

  it('(4) ReviewDialog: observação required for não resolvida/parcial, optional for resolvida; CONFLICT renders in-dialog, not a toast', async () => {
    await loginJoseAndOpen('f1', ['f3']); // status: open, no existing reviews
    fireEvent.click(screen.getByText(t.findings.actions.registerReview));
    const dialog = screen.getByRole('dialog', { name: t.findings.actions.registerReview });
    await waitFor(() => {
      const select = within(dialog).getByLabelText(t.findings.reviewLabels.visit) as HTMLSelectElement;
      expect(select.value).not.toBe('');
    });
    const confirmBtn = within(dialog).getByText(t.findings.saveReview).closest('button')!;
    const notesField = within(dialog).getByLabelText(t.findings.reviewLabels.notes);

    fireEvent.click(within(dialog).getByText(reviewResultLabel.resolved));
    expect(confirmBtn.hasAttribute('disabled')).toBe(false); // resolvida: notes optional

    fireEvent.click(within(dialog).getByText(reviewResultLabel.not_resolved));
    expect(confirmBtn.hasAttribute('disabled')).toBe(true); // não resolvida: notes required
    fireEvent.change(notesField, { target: { value: 'Ainda pendente.' } });
    expect(confirmBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.change(notesField, { target: { value: '' } });
    fireEvent.click(within(dialog).getByText(reviewResultLabel.partial));
    expect(confirmBtn.hasAttribute('disabled')).toBe(true); // parcial: notes required
    fireEvent.change(notesField, { target: { value: 'Metade concluída.' } });
    expect(confirmBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(within(dialog).getByLabelText(t.common.close));

    // f3: resolved, has an existing review only against v2 — the default-selected
    // (most recent) visit is v3, so a fresh submission hits the CONFLICT path.
    await goToFinding('f3');
    fireEvent.click(screen.getByText(t.findings.actions.registerReview));
    const dialog2 = screen.getByRole('dialog', { name: t.findings.actions.registerReview });
    await waitFor(() => {
      const select = within(dialog2).getByLabelText(t.findings.reviewLabels.visit) as HTMLSelectElement;
      expect(select.value).not.toBe('');
    });
    fireEvent.click(within(dialog2).getByText(reviewResultLabel.resolved));
    fireEvent.click(within(dialog2).getByText(t.findings.saveReview).closest('button')!);

    await waitFor(() => {
      expect(within(dialog2).getByText(/resolvid.*cancelad/i)).toBeTruthy();
    });
    expect(document.querySelector('.banner-error')).toBeTruthy();
    expect(document.querySelectorAll('.toast-error')).toHaveLength(0);
    // Dialog stays open (server message shown in-dialog, not a toast that would leave
    // the dialog looking like nothing happened).
    expect(screen.getByRole('dialog', { name: t.findings.actions.registerReview })).toBeTruthy();
  });

  it('(5) PDF: happy path creates a blob URL and revokes it on close; missing PDF surfaces a toast', async () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    await loginJoseAndOpen('f1', ['f15']); // vd1 has a PDF in the mock's pdfStore
    fireEvent.click(screen.getByText(t.findings.viewPdf));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    const dialog = await waitFor(() => screen.getByRole('dialog'));
    const iframe = within(dialog).getByTitle(/PDF do SIGA/) as HTMLIFrameElement;
    expect(iframe.src).toContain('blob:mock-url');

    fireEvent.click(within(dialog).getByLabelText(t.common.close));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url');

    // f15's visitDepartment (vd6) has no pdfFileId attached — NOT_FOUND from the mock.
    fireEvent.click(screen.getByText('go-finding-f15'));
    await waitForFindingLoaded();
    fireEvent.click(screen.getByText(t.findings.viewPdf));

    await waitFor(() => {
      const toast = document.querySelector('.toast-error');
      expect(toast?.textContent).toContain('Nenhum PDF anexado');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('(6) visits.list is only ever called scoped to the finding\'s own city, never unscoped', async () => {
    // Regional/admin: an unscoped `visits.list` (cityId undefined) would, per the mock's
    // own city-scoping rule, return every city's visits — exactly the cross-city data a
    // prior review round caught racing findings.get. f1 is city c1.
    await loginJoseAndOpen('f1');

    const visitsCalls = spyState.calls.filter(c => c.action === 'visits.list');
    expect(visitsCalls.length).toBeGreaterThan(0);
    for (const call of visitsCalls) {
      expect(call.payload).toEqual({ cityId: 'c1' });
    }

    // Opening ReviewDialog must only ever offer c1 visits in the select. Wait for the
    // loading placeholder (a single disabled option) to be replaced by the real list —
    // just checking options.length > 0 would pass on the placeholder itself.
    fireEvent.click(screen.getByText(t.findings.actions.registerReview));
    const dialog = screen.getByRole('dialog', { name: t.findings.actions.registerReview });
    await waitFor(() => {
      const select = within(dialog).getByLabelText(t.findings.reviewLabels.visit) as HTMLSelectElement;
      expect(select.disabled).toBe(false);
    });
    const select = within(dialog).getByLabelText(t.findings.reviewLabels.visit) as HTMLSelectElement;
    // c1 (Sumaré) has 3 visits in the fixtures (v1/v2/v3); a cross-city leak would add more.
    expect(select.options.length).toBe(3);
  });
});
