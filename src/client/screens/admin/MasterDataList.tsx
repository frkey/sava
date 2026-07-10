/**
 * Shared list+dialog+toggle behavior for Cities.tsx/Departments.tsx —
 * DESIGN_REFERENCE §8.6 E5. DT4's "Cidades"/"Departamentos" tabs have no distinct
 * desktop mockup frame, so this renders the same responsive card list at any width
 * (divergence A-1, MOCKUP_DIVERGENCES.md: Departments explicitly clones the Cities
 * pattern one-for-one — list + ativo toggle + deactivate-with-pendências warning).
 *
 * Deactivating a city/department with open findings doesn't save immediately:
 * toggling off shows an inline warning card (E5) with "Manter ativa"/"Desativar
 * assim mesmo" instead of a separate confirm dialog. Toggling on, or off with zero
 * open findings, saves right away.
 */
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { t } from '../../strings/pt';

interface Entity { id: string; name: string; active: boolean }

export interface MasterDataListProps {
  sectionTitle: string;
  addLabel: string;
  dialogTitleNew: string;
  dialogTitleEdit: string;
  nameFieldLabel: string;
  activeFieldLabel: string;
  entities: Entity[];
  loading: boolean;
  openCountById: Map<string, number>;
  deactivateWarning(n: number): string;
  saving: boolean;
  onSave(input: { id?: string; name: string; active: boolean }): Promise<void>;
  /** F3 state (task 9 pass): the primary `*.list` fetch failed and nothing had loaded
   *  yet — same "EmptyState + Repetir" fallback Dashboard.tsx/Findings.tsx use for
   *  their own primary fetch, not shown once *any* entity has successfully loaded. */
  errorTitle?: string;
  onRetry?(): void;
}

export function MasterDataList({
  sectionTitle, addLabel, dialogTitleNew, dialogTitleEdit, nameFieldLabel, activeFieldLabel,
  entities, loading, openCountById, deactivateWarning, saving, onSave, errorTitle, onRetry,
}: MasterDataListProps) {
  const [dialogTarget, setDialogTarget] = useState<'create' | Entity | null>(null);
  const [pendingDeactivateId, setPendingDeactivateId] = useState<string | null>(null);

  if (errorTitle && entities.length === 0) {
    return (
      <div className="admin-list-screen">
        <EmptyState
          title={errorTitle}
          action={<Button variant="secondary" onClick={onRetry}>{t.toasts.retry}</Button>}
        />
      </div>
    );
  }

  async function handleToggle(entity: Entity) {
    const openCount = openCountById.get(entity.id) ?? 0;
    if (entity.active && openCount > 0) {
      setPendingDeactivateId(entity.id);
      return;
    }
    try {
      await onSave({ id: entity.id, name: entity.name, active: !entity.active });
    } catch {
      // toast already shown by useApiMutation
    }
  }

  async function handleConfirmDeactivate(entity: Entity) {
    try {
      await onSave({ id: entity.id, name: entity.name, active: false });
      setPendingDeactivateId(null);
    } catch {
      // toast already shown by useApiMutation; warning stays open on failure
    }
  }

  return (
    <div className="admin-list-screen">
      <div className="admin-section-header">
        <span className="admin-section-title">{sectionTitle}</span>
        <Button onClick={() => setDialogTarget('create')}>{addLabel}</Button>
      </div>

      {loading && entities.length === 0 ? (
        <div className="admin-list">
          {[0, 1, 2].map(i => <Skeleton key={i} variant="card" height={70} />)}
        </div>
      ) : (
        <div className="admin-list">
          {entities.map(entity => {
            const openCount = openCountById.get(entity.id) ?? 0;
            const isPending = pendingDeactivateId === entity.id;
            return (
              <div
                key={entity.id}
                className={`admin-card${entity.active ? '' : ' admin-card-inactive'}`}
                data-entity-id={entity.id}
              >
                <div className="master-card-head">
                  <button type="button" className="admin-card-row" onClick={() => setDialogTarget(entity)}>
                    <span className="admin-card-body">
                      <span className="admin-card-name">{entity.name}</span>
                      <span className="admin-card-meta">
                        {entity.active
                          ? (openCount > 0 ? t.admin.openFindingsCount(openCount) : t.admin.noOpenFindings)
                          : t.admin.deactivatedPlain}
                      </span>
                    </span>
                  </button>
                  <label className="toggle-track toggle-track-positive" aria-label={activeFieldLabel}>
                    <input
                      type="checkbox"
                      className="toggle-input"
                      checked={entity.active}
                      onChange={() => { void handleToggle(entity); }}
                    />
                    <span className="toggle-track-bg" aria-hidden="true" />
                    <span className="toggle-thumb" aria-hidden="true" />
                  </label>
                </div>
                {isPending ? (
                  <div className="banner banner-warning master-card-warning">
                    <span className="banner-icon" aria-hidden="true">!</span>
                    <div>
                      <span className="banner-text">{deactivateWarning(openCount)}</span>
                      <div className="master-card-warning-actions">
                        <button
                          type="button"
                          className="master-card-warning-keep"
                          onClick={() => setPendingDeactivateId(null)}
                        >
                          {t.admin.keepActive}
                        </button>
                        <button
                          type="button"
                          className="master-card-warning-deactivate"
                          onClick={() => { void handleConfirmDeactivate(entity); }}
                        >
                          {t.admin.deactivateAnyway}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {dialogTarget ? (
        <MasterDataDialog
          title={dialogTarget === 'create' ? dialogTitleNew : dialogTitleEdit}
          nameFieldLabel={nameFieldLabel}
          activeFieldLabel={activeFieldLabel}
          entity={dialogTarget === 'create' ? undefined : dialogTarget}
          saving={saving}
          onClose={() => setDialogTarget(null)}
          onSave={async input => {
            try {
              await onSave(input);
              setDialogTarget(null);
            } catch {
              // toast already shown by useApiMutation; dialog stays open
            }
          }}
        />
      ) : null}
    </div>
  );
}

function MasterDataDialog({
  title, nameFieldLabel, activeFieldLabel, entity, saving, onClose, onSave,
}: {
  title: string;
  nameFieldLabel: string;
  activeFieldLabel: string;
  entity?: Entity;
  saving: boolean;
  onClose(): void;
  onSave(input: { id?: string; name: string; active: boolean }): Promise<void>;
}) {
  const [name, setName] = useState(entity?.name ?? '');
  const [active, setActive] = useState(entity?.active ?? true);
  const canSubmit = name.trim() !== '';

  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t.common.back}</Button>
          <Button
            type="button"
            disabled={!canSubmit}
            loading={saving}
            onClick={() => { void onSave({ id: entity?.id, name: name.trim(), active }); }}
          >
            {t.findings.editSaveCta}
          </Button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="master-data-name">{nameFieldLabel}</label>
        <input id="master-data-name" className="input" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <label className="toggle-row">
        <span className="toggle-track toggle-track-positive">
          <input type="checkbox" className="toggle-input" checked={active} onChange={e => setActive(e.target.checked)} />
          <span className="toggle-track-bg" aria-hidden="true" />
          <span className="toggle-thumb" aria-hidden="true" />
        </span>
        <span>{activeFieldLabel}</span>
      </label>
    </Dialog>
  );
}
