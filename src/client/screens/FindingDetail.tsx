/**
 * DESIGN_REFERENCE §8.4 C3 (mobile) / DT3 (desktop, simplified — see PdfViewer.tsx's
 * header) "Detalhe do apontamento". Data: `findings.get {id}` (the finding `id` comes
 * from the nav `Screen` — `App.tsx`'s `ScreenContent` passes `screen.id`).
 *
 * Back affordance: Chrome.tsx's mobile app bar is a fixed brand/avatar bar shared by
 * every screen (no back-button variant), and the desktop topbar only shows a static
 * title — neither offers per-screen sub-navigation today. Rather than widen that
 * shared chrome for this one screen, FindingDetail renders its own in-content
 * "‹ Apontamentos" back link (reusing `.subpage-back`, the same chevron style
 * ChangePassword.tsx already uses for its own sub-page app bar) at both breakpoints.
 * Documented simplification, see `.superpowers/sdd/task-6-report.md`.
 *
 * Actions (Editar / Mudar status / Registrar revisão) are hidden entirely for `local`
 * — spec §4 (read-only) / MOCKUP_DIVERGENCES.md A-9. The PDF button is NOT one of
 * these actions (`visitDepartments.downloadPdf`'s minRole is `local` per
 * src/shared/actions.ts's role table) and always renders.
 *
 * StatusDialog/ReviewDialog/PdfViewer/the inline EditFindingDialog below are all
 * mounted on demand (only while their own `*Open` flag is true) — the same pattern
 * Chrome.tsx uses for UserMenu — so PdfViewer's object-URL lifecycle doesn't need
 * extra guards.
 *
 * `FindingDetail` only fetches `findings.get`/`cities.list`/`departments.list` and
 * renders the skeleton/error/loaded states; `FindingDetailBody` (mounted only once the
 * finding has loaded) owns `visits.list {cityId: finding.cityId}` and everything else.
 * This split isn't just organization: `useApiCall` never clears its `data` when `deps`
 * changes, only overwrites it once the new fetch resolves (src/client/hooks/useApi.ts),
 * so firing `visits.list` from the top with `cityId` starting `undefined` (before
 * `findings.get` resolves) would — for regional/admin, whose `cityId: undefined` mock
 * response is "every city's visits", src/client/lib/mock/server.ts's `visitsList` —
 * race two fetches: if the unscoped one wins, `visitsResult.data` briefly holds
 * cross-city visits while the scoped refetch is still in flight, and ReviewDialog's
 * default-visit selection has no way to tell it picked from the wrong list. Mounting
 * `FindingDetailBody` only after `finding.cityId` is known means `visits.list` is never
 * called with an unscoped payload at all — no race, and no wasted full-table read.
 */
import { useEffect, useRef, useState } from 'react';
import type { City, Department, Finding, FindingFilters, FindingReview, FindingResponse, Severity } from '../../shared/types';
import { useSession } from '../state/session';
import { useNav } from '../state/nav';
import { useToast } from '../state/toasts';
import { useApiCall, useApiMutation } from '../hooks/useApi';
import { StatusBadge } from '../components/StatusBadge';
import { SeverityBadge } from '../components/SeverityBadge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Timeline } from '../components/Timeline';
import { StatusDialog } from '../components/StatusDialog';
import { ReviewDialog } from '../components/ReviewDialog';
import { PdfViewer } from '../components/PdfViewer';
import { t, statusLabel, severityLabel, responseLabel } from '../strings/pt';
import { isOverdueClient, findingDeadlineDisplay } from '../lib/format';

export interface FindingDetailProps {
  id: string;
  /** Filters active on Findings when the user navigated here (App.tsx passes
   *  `screen.from`) — carried back on the back affordances below so returning to the
   *  list doesn't silently drop them (final review wave, item 3). */
  from?: FindingFilters;
}

const DESKTOP_BREAKPOINT = 900;
const SEVERITIES: Severity[] = ['high', 'medium', 'low'];
const RESPONSES: FindingResponse[] = ['no', 'yes_with_caveats'];

