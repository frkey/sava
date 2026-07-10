/**
 * §8.6 E6 (mobile paste form) / DT5 (desktop preview) — Catálogo de itens. Paste →
 * `checklistItems.importPaste` in preview mode (no `apply`) → ImportPreview.tsx
 * renders the diff; confirming there re-calls with `apply:true` and the checked
 * absent ids.
 *
 * No individual "editar item" affordance (`checklistItems.save`) — the mockups
 * (E6/DT5) never show one, so per the task brief's YAGNI note it's skipped; the
 * paste-import flow is the only way to add/change catalog items in this screen.
 */
import { useState } from 'react';
import type { ImportPreview as ImportPreviewData } from '../../../shared/actions';
import { useApiCall, useApiMutation } from '../../hooks/useApi';
import { useToast } from '../../state/toasts';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { t } from '../../strings/pt';
import { ImportPreview } from './ImportPreview';

export function Catalog() {
  const departmentsResult = useApiCall('departments.list', undefined, []);
  const previewMutation = useApiMutation('checklistItems.importPaste');
  const applyMutation = useApiMutation('checklistItems.importPaste');
  const toast = useToast();

  const [departmentId, setDepartmentId] = useState('');
  const [tsv, setTsv] = useState('');
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);

  const departments = (departmentsResult.data ?? []).filter(d => d.active);
  const departmentName = departments.find(d => d.id === departmentId)?.name ?? '';

  // F3 state (task 9 pass): `departments.list` backs this screen's whole picker — same
  // "EmptyState + Repetir" fallback the other admin tabs use for their primary fetch.
  if (departmentsResult.error && departmentsResult.data === undefined) {
    return (
      <div className="admin-list-screen">
        <EmptyState
          title={t.admin.loadErrorTitle.departments}
          action={<Button variant="secondary" onClick={departmentsResult.reload}>{t.toasts.retry}</Button>}
        />
      </div>
    );
  }

  async function handlePreview() {
    if (!departmentId || !tsv.trim()) return;
    try {
      const result = await previewMutation.run({ departmentId, tsv });
      setPreview(result);
    } catch {
      return; // default (non-silent) error toast already shown
    }
  }

  async function handleConfirm(deactivateAbsent: string[]) {
    try {
      await applyMutation.run({ departmentId, tsv, apply: true, deactivateAbsent });
    } catch {
      return; // default (non-silent) error toast already shown
    }
    toast.show(t.admin.importApplySuccessToast, 'success');
    setPreview(null);
    setTsv('');
  }

  if (preview) {
    return (
      <ImportPreview
        preview={preview}
        departmentName={departmentName}
        saving={applyMutation.saving}
        onBack={() => setPreview(null)}
        onConfirm={ids => { void handleConfirm(ids); }}
      />
    );
  }

  return (
    <div className="admin-list-screen">
      <div className="admin-section-header">
        <span className="admin-section-title">{t.admin.sections.catalog}</span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="catalog-department">{t.findings.filterLabels.department}</label>
        <select
          id="catalog-department"
          className="select"
          value={departmentId}
          onChange={e => setDepartmentId(e.target.value)}
        >
          <option value="">{t.admin.catalogDepartmentPlaceholder}</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="catalog-tsv">{t.admin.pasteChecklistLabel}</label>
        <textarea
          id="catalog-tsv"
          className="textarea textarea-mono"
          placeholder={t.admin.pasteChecklistPlaceholder}
          value={tsv}
          onChange={e => setTsv(e.target.value)}
        />
        <div className="field-hint">{t.admin.importHelper}</div>
      </div>

      <Button
        disabled={!departmentId || !tsv.trim()}
        loading={previewMutation.saving}
        onClick={() => { void handlePreview(); }}
      >
        {t.admin.previewChangesCta}
      </Button>
    </div>
  );
}
