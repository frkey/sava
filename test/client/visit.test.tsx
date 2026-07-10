/**
 * Task 7 — Visit registration field flow (D1–D6, spec §8.5). Same harness shape as
 * dashboard.test.tsx/findingDetail.test.tsx — drives the real dev mock end to end,
 * logged in as jose (regional). Uses the `vi.hoisted` callApi spy (same pattern as
 * findingDetail.test.tsx) to assert exact RPC payloads for visits.save,
 * findingReviews.save and findings.save's `force` flag.
 *
 * Step-tab navigation clicks target `[data-step="…"]` (Visit.tsx/shared.tsx's
 * StepTabs), never the tab's visible label — the label text itself flips between
 * "1 · Participação" and "✓ Participação" depending on `participationDone`, so text
 * matching would be brittle exactly where these tests need it to be reliable.
 *
 * Fixture trace (src/client/lib/mock/fixtures.ts) — city c1 (Sumaré), visit v3 is the
 * CURRENT open visit (period = this calendar month):
 *   vd5 (Tesouraria, d20)   — completed, full pdf+counts → D3 "done", no missing badge.
 *   vd6 (Informática, d11)  — participation-only, no completedAt → D3 "started".
 *   every other active department has no VisitDepartment row on v3 → "notStarted".
 *   f1  (itemRef 4.5, Informática, visitId v1, status open, overdue)   — reviewQueue
 *       item for v3+Informática (other-visit, still unresolved).
 *   f2  (itemRef 3.2, Informática, visitId v1, status in_treatment)    — reviewQueue
 *       item for v3+Informática.
 *   f15 (itemRef 6.1, Informática, visitId v3 itself, status open)     — excluded from
 *       v3's own reviewQueue (server semantics: never carries over a finding's own
 *       origin visit), but IS one of "this visit's" registered findings for step E/F.
 *   Informática's checklist item '4.5' ("Inventário de equipamentos atualizado") is the
 *   same itemRef as f1 — selecting it in step E while f1 is still unresolved is the
 *   duplicate-itemRef CONFLICT test (5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from '../../src/client/state/session';
import { NavProvider, useNav } from '../../src/client/state/nav';
import { ToastProvider } from '../../src/client/state/toasts';
import { AppShell } from '../../src/client/App';
import { mockApi, resetMockState } from '../../src/client/lib/mock/server';
import { t, reviewResultLabel, severityLabel } from '../../src/client/strings/pt';

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

/** Programmatic nav — same idiom as findingDetail.test.tsx's GoFindings. */
function GoVisit({ visitId, label }: { visitId?: string; label: string }) {
  const { go } = useNav();
  return <button onClick={() => go({ name: 'visit', visitId })}>{label}</button>;
}
function GoDashboard() {
  const { go } = useNav();
  return <button onClick={() => go({ name: 'dashboard' })}>go-dashboard</button>;
}

async function waitForScreen(name: string) {
  await waitFor(
    () => expect(document.querySelector(`[data-screen="${name}"]`)).toBeTruthy(),
    { timeout: 3000 },
  );
}
async function loginJose() {
  fireEvent.click(screen.getByText('do-login-jose'));
  await waitForScreen('dashboard');
}
async function loginAdmin() {
  fireEvent.click(screen.getByText('do-login-sava.admin'));
  await waitForScreen('dashboard');
}
/** Waits for actual department cards, not just the (possibly still-empty) `.visit-grid`
 *  wrapper — `departments.list` resolves asynchronously (400–800ms dev-mock latency,
 *  lib/gas.ts), so the grid can mount with zero cards for a moment. */
async function waitForGrid() {
  await waitFor(
    () => expect(document.querySelectorAll('.visit-dept-card').length).toBeGreaterThan(0),
    { timeout: 3000 },
  );
}
/** Waits for a `<select>`'s async-loaded options (beyond the static placeholder) before
 *  a test drives it — same "data, not just DOM presence" reasoning as waitForGrid. */
async function waitForOptionsLoaded(select: HTMLSelectElement) {
  await waitFor(() => expect(select.options.length).toBeGreaterThan(1), { timeout: 3000 });
}
async function waitForStep(step: string) {
  await waitFor(
    () => expect(document.querySelector(`[data-step="${step}"].visit-step-tab-active`)).toBeTruthy(),
    { timeout: 3000 },
  );
}
async function goToDepartmentStep(departmentId: string, step: 'participation' | 'review' | 'newFindings') {
  fireEvent.click(document.querySelector(`[data-department-id="${departmentId}"]`)!);
  await waitForStep('participation');
  if (step !== 'participation') {
    fireEvent.click(document.querySelector(`[data-step="${step}"]`)!);
    await waitForStep(step);
  }
}

