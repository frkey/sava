/**
 * D6 — new findings (step E) + conclude (step F), spec §8.5. Two forms in one screen
 * because they share the same "already registered this visit" list and the sticky
 * "Concluir departamento" footer.
 *
 * The catalog `<select>` (spec: "choosing fills itemRef/section/severity read-only")
 * uses a plain native select rather than D6's bespoke dropdown-card visual — consistent
 * with every other picker in this app (ReviewDialog.tsx's visit select, StatusDialog.tsx
 * etc. all use `.select`), documented simplification.
 *
 * The mockup's outline "+ Adicionar apontamento" button is reused for both roles: closed
 * state → opens the form; open state → submits it (same copy, no separate "Salvar"
 * string exists in DESIGN_REFERENCE §5's microcopy table for this action).
 *
 * `findings.save` runs `{silent: true}`: a duplicate-itemRef CONFLICT renders the D6
 * warning banner inline (spec §8.5) instead of a toast, with "Registrar mesmo assim"
 * resending the identical payload with `force: true`.
 */
import { useRef, useState } from 'react';
import type { Department, Finding, FindingResponse, Severity } from '../../../shared/types';
import { useApiCall, useApiMutation } from '../../hooks/useApi';
import { ApiError } from '../../lib/gas';
import { Button } from '../../components/Button';
import { t, responseLabel, severityLabel } from '../../strings/pt';

export interface NewFindingsProps {
  department: Department;
  findings: Finding[]; // already registered THIS visit+department
  ensureVisitDepartmentId(): Promise<string>;
  onFindingSaved(): void;
  onConcluded(): void;
  onGoToReview(): void;
}

const RESPONSES: FindingResponse[] = ['no', 'yes_with_caveats'];
const SEVERITIES: Severity[] = ['high', 'medium', 'low'];

/** Matches `findings.save`'s payload shape (`shared/actions.ts`). */
type FindingPayload = Partial<Finding> & { itemText: string };

