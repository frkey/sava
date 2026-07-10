/**
 * §8.6 DT5 (desktop preview) / E6 note "pré-visualização completa no desktop" —
 * renders the diff table for a `checklistItems.importPaste` preview (no `apply`)
 * plus an "ausentes" section with per-row deactivation checkboxes, default
 * UNCHECKED (spec §8.6 — a partial paste never silently deactivates the rest of the
 * catalog). "Aplicar" re-runs the import with `apply:true` and only the checked ids.
 *
 * `ImportPreviewRow` (shared/actions.ts) carries only the *new* parsed values, not
 * the previous item's fields, so a "changed" row can't reproduce DT5's specific
 * "— criticidade: Média → Alta" sub-note without a second, redundant diff against
 * the department's current catalog — skipped; the "alterado" badge alone still
 * flags it.
 */
import { useState } from 'react';
import type { ImportPreview as ImportPreviewData, ImportPreviewRow } from '../../../shared/actions';
import { Button } from '../../components/Button';
import { t, severityLabel } from '../../strings/pt';

export interface ImportPreviewProps {
  preview: ImportPreviewData;
  departmentName: string;
  saving: boolean;
  onBack(): void;
  onConfirm(deactivateAbsent: string[]): void;
}

const KIND_CLASS: Record<ImportPreviewRow['kind'], string> = {
  new: 'import-chip-new',
  changed: 'import-chip-changed',
  unchanged: 'import-chip-unchanged',
  invalid: 'import-chip-absent',
};

function kindLabel(kind: ImportPreviewRow['kind']): string {
  return t.admin.importDiff[kind];
}

function severityDisplay(s: string): string {
  return (severityLabel as Record<string, string>)[s] ?? s;
}

export function ImportPreview({ preview, departmentName, saving, onBack, onConfirm }: ImportPreviewProps) {
  const [checkedAbsent, setCheckedAbsent] = useState<Set<string>>(new Set());

  const counts = {
    new: preview.rows.filter(r => r.kind === 'new').length,
    changed: preview.rows.filter(r => r.kind === 'changed').length,
    unchanged: preview.rows.filter(r => r.kind === 'unchanged').length,
  };

  function toggleAbsent(id: string) {
    setCheckedAbsent(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="admin-list-screen">
      <div className="admin-section-header">
        <span className="admin-section-title">{t.admin.importPreviewTitle(departmentName)}</span>
      </div>

      <div className="import-summary-chips">
        <span className="import-chip import-chip-new">{t.admin.importSummary.new(counts.new)}</span>
        <span className="import-chip import-chip-changed">{t.admin.importSummary.changed(counts.changed)}</span>
        <span className="import-chip import-chip-unchanged">{t.admin.importSummary.unchanged(counts.unchanged)}</span>
        {preview.absent.length > 0 ? (
          <span className="import-chip import-chip-absent">{t.admin.importSummary.absent(preview.absent.length)}</span>
        ) : null}
      </div>

      <div className="import-table-wrap">
        <div className="import-table-header">
          <span>{t.admin.importTableHeaders.ref}</span>
          <span>{t.admin.importTableHeaders.section}</span>
          <span>{t.admin.importTableHeaders.text}</span>
          <span>{t.admin.importTableHeaders.severity}</span>
          <span style={{ textAlign: 'right' }}>{t.admin.importTableHeaders.classification}</span>
        </div>
        {preview.rows.map((row, i) => (
          <div key={`row-${i}-${row.itemRef}`} className={`import-table-row import-table-row-${row.kind}`} data-kind={row.kind}>
            <span className="import-table-ref">{row.itemRef || '—'}</span>
            <span>{row.section}</span>
            <span>{row.text}</span>
            <span>{row.kind === 'invalid' ? '—' : severityDisplay(row.severity)}</span>
            <span style={{ textAlign: 'right' }}>
              <span className={`import-chip ${KIND_CLASS[row.kind]}`}>{kindLabel(row.kind)}</span>
            </span>
          </div>
        ))}
        {preview.absent.map(item => (
          <div key={item.id} className="import-table-row import-table-row-absent" data-absent-id={item.id}>
            <span className="import-table-ref">{item.itemRef}</span>
            <span>{item.section}</span>
            <span>
              {item.text}
              <span className="import-table-note import-table-note-absent"> {t.admin.notInPastedText}</span>
            </span>
            <span>{severityLabel[item.severity]}</span>
            <span className="import-table-classification">
              <input
                type="checkbox"
                className="import-absent-checkbox"
                checked={checkedAbsent.has(item.id)}
                onChange={() => toggleAbsent(item.id)}
                aria-label={`${t.admin.importDiff.proposedDeactivate} ${item.itemRef}`}
              />
              <span className="import-chip import-chip-absent">{t.admin.importDiff.proposedDeactivate}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="import-footer">
        <span className="import-footer-hint">{t.admin.absentItemsHelper}</span>
        <div className="import-footer-actions">
          <Button type="button" variant="secondary" onClick={onBack}>{t.admin.backToEditText}</Button>
          <Button type="button" loading={saving} onClick={() => onConfirm([...checkedAbsent])}>
            {t.admin.applyImport(counts.new, counts.changed, checkedAbsent.size)}
          </Button>
        </div>
      </div>
    </div>
  );
}