/** base64 (from `visitDepartments.downloadPdf`) → raw bytes, for `new Blob([...])`. */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function FindingDetailSkeleton() {
  return (
    <div className="finding-detail-screen">
      <Skeleton variant="line" width="40%" height={16} />
      <Skeleton variant="line" width="60%" height={24} />
      <Skeleton variant="card" height={180} />
      <Skeleton variant="card" height={120} />
    </div>
  );
}

/**
 * A-2 in MOCKUP_DIVERGENCES.md recommends reusing the (not-yet-built) new-finding form
 * from the visit flow, pre-filled — Task 7/Visit.tsx doesn't exist yet, so this is the
 * minimal, self-contained, descriptive-fields-only form the task brief specifies
 * instead. `status`/`code` are never part of the payload (server ignores/forces them
 * on update anyway, spec §7).
 */
function EditFindingDialog(
  { finding, onClose, onSaved }: { finding: Finding; onClose(): void; onSaved(): void },
) {
  const [itemRef, setItemRef] = useState(finding.itemRef ?? '');
  const [section, setSection] = useState(finding.section ?? '');
  const [itemText, setItemText] = useState(finding.itemText);
  const [severity, setSeverity] = useState<Severity>(finding.severity);
  const [response, setResponse] = useState<FindingResponse>(finding.response);
  const [considerations, setConsiderations] = useState(finding.considerations ?? '');
  const [deadline, setDeadline] = useState(finding.deadline ?? '');
  const [assignee, setAssignee] = useState(finding.assignee ?? '');
  const mutation = useApiMutation('findings.save');
  const toast = useToast();

  const canSave = itemText.trim() !== '' && !mutation.saving;

  async function handleSave() {
    try {
      await mutation.run({
        finding: {
          id: finding.id,
          itemRef: itemRef.trim() || undefined,
          section: section.trim() || undefined,
          itemText: itemText.trim(),
          severity,
          response,
          considerations: considerations.trim() || undefined,
          deadline: deadline.trim() || undefined,
          assignee: assignee.trim() || undefined,
        },
      });
    } catch {
      return; // error toast already shown (non-silent)
    }
    toast.show(t.findings.editSaveSuccess, 'success');
    onSaved();
    onClose();
  }

  return (
    <Dialog
      open
      title={t.findings.editTitle}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t.common.back}</Button>
          <Button type="button" onClick={() => { void handleSave(); }} disabled={!canSave} loading={mutation.saving}>
            {t.findings.editSaveCta}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="edit-itemRef">{t.findings.editFields.itemRef}</label>
        <input id="edit-itemRef" className="input" value={itemRef} onChange={e => setItemRef(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="edit-section">{t.findings.editFields.section}</label>
        <input id="edit-section" className="input" value={section} onChange={e => setSection(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="edit-itemText">{t.findings.editFields.itemText}</label>
        <textarea id="edit-itemText" className="textarea" value={itemText} onChange={e => setItemText(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="edit-severity">{t.findings.editFields.severity}</label>
        <select
          id="edit-severity"
          className="select"
          value={severity}
          onChange={e => setSeverity(e.target.value as Severity)}
        >
          {SEVERITIES.map(s => <option key={s} value={s}>{severityLabel[s]}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="edit-response">{t.visit.newFinding.responseType}</label>
        <select
          id="edit-response"
          className="select"
          value={response}
          onChange={e => setResponse(e.target.value as FindingResponse)}
        >
          {RESPONSES.map(r => <option key={r} value={r}>{responseLabel[r]}</option>)}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="edit-considerations">{t.visit.newFinding.considerations}</label>
        <textarea
          id="edit-considerations"
          className="textarea"
          value={considerations}
          onChange={e => setConsiderations(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="edit-deadline">{t.visit.newFinding.deadline}</label>
        <input
          id="edit-deadline"
          type="date"
          className="input"
          value={deadline}
          onChange={e => setDeadline(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="edit-assignee">{t.visit.newFinding.assignee}</label>
        <input
          id="edit-assignee"
          className="input"
          placeholder={t.visit.newFinding.assigneePlaceholder}
          value={assignee}
          onChange={e => setAssignee(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

export function FindingDetail({ id, from }: FindingDetailProps) {
  const { go } = useNav();
  const goBack = () => go({ name: 'findings', filters: from });

  const findingResult = useApiCall('findings.get', { id }, [id]);
  const citiesResult = useApiCall('cities.list', undefined, []);
  const departmentsResult = useApiCall('departments.list', undefined, []);

  if (findingResult.error && !findingResult.data) {
    return (
      <div className="finding-detail-screen">
        <BackLink onClick={goBack} />
        <EmptyState
          title={findingResult.error.message}
          action={<Button variant="secondary" onClick={findingResult.reload}>{t.toasts.retry}</Button>}
        />
      </div>
    );
  }
  if (!findingResult.data) return <FindingDetailSkeleton />;

  return (
    <FindingDetailBody
      finding={findingResult.data.finding}
      reviews={findingResult.data.reviews}
      cities={citiesResult.data ?? []}
      departments={departmentsResult.data ?? []}
      onReload={findingResult.reload}
      onBack={goBack}
    />
  );
}

interface FindingDetailBodyProps {
  finding: Finding;
  reviews: FindingReview[];
  cities: City[];
  departments: Department[];
  onReload(): void;
  onBack(): void;
}

function FindingDetailBody({ finding, reviews, cities, departments, onReload, onBack }: FindingDetailBodyProps) {
  const session = useSession();
  const user = session.user!;
  const isLocal = user.role === 'local';

  // Always called with the finding's real cityId — see the file header for why this
  // must NOT fire from the parent with an unresolved (undefined) cityId.
  const visitsResult = useApiCall('visits.list', { cityId: finding.cityId }, [finding.cityId]);
  const downloadPdf = useApiMutation('visitDepartments.downloadPdf');

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [pdfViewer, setPdfViewer] = useState<{ objectUrl: string; fileName: string } | null>(null);

  // Guards handleViewPdf's async continuation below: if the user navigates away (or
  // this finding's id changes, remounting via App.tsx's `key={screen.id}`) while
  // `downloadPdf.run` is still in flight, the fetch still completes and still creates
  // an object URL — without this check `setPdfViewer` would be a no-op on the
  // unmounted instance, PdfViewer would never mount, and its revoke-on-unmount effect
  // would never run, leaking the blob for the rest of the session.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const cityName = cities.find(c => c.id === finding.cityId)?.name ?? finding.cityId;
  const departmentName = departments.find(d => d.id === finding.departmentId)?.name ?? finding.departmentId;
  const visits = visitsResult.data ?? [];
  const visitsLoading = visitsResult.loading && !visitsResult.data;

  const overdue = isOverdueClient(finding);
  const deadline = findingDeadlineDisplay(finding);

  async function handleViewPdf() {
    try {
      const { fileName, base64 } = await downloadPdf.run({ visitDepartmentId: finding.visitDepartmentId });
      if (!mountedRef.current) return;
      // Cast: TS's DOM lib types BlobPart as ArrayBufferView<ArrayBuffer>, but
      // Uint8Array's own generic is ArrayBufferLike (may include SharedArrayBuffer) —
      // this Uint8Array is always backed by a plain ArrayBuffer we just allocated.
      const blob = new Blob([base64ToUint8Array(base64) as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (window.innerWidth >= DESKTOP_BREAKPOINT) {
        setPdfViewer({ objectUrl: url, fileName });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch {
      // error toast already shown (downloadPdf.run isn't silent) — covers NOT_FOUND
      // ("Nenhum PDF anexado…") with the server's own message.
    }
  }

  return (
    <div className="finding-detail-screen">
      <BackLink onClick={onBack} />

      <div className="finding-detail-header">
        <div className="finding-detail-badges">
          <StatusBadge status={finding.status} className="status-badge-detail" />
          {overdue ? <span className="overdue-pill">{deadline.text}</span> : null}
          <SeverityBadge severity={finding.severity} />
        </div>

        <div className="finding-detail-title">
          {finding.itemRef ? <span className="finding-code-chip">{finding.itemRef}</span> : null}
          {finding.itemText}
        </div>
        <div className="finding-detail-meta">
          {t.findings.sectionResponseMeta(finding.section ?? t.labels.deadline.dash, responseLabel[finding.response])}
          <span className="finding-detail-code"> · #{finding.code}</span>
        </div>
      </div>

      <div className="card finding-detail-card">
        <div className="finding-detail-grid">
          <div>
            <div className="finding-detail-field-label">{t.findings.detailFields.city}</div>
            <div className="finding-detail-field-value">{cityName}</div>
          </div>
          <div>
            <div className="finding-detail-field-label">{t.findings.detailFields.department}</div>
            <div className="finding-detail-field-value">{departmentName}</div>
          </div>
          <div>
            <div className="finding-detail-field-label">{t.findings.detailFields.origin}</div>
            <div className="finding-detail-field-value">{finding.period}</div>
          </div>
          <div>
            <div className="finding-detail-field-label">{t.findings.detailFields.deadline}</div>
            <div className={`finding-detail-field-value${overdue ? ' finding-detail-field-value-overdue' : ''}`}>
              {deadline.text}
            </div>
          </div>
          <div className="finding-detail-field-full">
            <div className="finding-detail-field-label">{t.findings.detailFields.assignee}</div>
            <div className="finding-detail-field-value">{finding.assignee || t.labels.deadline.dash}</div>
          </div>
          {finding.considerations ? (
            <div className="finding-detail-field-full">
              <div className="finding-detail-field-label">{t.findings.detailFields.considerations}</div>
              <div className="finding-detail-field-value finding-detail-field-value-considerations">
                {finding.considerations}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="finding-detail-pdf">
        <Button
          variant="secondary"
          className="finding-detail-pdf-btn"
          onClick={() => { void handleViewPdf(); }}
          loading={downloadPdf.saving}
          loadingLabel={t.findings.loadingPdf}
        >
          {t.findings.viewPdf}
        </Button>
        <div className="finding-detail-pdf-helper">
          <span className="pdf-helper-mobile">{t.findings.viewPdfHelperMobile}</span>
          <span className="pdf-helper-desktop">{t.findings.viewPdfHelper}</span>
        </div>
      </div>

      {!isLocal ? (
        <div className="finding-actions">
          <Button variant="secondary" onClick={() => setEditOpen(true)}>{t.findings.actions.edit}</Button>
          <Button variant="secondary" onClick={() => setStatusOpen(true)}>{t.findings.actions.changeStatus}</Button>
          <Button className="finding-actions-primary" onClick={() => setReviewOpen(true)}>
            {t.findings.actions.registerReview}
          </Button>
        </div>
      ) : null}

      <div className="finding-detail-timeline">
        <div className="finding-detail-timeline-heading">{t.findings.timelineTitle}</div>
        <Timeline finding={finding} reviews={reviews} visits={visits} />
      </div>

      {editOpen ? (
        <EditFindingDialog
          finding={finding}
          onClose={() => setEditOpen(false)}
          onSaved={onReload}
        />
      ) : null}
      {statusOpen ? (
        <StatusDialog
          finding={finding}
          onClose={() => setStatusOpen(false)}
          onChanged={onReload}
        />
      ) : null}
      {reviewOpen ? (
        <ReviewDialog
          finding={finding}
          visits={visits}
          visitsLoading={visitsLoading}
          onClose={() => setReviewOpen(false)}
          onSaved={onReload}
        />
      ) : null}
      {pdfViewer ? (
        <PdfViewer
          title={t.findings.pdfDialogTitle(departmentName)}
          fileName={pdfViewer.fileName}
          objectUrl={pdfViewer.objectUrl}
          onClose={() => setPdfViewer(null)}
        />
      ) : null}
    </div>
  );
}

function BackLink({ onClick }: { onClick(): void }) {
  return (
    <button type="button" className="finding-detail-backlink" onClick={onClick}>
      <span className="subpage-back" aria-hidden="true">‹</span>
      {t.nav.mobile.apontamentos}
    </button>
  );
}
