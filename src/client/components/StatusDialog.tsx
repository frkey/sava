/**
 * DESIGN_REFERENCE §8.4 C4 "Mudar status" — offers ONLY the manual transitions legal
 * from the finding's current status. Mirrored client-side from the server's transition
 * table (spec §5; `src/server/services/findings.ts` `MANUAL_TRANSITIONS`,
 * `src/client/lib/mock/server.ts`'s identical copy) — this is a UX convenience only,
 * the server re-validates and is the actual authority.
 *
 * Rendered via the shared `Dialog` (centered modal) rather than C4's bottom sheet:
 * documented simplification (`.superpowers/sdd/task-6-report.md`) — building a second
 * sheet primitive alongside `FilterSheet.tsx` for two call sites (this + ReviewDialog)
 * wasn't judged worth the duplication; `Dialog` already provides the scrim/Escape/
 * footer mechanics C4 needs, just with a centered panel instead of a bottom sheet.
 */
import { useState } from 'react';
import type { Finding, FindingStatus } from '../../shared/types';
import { useApiMutation } from '../hooks/useApi';
import { useToast } from '../state/toasts';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { t, statusLabel } from '../strings/pt';

/** Mirrors src/server/services/findings.ts MANUAL_TRANSITIONS verbatim — keep in sync. */
export const MANUAL_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  open: ['in_treatment', 'resolved', 'cancelled'],
  in_treatment: ['open', 'resolved', 'cancelled'],
  resolved: ['open'],
  cancelled: ['open'],
};

export interface StatusDialogProps {
  finding: Finding;
  onClose(): void;
  onChanged(): void;
}

export function StatusDialog({ finding, onClose, onChanged }: StatusDialogProps) {
  const [target, setTarget] = useState<FindingStatus | undefined>(undefined);
  const [note, setNote] = useState('');
  const mutation = useApiMutation('findings.updateStatus');
  const toast = useToast();

  // Defensive fallback: `finding.status` is typed as FindingStatus, but the value still
  // crosses an RPC boundary from data this client doesn't fully control (e.g. a
  // corrupted spreadsheet row) — an unrecognized status renders zero options instead of
  // crashing `.map()` below on `undefined`.
  const options = MANUAL_TRANSITIONS[finding.status] ?? [];
  const canConfirm = !!target && note.trim() !== '' && !mutation.saving;

  async function handleConfirm() {
    if (!target) return;
    try {
      await mutation.run({ id: finding.id, status: target, note: note.trim() });
    } catch {
      return; // error toast already shown (non-silent) by useApiMutation
    }
    toast.show(t.findings.statusChangeSuccess, 'success');
    onChanged();
    onClose();
  }

  return (
    <Dialog
      open
      title={t.findings.actions.changeStatus}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t.common.back}</Button>
          <Button type="button" onClick={() => { void handleConfirm(); }} disabled={!canConfirm} loading={mutation.saving}>
            {t.findings.confirmChange}
          </Button>
        </>
      }
    >
      <div className="dialog-subtitle">{t.findings.currentStatus(statusLabel[finding.status])}</div>

      <div className="option-card-list">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            className={`option-card${target === opt ? ' is-selected' : ''}`}
            onClick={() => setTarget(opt)}
          >
            <span className="option-card-radio" aria-hidden="true" />
            <span>
              <div className={`option-card-title option-card-title-${opt}`}>{statusLabel[opt]}</div>
              {t.findings.transitionDescriptions[opt] ? (
                <div className="option-card-desc">{t.findings.transitionDescriptions[opt]}</div>
              ) : null}
            </span>
          </button>
        ))}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="status-note">{t.findings.justificationLabel}</label>
        <textarea
          id="status-note"
          className="textarea"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <div className="field-hint">{t.findings.justificationHelper}</div>
      </div>
    </Dialog>
  );
}
