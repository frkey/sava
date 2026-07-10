/**
 * D5 — review queue, spec §8.5 step D (`findings.reviewQueue`). One card per
 * unresolved finding carried over from another visit of this city+department, plus
 * any finding already reviewed in THIS visit (so a wrong answer stays correctable —
 * spec §5's upsert-by-(findingId,visitId) rule); each carries its own
 * `existingReview` when one exists, pre-selecting the segmented control.
 *
 * Divergence from the D5 screenshot: the mockup renders decisions as already
 * answered, with no separate confirm affordance. This adds one — a small "Salvar
 * decisão" button, disabled until a required observação is filled — because
 * "Resolvida"/"Parcial"/"Não resolvida" alone can't safely auto-save (the
 * required-note rule must gate the write, spec §5), and the task's own test brief
 * calls this out explicitly ("confirm disabled"). Selecting a result no longer
 * silently commits it; the card must be confirmed, matching every other decision
 * surface in this app (ReviewDialog.tsx, StatusDialog.tsx).
 *
 * Each card owns its own `findingReviews.save` mutation and runs it `{silent: true}`
 * — a CONFLICT (already resolved/cancelled by another path mid-visit) renders inline
 * on that one card, exactly like ReviewDialog.tsx's identical case, rather than a
 * toast that would leave the card looking like nothing happened.
 */
import { useState } from 'react';
import type { ReviewQueueItem, ReviewResult } from '../../../shared/types';
import { useApiMutation } from '../../hooks/useApi';
import { useToast } from '../../state/toasts';
import { ApiError } from '../../lib/gas';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { SeverityBadge } from '../../components/SeverityBadge';
import { t, reviewResultLabel } from '../../strings/pt';
import { isOverdueClient } from '../../lib/format';

export interface ReviewQueueProps {
  visitId: string;
  items?: ReviewQueueItem[]; // undefined while loading
  loading: boolean;
  onReload(): void;
  onContinue(): void;
}

const RESULTS: ReviewResult[] = ['resolved', 'not_resolved', 'partial'];
const RESULT_ICON: Record<ReviewResult, string> = { resolved: '✓ ', not_resolved: '', partial: '◐ ' };

interface ReviewCardProps {
  item: ReviewQueueItem;
  visitId: string;
  answeredBefore: number;
  total: number;
  onSaved(): void;
}

function ReviewCard({ item, visitId, answeredBefore, total, onSaved }: ReviewCardProps) {
  const { finding, existingReview } = item;
  const [result, setResult] = useState<ReviewResult | undefined>(existingReview?.result);
  const [notes, setNotes] = useState(existingReview?.notes ?? '');
  const [noteOpen, setNoteOpen] = useState(!!existingReview?.notes);
  const [error, setError] = useState<string | undefined>(undefined);
  const mutation = useApiMutation('findingReviews.save');
  const toast = useToast();

  // Mirrors src/server/services/reviews.ts#saveReview's notes rule (required for
  // partial/not_resolved, optional for resolved) — keep in sync.
  const notesRequired = result === 'partial' || result === 'not_resolved';
  const dirty = result !== existingReview?.result || notes.trim() !== (existingReview?.notes ?? '');
  const canConfirm = !!result && (!notesRequired || notes.trim() !== '') && dirty && !mutation.saving;

  async function handleConfirm() {
    if (!result) return;
    setError(undefined);
    try {
      await mutation.run(
        { findingId: finding.id, visitId, result, notes: notes.trim() || undefined },
        { silent: true },
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      return;
    }
    const nextAnswered = answeredBefore + (existingReview ? 0 : 1);
    toast.show(t.visit.reviewSavedToast(nextAnswered, total), 'success');
    onSaved();
  }

  const noteLabel = result === 'partial'
    ? t.visit.noteRequiredForPartial
    : result === 'not_resolved'
      ? t.visit.noteRequiredForNotResolved
      : t.visit.addNoteOptional;

  return (
    <div
      className={[
        'review-card',
        result === 'partial' ? 'review-card-partial' : '',
        result === 'not_resolved' ? 'review-card-not_resolved' : '',
        mutation.saving ? 'review-card-saving' : '',
      ].filter(Boolean).join(' ')}
      data-finding-id={finding.id}
    >
      <div className="review-card-text">
        {finding.itemRef ? <span className="finding-code-chip">{finding.itemRef}</span> : null} {finding.itemText}
      </div>
      <div className="review-card-meta">
        <SeverityBadge severity={finding.severity} />
        <span className="review-card-origin">{t.visit.originLabel(finding.period)}</span>
        {isOverdueClient(finding) ? <span className="overdue-pill">{t.labels.overdueShort}</span> : null}
      </div>
      <div className="segment-row segment-row-3">
        {RESULTS.map(r => (
          <button
            key={r}
            type="button"
            className={`segment-btn${result === r ? ` review-decision-btn-selected-${r}` : ''}`}
            onClick={() => { setResult(r); setError(undefined); if (r !== 'resolved') setNoteOpen(true); }}
          >
            {result === r ? RESULT_ICON[r] : ''}{reviewResultLabel[r]}
          </button>
        ))}
      </div>

      {result ? (
        <>
          {notesRequired || noteOpen ? (
            <>
              <div className={`review-card-note-label${result === 'not_resolved' ? ' review-card-note-label-danger' : ''}`}>
                {noteLabel}
              </div>
              <textarea
                className={`textarea review-card-note${result === 'not_resolved' ? ' review-card-note-danger' : ''}`}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t.findings.observationPlaceholder}
              />
            </>
          ) : (
            <button type="button" className="review-card-note-toggle" onClick={() => setNoteOpen(true)}>
              {t.visit.addNoteOptional}
            </button>
          )}
          <Button
            className="review-card-confirm"
            onClick={() => { void handleConfirm(); }}
            disabled={!canConfirm}
            loading={mutation.saving}
            loadingLabel={t.visit.savingReview}
          >
            {t.visit.saveDecisionCta}
          </Button>
          {error ? <div className="review-card-error" role="alert">{error}</div> : null}
        </>
      ) : null}
    </div>
  );
}

export function ReviewQueue({ visitId, items, loading, onReload, onContinue }: ReviewQueueProps) {
  const list = items ?? [];
  const answeredCount = list.filter(i => i.existingReview).length;
  const pendingCount = list.length - answeredCount;

  return (
    <>
      <div className="visit-body">
        {loading ? (
          <>
            <Skeleton variant="line" width="80%" height={16} />
            <Skeleton variant="card" height={160} />
            <Skeleton variant="card" height={160} />
          </>
        ) : list.length === 0 ? (
          <EmptyState title={t.visit.noQueueTitle} hint={t.visit.noQueueHint} />
        ) : (
          <>
            <div className="review-intro">{t.visit.reviewIntro(list.length)}</div>
            {list.map(item => (
              <ReviewCard
                key={item.finding.id}
                item={item}
                visitId={visitId}
                answeredBefore={answeredCount}
                total={list.length}
                onSaved={onReload}
              />
            ))}
          </>
        )}
      </div>
      <div className="visit-footer">
        <Button onClick={onContinue}>{t.visit.goToNewFindingsCta}</Button>
        {pendingCount > 0 ? (
          <div className="visit-footer-helper">{t.visit.pendingCount(pendingCount)}</div>
        ) : null}
      </div>
    </>
  );
}
