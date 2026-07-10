/**
 * DESIGN_REFERENCE §8.3 C2 filter sheet — mobile bottom sheet / desktop popover-panel,
 * same markup both breakpoints (CSS-switched via `.filter-sheet-panel`'s media query,
 * same pattern as SideBar/NavBar elsewhere in this codebase).
 *
 * Draft state is local and only committed to the parent on "Aplicar filtros" — no live
 * result count on that button (divergence B-7: an RPC per filter tweak would fight the
 * ~1s-latency budget in spec §3; MOCKUP_DIVERGENCES.md). Closing without applying
 * (scrim click, "Fechar", Escape) discards the draft.
 *
 * Text search (`filters.text`) is NOT one of this sheet's fields — Findings.tsx owns
 * the debounced search box separately, per the task brief.
 *
 * Status/criticidade render as mutually-exclusive single-select chips: the mockup shows
 * chips that visually suggest multi-select (e.g. "Abertos + Em tratamento" as one
 * combined chip in DT2), but `FindingFilters.status`/`.severity` are single-valued in
 * the pinned API contract (shared/types.ts) — this sheet follows the real contract.
 */
import { useEffect, useState } from 'react';
import type {
  City, Department, FindingFilters, FindingStatus, FindingResponse, Severity,
} from '../../shared/types';
import { t, statusLabel, severityLabel, responseLabel } from '../strings/pt';
import { Button } from './Button';

export interface FilterSheetProps {
  open: boolean;
  filters: FindingFilters;
  cities: City[];
  departments: Department[];
  /** Local role: cidade select is shown but locked to this id. */
  lockedCityId?: string;
  onApply(filters: FindingFilters): void;
  onClose(): void;
}

interface Draft {
  cityId?: string; departmentId?: string; status?: FindingStatus; period: string;
  severity?: Severity; response?: FindingResponse; overdue: boolean;
}

function draftFrom(filters: FindingFilters, lockedCityId?: string): Draft {
  return {
    cityId: lockedCityId ?? filters.cityId,
    departmentId: filters.departmentId,
    status: filters.status,
    period: filters.period ?? '',
    severity: filters.severity,
    response: filters.response,
    overdue: filters.overdue ?? false,
  };
}

const STATUSES: FindingStatus[] = ['open', 'in_treatment', 'resolved', 'cancelled'];
const SEVERITIES: Severity[] = ['high', 'medium', 'low'];
const RESPONSES: FindingResponse[] = ['no', 'yes_with_caveats'];
const PERIOD_RE = /^\d{2}\/\d{4}$/;

export function FilterSheet({ open, filters, cities, departments, lockedCityId, onApply, onClose }: FilterSheetProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(filters, lockedCityId));

  // Re-seed the draft from the last *committed* filters every time the sheet opens —
  // this is also what makes "close without applying" discard any in-progress edits.
  useEffect(() => {
    if (open) setDraft(draftFrom(filters, lockedCityId));
  }, [open, filters, lockedCityId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleClearAll() {
    setDraft({ cityId: lockedCityId, departmentId: undefined, status: undefined, period: '', severity: undefined, response: undefined, overdue: false });
  }

  function handleApply() {
    onApply({
      cityId: draft.cityId || undefined,
      departmentId: draft.departmentId || undefined,
      status: draft.status,
      period: PERIOD_RE.test(draft.period) ? draft.period : undefined,
      severity: draft.severity,
      response: draft.response,
      overdue: draft.overdue || undefined,
    });
  }

  return (
    <>
      <div className="filter-sheet-scrim" onClick={onClose} />
      <div className="filter-sheet-panel" role="dialog" aria-modal="true" aria-label={t.findings.filtersTitle} data-testid="filter-sheet">
        <div className="filter-sheet-grabber" aria-hidden="true" />
        <div className="filter-sheet-header">
          <span className="filter-sheet-title">{t.findings.filtersTitle}</span>
          <button type="button" className="filter-sheet-clear-all" onClick={handleClearAll}>
            {t.findings.clearAll}
          </button>
        </div>

        <div className="filter-sheet-body">
          <div className="filter-sheet-row">
            <div className="field filter-sheet-field">
              <label className="field-label" htmlFor="filter-city">{t.findings.filterLabels.city}</label>
              <select
                id="filter-city"
                className="select"
                value={draft.cityId ?? ''}
                disabled={!!lockedCityId}
                onChange={e => setDraft(d => ({ ...d, cityId: e.target.value || undefined }))}
              >
                <option value="">{t.findings.filterLabels.all}</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field filter-sheet-field">
              <label className="field-label" htmlFor="filter-department">{t.findings.filterLabels.department}</label>
              <select
                id="filter-department"
                className="select"
                value={draft.departmentId ?? ''}
                onChange={e => setDraft(d => ({ ...d, departmentId: e.target.value || undefined }))}
              >
                <option value="">{t.findings.filterLabels.all}</option>
                {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <div className="field-label">{t.findings.filterLabels.status}</div>
            <div className="filter-chip-row">
              {STATUSES.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`filter-option-chip${draft.status === s ? ' is-selected' : ''}`}
                  onClick={() => setDraft(d => ({ ...d, status: d.status === s ? undefined : s }))}
                >
                  {draft.status === s ? `✓ ${statusLabel[s]}` : statusLabel[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-sheet-row">
            <div className="field filter-sheet-field">
              <label className="field-label" htmlFor="filter-period">{t.findings.filterLabels.period}</label>
              <input
                id="filter-period"
                className="input filter-period-input"
                placeholder="MM/AAAA"
                value={draft.period}
                onChange={e => setDraft(d => ({ ...d, period: e.target.value }))}
              />
            </div>
            <div className="field filter-sheet-field">
              <label className="field-label" htmlFor="filter-response">{t.findings.filterLabels.responseType}</label>
              <select
                id="filter-response"
                className="select"
                value={draft.response ?? ''}
                onChange={e => setDraft(d => ({ ...d, response: (e.target.value || undefined) as FindingResponse | undefined }))}
              >
                <option value="">{t.findings.filterLabels.all}</option>
                {RESPONSES.map(r => <option key={r} value={r}>{responseLabel[r]}</option>)}
              </select>
            </div>
          </div>
          <div className="field-hint">{t.common.periodFormatHelper}</div>

          <div className="field">
            <div className="field-label">{t.findings.filterLabels.severity}</div>
            <div className="filter-chip-row">
              {SEVERITIES.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`filter-severity-chip filter-severity-chip-${s}${draft.severity === s ? ' is-selected' : ''}`}
                  onClick={() => setDraft(d => ({ ...d, severity: d.severity === s ? undefined : s }))}
                >
                  {severityLabel[s]}
                </button>
              ))}
            </div>
          </div>

          <label className="toggle-row">
            <span className="toggle-track">
              <input
                type="checkbox"
                className="toggle-input"
                checked={draft.overdue}
                onChange={e => setDraft(d => ({ ...d, overdue: e.target.checked }))}
              />
              <span className="toggle-track-bg" aria-hidden="true" />
              <span className="toggle-thumb" aria-hidden="true" />
            </span>
            <span>{t.findings.overdueOnly}</span>
          </label>

          <div className="filter-sheet-footer">
            <Button variant="secondary" onClick={onClose}>{t.findings.close}</Button>
            <Button onClick={handleApply}>{t.findings.applyFilters()}</Button>
          </div>
        </div>
      </div>
    </>
  );
}