describe('Visit', () => {
  it('(1) A: create shows confirmation with cidade+competência and calls visits.save; a CONFLICT (existingVisitId) reopens that visit silently', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit label="go-visit-new" /><GoDashboard /></Harness>);
    await loginJose();

    // --- part A: plain create, no clash ---
    fireEvent.click(screen.getByText('go-visit-new'));
    await waitForScreen('visit');
    const citySelect = (await screen.findByLabelText(t.visit.cityLabel)) as HTMLSelectElement;
    await waitForOptionsLoaded(citySelect);
    fireEvent.change(citySelect, { target: { value: 'c2' } }); // Campinas
    const periodInput = screen.getByLabelText(t.visit.periodLabel);
    fireEvent.change(periodInput, { target: { value: '012099' } });
    expect((periodInput as HTMLInputElement).value).toBe('01/2099');

    fireEvent.click(screen.getByText(t.visit.continueCta));
    const confirmDialog = await screen.findByRole('dialog', { name: t.visit.confirmTitle });
    expect(within(confirmDialog).getByText('Campinas')).toBeTruthy();
    expect(within(confirmDialog).getByText(/01\/2099/)).toBeTruthy();

    fireEvent.click(within(confirmDialog).getByText(t.visit.confirmCta));
    await waitForGrid();
    const createCall = spyState.calls.find(c => c.action === 'visits.save');
    expect(createCall?.payload).toMatchObject({ visit: { cityId: 'c2', period: '01/2099' } });

    // --- part B: seed a clashing visit, then attempt the same city+period again ---
    const jose = mockApi('auth.login', { login: 'jose', password: 'Senha123' }, undefined);
    if (!jose.ok) throw new Error('setup login failed');
    const seeded = mockApi(
      'visits.save',
      { visit: { cityId: 'c2', period: '03/2099', mainDate: '2099-03-05' } },
      jose.data.token,
    );
    if (!seeded.ok) throw new Error('setup seed failed');

    fireEvent.click(screen.getByText('go-dashboard'));
    await waitForScreen('dashboard');
    fireEvent.click(screen.getByText('go-visit-new'));
    await waitForScreen('visit');

    const citySelect2 = (await screen.findByLabelText(t.visit.cityLabel)) as HTMLSelectElement;
    await waitForOptionsLoaded(citySelect2);
    fireEvent.change(citySelect2, { target: { value: 'c2' } });
    fireEvent.change(screen.getByLabelText(t.visit.periodLabel), { target: { value: '032099' } });
    fireEvent.click(screen.getByText(t.visit.continueCta));
    const confirmDialog2 = await screen.findByRole('dialog', { name: t.visit.confirmTitle });
    fireEvent.click(within(confirmDialog2).getByText(t.visit.confirmCta));

    // CONFLICT → no error shown, lands directly on the EXISTING visit's grid.
    await waitForGrid();
    expect(document.querySelector('.banner-error')).toBeNull();
    expect(document.querySelectorAll('.toast-error')).toHaveLength(0);
    expect(screen.getByText('Campinas', { exact: false })).toBeTruthy();
    expect(screen.getByText('03/2099', { exact: false })).toBeTruthy();
  }, 15000); // two full create round trips (each several sequential 400-800ms mock fetches)

  it('(2) nav with visitId skips step A — visits.get loads and the grid renders directly', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginJose();

    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForScreen('visit');
    await waitForGrid();

    expect(spyState.calls.some(c => c.action === 'visits.get' && JSON.stringify(c.payload) === '{"id":"v3"}')).toBe(true);
    expect(screen.queryByLabelText(t.visit.cityLabel)).toBeNull(); // step A never rendered
    // The city name resolves from a separate `cities.list` fetch and briefly falls back
    // to the raw cityId while it's in flight (same pattern as Findings.tsx/
    // FindingDetail.tsx) — wait for it rather than asserting synchronously right after
    // waitForGrid(), which only guarantees the department cards themselves are in.
    await waitFor(() => expect(screen.getByText('Sumaré', { exact: false })).toBeTruthy());
  });

  it('(3) B: grid card states derive from visits.get rows — done/started/notStarted + missing badge', async () => {
    // Seed one MORE completed department on v3 with no pdf/counts, so the "falta
    // PDF/resumo" badge (missing on every fixture `completed()` row by construction)
    // has a real case to assert against.
    const jose = mockApi('auth.login', { login: 'jose', password: 'Senha123' }, undefined);
    if (!jose.ok) throw new Error('setup login failed');
    const created = mockApi(
      'visitDepartments.save',
      { visitDepartment: { visitId: 'v3', departmentId: 'd1' } }, // Anciães Verificação
      jose.data.token,
    );
    if (!created.ok) throw new Error('setup save failed');
    const done = mockApi('visitDepartments.markDone', { id: created.data.id }, jose.data.token);
    if (!done.ok) throw new Error('setup markDone failed');

    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginJose();
    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForGrid();

    const tesouraria = document.querySelector('[data-department-id="d20"]')!;
    expect(tesouraria.getAttribute('data-department-state')).toBe('done');
    expect(tesouraria.querySelector('.visit-dept-card-missing')).toBeNull();

    const informatica = document.querySelector('[data-department-id="d11"]')!;
    expect(informatica.getAttribute('data-department-state')).toBe('started');

    const juridico = document.querySelector('[data-department-id="d12"]')!;
    expect(juridico.getAttribute('data-department-state')).toBe('notStarted');

    const anciaes = document.querySelector('[data-department-id="d1"]')!;
    expect(anciaes.getAttribute('data-department-state')).toBe('done');
    expect(anciaes.querySelector('.visit-dept-card-missing')?.textContent).toBe(t.labels.missingBoth);
  });

  it('(4) D: a decision posts findingReviews.save with the finding/visit ids; observação required for não resolvida; re-entry pre-selects it', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginJose();
    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForGrid();
    await goToDepartmentStep('d11', 'review'); // Informática

    const f1Card = await waitFor(() => {
      const el = document.querySelector('[data-finding-id="f1"]');
      if (!el) throw new Error('f1 card not rendered yet');
      return el as HTMLElement;
    });

    fireEvent.click(within(f1Card).getByText(reviewResultLabel.not_resolved));
    const confirmBtn = within(f1Card).getByText(t.visit.saveDecisionCta).closest('button')!;
    expect(confirmBtn.hasAttribute('disabled')).toBe(true); // notes required, still empty

    const notesField = within(f1Card).getByPlaceholderText(t.findings.observationPlaceholder);
    fireEvent.change(notesField, { target: { value: 'Ainda não regularizado.' } });
    expect(confirmBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(confirmBtn);
    // A plain real-time wait, not `waitFor` polling the DOM: `confirmBtn`'s disabled
    // attribute goes true IMMEDIATELY on click too (mutation.saving flips synchronously,
    // well before the mock's own 400-800ms latency resolves), so polling "disabled"
    // can't tell "still saving" apart from "reload caught up" — and this save is
    // followed by a SECOND sequential round trip (`onSaved` → reviewQueue reload) that
    // `waitFor`'s MutationObserver-driven re-checks were observed to starve out
    // entirely (the pending `setTimeout` for the mock's simulated latency never fired
    // while the observer kept re-invoking the callback on every render) — a fixed delay
    // comfortably covering both hops sidesteps that interaction reliably.
    await new Promise(resolve => setTimeout(resolve, 2000));
    expect(confirmBtn.hasAttribute('disabled')).toBe(true); // dirty cleared once the reload landed

    const saveCall = spyState.calls.find(c => c.action === 'findingReviews.save');
    expect(saveCall?.payload).toMatchObject({
      findingId: 'f1', visitId: 'v3', result: 'not_resolved', notes: 'Ainda não regularizado.',
    });

    // Re-entry: leave step D, come back — the just-saved decision must show pre-selected.
    fireEvent.click(document.querySelector('[data-step="participation"]')!);
    await waitForStep('participation');
    fireEvent.click(document.querySelector('[data-step="review"]')!);
    await waitForStep('review');
    const f1CardAgain = await waitFor(() => {
      const el = document.querySelector('[data-finding-id="f1"]');
      if (!el) throw new Error('f1 card not rendered yet');
      return el as HTMLElement;
    });
    expect(f1CardAgain.querySelector('.review-decision-btn-selected-not_resolved')).toBeTruthy();
    expect((within(f1CardAgain).getByPlaceholderText(t.findings.observationPlaceholder) as HTMLTextAreaElement).value)
      .toBe('Ainda não regularizado.');
  }, 10000); // save + reviewQueue reload are two sequential 400-800ms mock fetches

  it('(5) E: picking a catalog item fills section/severity; duplicate CONFLICT → confirm → resend with force:true', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginJose();
    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForGrid();
    await goToDepartmentStep('d11', 'newFindings'); // Informática

    fireEvent.click(screen.getByText(t.visit.addFindingCta));
    const catalogSelect = (await screen.findByLabelText(t.visit.catalogItemLabel)) as HTMLSelectElement;
    await waitForOptionsLoaded(catalogSelect);
    const option = Array.from(catalogSelect.options).find(o => o.textContent?.startsWith('4.5'))!;
    fireEvent.change(catalogSelect, { target: { value: option.value } });

    await waitFor(() => {
      expect(screen.getByText(t.visit.catalogAutofillHelper('ROTINAS', severityLabel.high))).toBeTruthy();
    });

    fireEvent.click(screen.getByText(t.visit.addFindingCta)); // submit (same button, now acting as save)
    await waitFor(() => expect(screen.getByText(t.visit.duplicateWarning.title)).toBeTruthy());

    const firstSaveCall = spyState.calls.filter(c => c.action === 'findings.save').at(-1);
    expect(firstSaveCall?.payload).toMatchObject({ finding: { itemRef: '4.5' }, force: false });

    fireEvent.click(screen.getByText(t.visit.duplicateWarning.registerAnyway));
    await waitFor(() => expect(screen.queryByText(t.visit.duplicateWarning.title)).toBeNull());

    const findingsSaveCalls = spyState.calls.filter(c => c.action === 'findings.save');
    expect(findingsSaveCalls).toHaveLength(2);
    expect(findingsSaveCalls[1]!.payload).toMatchObject({ finding: { itemRef: '4.5' }, force: true });
  });

  it('(6) F: Concluir departamento calls markDone and the grid reflects the department as done', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginJose();
    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForGrid();

    // Tesouraria (d20) is already completed by the fixtures — reopen it and re-conclude
    // to exercise the "not a lock" markDone path without needing new participation data.
    await goToDepartmentStep('d20', 'newFindings');

    fireEvent.click(screen.getByText(t.visit.concludeCta));
    await waitForGrid();

    const markDoneCall = spyState.calls.find(c => c.action === 'visitDepartments.markDone');
    expect(markDoneCall).toBeTruthy();
    const tesouraria = document.querySelector('[data-department-id="d20"]')!;
    expect(tesouraria.getAttribute('data-department-state')).toBe('done');
    expect(tesouraria.querySelector('.visit-dept-card-icon')?.textContent).toBe('✓');
  });

  it('(7) step tabs: a bare VisitDepartment row (lazily created, no participation data) does NOT tick "✓ Participação"; a filled one does', async () => {
    // Seed a BARE row on v3 for Jurídico (d12) — exactly what ensureVisitDepartmentId
    // creates as a side effect of a PDF upload or finding save before the participation
    // form was ever submitted.
    const jose = mockApi('auth.login', { login: 'jose', password: 'Senha123' }, undefined);
    if (!jose.ok) throw new Error('setup login failed');
    const bare = mockApi(
      'visitDepartments.save',
      { visitDepartment: { visitId: 'v3', departmentId: 'd12' } },
      jose.data.token,
    );
    if (!bare.ok) throw new Error('setup save failed');

    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginJose();
    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForGrid();

    // Bare row: participation tab must NOT be marked done while another tab is active.
    await goToDepartmentStep('d12', 'review');
    const bareTab = document.querySelector('[data-step="participation"]')!;
    expect(bareTab.classList.contains('visit-step-tab-done')).toBe(false);
    expect(bareTab.classList.contains('visit-step-tab-pending')).toBe(true);

    // Filled row (Tesouraria d20 has reps + counts in the fixtures): tab IS marked done.
    fireEvent.click(document.querySelector('.subpage-back')!);
    await waitForGrid();
    await goToDepartmentStep('d20', 'review');
    const filledTab = document.querySelector('[data-step="participation"]')!;
    expect(filledTab.classList.contains('visit-step-tab-done')).toBe(true);
  }, 10000);

  it('(8) local role never renders the Visit screen — {name:\'visit\'} redirects to the dashboard', async () => {
    // maria (u3, local, c1) is seeded with mustChangePassword — complete the forced
    // change first, mirroring dashboard.test.tsx's loginMariaPastForcedChange helper.
    render(
      <Harness>
        <LoginButton login="maria" password="Senha123" />
        <LoginButton login="maria" password="NovaSenha123" />
        <GoVisit visitId="v3" label="go-visit-v3" />
      </Harness>,
    );
    fireEvent.click(screen.getAllByText('do-login-maria')[0]!);
    await waitForScreen('change-password');
    const { callApi } = await import('../../src/client/lib/gas');
    await callApi('auth.changePassword', { currentPassword: 'Senha123', newPassword: 'NovaSenha123' });
    fireEvent.click(screen.getAllByText('do-login-maria')[1]!);
    await waitForScreen('dashboard');

    fireEvent.click(screen.getByText('go-visit-v3'));
    // Guard redirects straight back — the Visit screen must never mount.
    await waitForScreen('dashboard');
    expect(document.querySelector('[data-screen="visit"]')).toBeNull();
    expect(document.querySelector('.visit-grid')).toBeNull();
  }, 10000);

  it('(9) fix 1 — participation state (rep chip, uploaded PDF) survives an immediate tab-away-and-back, before the visits.get reload could possibly land; the step tab reflects the save immediately too', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginJose();
    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForGrid();
    // Jurídico (d12) has no VisitDepartment row on v3 in the fixtures — exercises the
    // lazy bare-row creation (`ensureVisitDepartmentId`) via the PDF upload too.
    await goToDepartmentStep('d12', 'participation');

    // Attach a PDF first — creates the bare row, then uploads onto it.
    const file = new File(['%PDF-1.4 conteúdo fake'], 'relatorio.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('#pdf-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(t.visit.pdfAttached)).toBeTruthy(), { timeout: 3000 });

    // Add a regional rep — local chip-input state, no round trip yet.
    const repInput = screen.getByPlaceholderText(t.visit.addRepPlaceholder);
    fireEvent.change(repInput, { target: { value: 'Fulano da Silva' } });
    fireEvent.keyDown(repInput, { key: 'Enter' });
    expect(document.querySelector('.chip-input-tag')?.textContent).toContain('Fulano da Silva');

    fireEvent.click(screen.getByText(t.visit.goToReviewCta));
    await waitForStep('review');

    // Layer (a): DeptGrid/StepTabs must reflect the just-saved row immediately — this
    // read happens well before the background `visits.get` reload (kicked off
    // unawaited by the same save) could possibly have resolved.
    const participationTab = document.querySelector('[data-step="participation"]')!;
    expect(participationTab.classList.contains('visit-step-tab-done')).toBe(true);

    // Layer (b): tab straight back with no extra wait — old code re-seeded Participation
    // from the (still stale, pre-save) `vd` prop on remount and both the rep and the
    // PDF would vanish here.
    fireEvent.click(participationTab);
    await waitForStep('participation');
    expect(document.querySelector('.chip-input-tag')?.textContent).toContain('Fulano da Silva');
    expect(screen.getByText(t.visit.pdfAttached)).toBeTruthy();
  }, 15000); // PDF upload is two sequential round trips (lazy create + upload) before the race even starts

  it('(10) fix 2 — "Excluir registro do departamento" is admin-only in the DepartmentFlow header', async () => {
    render(<Harness><LoginButton login="jose" password="Senha123" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginJose();
    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForGrid();
    await goToDepartmentStep('d20', 'participation'); // Tesouraria — has a row (vd5), jose is regional
    expect(screen.queryByText(t.visit.deleteDeptCta)).toBeNull();
  });

  it('(11) fix 2 — admin deletes a department row: calls visitDepartments.delete, toasts, returns to the grid with the row gone', async () => {
    render(<Harness><LoginButton login="sava.admin" password="Sava1234" /><GoVisit visitId="v3" label="go-visit-v3" /></Harness>);
    await loginAdmin();
    fireEvent.click(screen.getByText('go-visit-v3'));
    await waitForGrid();
    // Tesouraria (d20/vd5) has no findings/reviews attached in the fixtures, so the
    // delete is a clean success (no CONFLICT) — see src/server/services/visits.ts's
    // deleteVisitDepartment.
    await goToDepartmentStep('d20', 'participation');
    expect(screen.getByText(t.visit.deleteDeptCta)).toBeTruthy();

    fireEvent.click(screen.getByText(t.visit.deleteDeptCta));
    const confirmDialog = await screen.findByRole('dialog', { name: t.visit.deleteDeptConfirmTitle });
    fireEvent.click(within(confirmDialog).getByText(t.visit.deleteDeptCta));

    await waitFor(() => expect(screen.getByText(t.visit.deleteDeptSuccessToast)).toBeTruthy());
    await waitForGrid();

    const deleteCall = spyState.calls.find(c => c.action === 'visitDepartments.delete');
    expect(deleteCall?.payload).toMatchObject({ id: 'vd5' });
    await waitFor(() => {
      const tesouraria = document.querySelector('[data-department-id="d20"]')!;
      expect(tesouraria.getAttribute('data-department-state')).toBe('notStarted');
    }, { timeout: 3000 });
  }, 10000);
});
