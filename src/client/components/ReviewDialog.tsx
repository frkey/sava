/**
 * DESIGN_REFERENCE §8.4 C5 "Registrar revisão" — visit picker limited to the finding's
 * city (`visits` is fetched once by FindingDetail.tsx via `visits.list {cityId}` and
 * shared with Timeline for period lookups) + resultado segmented cards + observação,
 * same notes-required-for-partial/not_resolved rule as
 * `src/server/services/reviews.ts#saveReview`. Same centered-modal simplification as
 * StatusDialog (see its file header) instead of C5's bottom sheet.
 *
 * `findingReviews.save` runs with `{silent: true}`: both documented CONFLICT causes
 * (a NEW review against an already resolved/cancelled finding; correcting a review to
 * resolved/partial on a since-cancelled finding) must keep the user on this dialog with
 * the server's own message rendered inline — a toast would leave the dialog looking
 * like nothing happened.
 */
import { useEffect, useState } from 'react';
import type { Finding, ReviewResult, Visit } from '../../shared/types';
import { useApiMutation } from '../hooks/useApi';
import { useToast } from '../state/toasts';
import { ApiError } from '../lib/gas';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { t, reviewResultLabel } from '../strings/pt';
import { formatDatePt } from '../lib/format';

export interface ReviewDialogProps {
  finding: Finding;
  visits: Visit[];
  visitsLoading: boolean;
  onClose(): void;
  onSaved(): void;
}

const RESULTS: ReviewResult[] = ['resolved', 'not_resolved', 'partial'];

function resultIcon(r: ReviewResult): string {
  if (r === 'resolved') return '✓';
  if (r === 'not_resolved') return '✕';
  return '◐';
}
function resultHint(r: ReviewResult): string {
  if (r === 'resolved') return t.findings.reviewHints.optional;
  if (r === 'partial') return t.findings.reviewHints.requiredPartial;
  return t.findings.reviewHints.required;
}

export function ReviewDialog({ finding, visits, visitsLoading, onClose, onSaved }: ReviewDialogProps) {
  const sortedVisits = [...visits].sort((a, b) => (a.mainDate < b.mainDate ? 1 : a.mainDate > b.mainDate ? -1 : 0));
  const [visitId, setVisitId] = useState<string>(sortedVisits[0]?.id ?? '');
  const [result, setResult] = useState<ReviewResult | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const mutation = useApiMutation('findingReviews.save');
  const toast = useToast();

  // Visits can still be loading when the dialog first opens (fetched by the parent) —
  // seed the default selection once they arrive, without clobbering a user choice.
  useEffect(() => {
    if (!visitId && sortedVisits[0]) setVisitId(sortedVisits[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits]);

  const notesRequired = result === 'partial' || result === 'not_resolved';
  const canConfirm = !!visitId && !!result && (!notesRequired || notes.trim() !== '') && !mutation.saving;

  async function handleConfirm() {
    if (!visitId || !result) return;
    setErrorMessage(undefined);
    try {
      await mutation.run(
        { findingId: finding.id, visitId, result, notes: notes.trim() || undefined },
        { silent: true },
      );
    } catch (err) {
      setErrorMessage(err instanceof ApiError ? err.message : String(err));
      return;
    }
    toast.show(t.findings.reviewSaveSuccess, 'success');
    onSaved();
    onClose();
  }

  return (
    <Dialog
      open
      title={t.findings.actions.registerReview}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{t.common.back}</Button>
          <Button type="button" onClick={() => { void handleConfirm(); }} disabled={!canConfirm} loading={mutation.saving}>
            {t.findings.saveReview}
          </Button>
        </>
      }
    >
      {errorMessage ? (
        <div className="banner banner-error" role="alert">
          <span className="banner-icon" aria-hidden="true">!</span>
          <span className="banner-text">{errorMessage}</span>
        </div>
      ) : null}

      <div className="field">
        <label className="field-label" htmlFor="review-visit">{t.findings.reviewLabels.visit}</label>
        {visitsLoading ? (
          <select id="review-visit" className="select" disabled value="">
            <option value="">{t.findings.selectVisitPlaceholder}</option>
          </select>
        ) : sortedVisits.length === 0 ? (
          <div className="field-hint">{t.findings.noVisitsForCity}</div>
        ) : (
          <select
            id="review-visit"
            className="select"
            value={visitId}
            onChange={e => setVisitId(e.target.value)}
          >
            {sortedVisits.map(v => (
              <option key={v.id} value={v.id}>{`${v.period} — ${formatDatePt(v.mainDate)}`}</option>
            ))}
          </select>
        )}
      </div>

      <div className="field">
        <div className="field-label">{t.findings.reviewLabels.result}</div>
        <div className="option-card-list">
          {RESULTS.map(r => (
            <button
              key={r}
              type="button"
              className={`option-card option-card-result-${r}${result === r ? ' is-selected' : ''}`}
              onClick={() => setResult(r)}
            >
              <span className={`option-card-icon option-card-icon-${r}`} aria-hidden="true">{resultIcon(r)}</span>
              <span className={`option-card-result-label option-card-result-label-${r}`}>{reviewResultLabel[r]}</span>
              <span className={`option-card-hint${r !== 'resolved' ? ' option-card-hint-required' : ''}`}>
                {resultHint(r)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="review-notes">{t.findings.reviewLabels.notes}</label>
        <textarea
          id="review-notes"
          className="textarea"
          placeholder={t.findings.observationPlaceholder}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