export function NewFindings({
  department, findings, ensureVisitDepartmentId, onFindingSaved, onConcluded, onGoToReview,
}: NewFindingsProps) {
  const checklistResult = useApiCall('checklistItems.list', { departmentId: department.id }, [department.id]);
  const catalog = (checklistResult.data ?? []).filter(ci => ci.active);

  const [listExpanded, setListExpanded] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [catalogMode, setCatalogMode] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [manualItemRef, setManualItemRef] = useState('');
  const [manualSection, setManualSection] = useState('');
  const [manualItemText, setManualItemText] = useState('');
  const [manualSeverity, setManualSeverity] = useState<Severity>('medium');
  const [response, setResponse] = useState<FindingResponse>('no');
  const [considerations, setConsiderations] = useState('');
  const [deadline, setDeadline] = useState('');
  const [assignee, setAssignee] = useState('');
  const [duplicateMessage, setDuplicateMessage] = useState<string | undefined>(undefined);
  const [genericError, setGenericError] = useState<string | undefined>(undefined);
  // Task-7 review fix 3: the exact payload sent on the first (force:false) attempt that
  // produced the CONFLICT — "Registrar mesmo assim" resends THIS, not whatever the
  // (still-editable) form fields have drifted to by the time the user confirms.
  const frozenPayloadRef = useRef<FindingPayload | undefined>(undefined);

  const mutation = useApiMutation('findings.save');
  const markDoneMutation = useApiMutation('visitDepartments.markDone');

  const selectedItem = catalog.find(ci => ci.id === selectedItemId);
  const itemTextFinal = catalogMode ? (selectedItem?.text ?? '') : manualItemText.trim();
  const canSubmit = itemTextFinal !== '' && !mutation.saving;

  function resetForm() {
    setSelectedItemId('');
    setManualItemRef(''); setManualSection(''); setManualItemText(''); setManualSeverity('medium');
    setResponse('no'); setConsiderations(''); setDeadline(''); setAssignee('');
    setCatalogMode(true);
    setDuplicateMessage(undefined); setGenericError(undefined);
    setFormOpen(false);
    frozenPayloadRef.current = undefined;
  }

  async function submit(force: boolean) {
    setGenericError(undefined);

    // force:true resend ("Registrar mesmo assim") — fields stay editable while the
    // duplicate-warning banner is showing, but the resend must reproduce exactly what
    // the user confirmed the CONFLICT on, not any edits made in the meantime. Reuse the
    // snapshot frozen below by the original (force:false) attempt instead of rebuilding
    // the payload from current state.
    if (force) {
      const frozen = frozenPayloadRef.current;
      if (!frozen) return;
      try {
        await mutation.run({ finding: frozen, force: true }, { silent: true });
      } catch (err) {
        setDuplicateMessage(undefined);
        setGenericError(err instanceof ApiError ? err.message : String(err));
        return;
      }
      setDuplicateMessage(undefined);
      resetForm();
      onFindingSaved();
      return;
    }

    if (!itemTextFinal) return;
    setDuplicateMessage(undefined);
    try {
      const id = await ensureVisitDepartmentId();
      const finding: FindingPayload = {
        visitDepartmentId: id,
        itemRef: catalogMode ? selectedItem?.itemRef : (manualItemRef.trim() || undefined),
        section: catalogMode ? selectedItem?.section : (manualSection.trim() || undefined),
        itemText: itemTextFinal,
        severity: catalogMode ? (selectedItem?.severity ?? 'low') : manualSeverity,
        response,
        considerations: considerations.trim() || undefined,
        deadline: deadline || undefined,
        assignee: assignee.trim() || undefined,
      };
      // Freeze now, before the round trip — if this exact attempt CONFLICTs, this is
      // what "Registrar mesmo assim" must resend.
      frozenPayloadRef.current = finding;
      await mutation.run({ finding, force: false }, { silent: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') { setDuplicateMessage(err.message); return; }
      setGenericError(err instanceof ApiError ? err.message : String(err));
      return;
    }
    resetForm();
    onFindingSaved();
  }

  async function handleConclude() {
    try {
      // Inside the same catch as markDone (mirrors submit()): a failed lazy row
      // creation must surface its toast and stop here, never escape as an unhandled
      // rejection while the button silently resets.
      const id = await ensureVisitDepartmentId();
      await markDoneMutation.run({ id });
    } catch {
      return; // default (non-silent) error toast already shown
    }
    onConcluded();
  }

  return (
    <>
      <div className="visit-body">
        {findings.length > 0 ? (
          <div className="new-findings-banner">
            <span className="new-findings-banner-count">{findings.length}</span>
            <span className="new-findings-banner-text">{t.visit.newFindingsBanner(findings.length)}</span>
            <button type="button" className="new-findings-banner-link" onClick={() => setListExpanded(v => !v)}>
              {t.visit.viewLink}
            </button>
          </div>
        ) : null}

        {listExpanded && findings.length > 0 ? (
          <div className="new-findings-list">
            {findings.map(f => (
              <div key={f.id} className="new-finding-row" data-finding-id={f.id}>
                <div className="new-finding-row-text">
                  {f.itemRef ? <span className="finding-code-chip">{f.itemRef}</span> : null} {f.itemText}
                </div>
                <span className="response-tag">{responseLabel[f.response]}</span>
              </div>
            ))}
          </div>
        ) : null}

        {formOpen ? (
          <>
            {catalogMode ? (
              <div className="field">
                <label className="field-label" htmlFor="catalog-item">{t.visit.catalogItemLabel}</label>
                <select
                  id="catalog-item" className="select" value={selectedItemId}
                  onChange={e => setSelectedItemId(e.target.value)}
                >
                  <option value="">{t.visit.catalogSelectPlaceholder}</option>
                  {catalog.map(ci => <option key={ci.id} value={ci.id}>{ci.itemRef} — {ci.text}</option>)}
                </select>
                {selectedItem ? (
                  <div className="catalog-select-card-meta">
                    {t.visit.catalogAutofillHelper(selectedItem.section, severityLabel[selectedItem.severity])}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="new-finding-form-grid">
                  <div className="field">
                    <label className="field-label" htmlFor="manual-ref">{t.findings.editFields.itemRef}</label>
                    <input id="manual-ref" className="input" value={manualItemRef} onChange={e => setManualItemRef(e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="manual-section">{t.findings.editFields.section}</label>
                    <input id="manual-section" className="input" value={manualSection} onChange={e => setManualSection(e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="manual-text">{t.findings.editFields.itemText}</label>
                  <textarea id="manual-text" className="textarea" value={manualItemText} onChange={e => setManualItemText(e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="manual-severity">{t.findings.editFields.severity}</label>
                  <select
                    id="manual-severity" className="select" value={manualSeverity}
                    onChange={e => setManualSeverity(e.target.value as Severity)}
                  >
                    {SEVERITIES.map(s => <option key={s} value={s}>{severityLabel[s]}</option>)}
                  </select>
                </div>
              </>
            )}
            <button type="button" className="catalog-toggle-link" onClick={() => setCatalogMode(m => !m)}>
              {catalogMode ? t.visit.manualEntryLink : t.visit.useCatalogLink}
            </button>

            <div className="field">
              <div className="field-label">{t.visit.newFinding.responseType}</div>
              <div className="segment-row segment-row-2">
                {RESPONSES.map(r => (
                  <button
                    key={r}
                    type="button"
                    className={`segment-btn response-toggle-btn${response === r ? ' response-toggle-btn-selected' : ''}`}
                    onClick={() => setResponse(r)}
                  >
                    {responseLabel[r]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="new-finding-considerations">{t.visit.newFinding.considerations}</label>
              <textarea
                id="new-finding-considerations" className="textarea"
                value={considerations} onChange={e => setConsiderations(e.target.value)}
              />
            </div>

            <div className="new-finding-form-grid">
              <div className="field">
                <label className="field-label" htmlFor="new-finding-deadline">{t.visit.newFinding.deadline}</label>
                <input
                  id="new-finding-deadline" type="date" className="input"
                  value={deadline} onChange={e => setDeadline(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="new-finding-assignee">{t.visit.newFinding.assignee}</label>
                <input
                  id="new-finding-assignee" className="input" placeholder={t.visit.newFinding.assigneePlaceholder}
                  value={assignee} onChange={e => setAssignee(e.target.value)}
                />
              </div>
            </div>

            {duplicateMessage ? (
              <div className="banner banner-warning">
                <span className="banner-icon" aria-hidden="true">!</span>
                <div>
                  <div className="banner-title">{t.visit.duplicateWarning.title}</div>
                  <div className="banner-text">{t.visit.duplicateWarning.body}</div>
                  <div className="duplicate-warning-actions">
                    <button type="button" className="duplicate-warning-link" onClick={onGoToReview}>
                      {t.visit.duplicateWarning.goToReview}
                    </button>
                    <button type="button" className="duplicate-warning-link-secondary" onClick={() => { void submit(true); }}>
                      {t.visit.duplicateWarning.registerAnyway}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {genericError ? (
              <div className="banner banner-error" role="alert">
                <span className="banner-icon" aria-hidden="true">!</span>
                <span className="banner-text">{genericError}</span>
              </div>
            ) : null}
          </>
        ) : null}

        <Button
          variant="secondary"
          className="add-finding-btn"
          onClick={() => { if (formOpen) void submit(false); else setFormOpen(true); }}
          disabled={formOpen && !canSubmit}
          loading={formOpen && mutation.saving}
        >
          {t.visit.addFindingCta}
        </Button>
      </div>
      <div className="visit-footer">
        <Button
          className="conclude-btn"
          onClick={() => { void handleConclude(); }}
          loading={markDoneMutation.saving}
        >
          {t.visit.concludeCta}
        </Button>
        <div className="visit-footer-helper">{t.visit.concludeHelper}</div>
      </div>
    </>
  );
}
