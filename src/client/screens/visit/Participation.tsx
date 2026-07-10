/**
 * D4 — participation, spec §8.5 step C. Seeded from the existing VisitDepartment row
 * when present (`visitDepartments.save` is an upsert by (visitId, departmentId), so
 * this always sends the full form regardless of whether a row already exists).
 *
 * Counts and the PDF are both explicitly deferrable (spec: "the SIGA report is often
 * not ready at the table") — the 4 counters start `undefined` (not 0) so a department
 * whose counts were never touched keeps `countYes === undefined` server-side, which is
 * exactly the signal DeptGrid.tsx's "falta resumo" badge and dashboard.summary's
 * `completedMissingPdfOrCounts` key off of. Only tapping +/- makes a counter "defined".
 *
 * The PDF upload can happen before this department's VisitDepartment row exists at all
 * (a brand-new department, PDF attached before ever pressing "Salvar e ir para
 * reverificação") — `ensureVisitDepartmentId` (owned by DepartmentFlow in Visit.tsx,
 * shared with NewFindings.tsx's own findings.save/markDone) upserts a bare row first
 * when needed, so uploadPdf always has a real id to attach to.
 */
import { useRef, useState } from 'react';
import type { VisitDepartment } from '../../../shared/types';
import { useApiMutation } from '../../hooks/useApi';
import { Button } from '../../components/Button';
import { t } from '../../strings/pt';
import { formatDatePt } from '../../lib/format';

export interface ParticipationProps {
  vd?: VisitDepartment;
  visitId: string;
  departmentId: string;
  mainDate: string;
  ensureVisitDepartmentId(): Promise<string>;
  /** Receives the authoritative row `visitDepartments.save`/`.uploadPdf` just returned
   *  — see Visit.tsx's file header (task-7 review fix 1) — so the caller can update its
   *  optimistic override before the separate, unawaited `visits.get` reload lands. */
  onChanged(updated: VisitDepartment): void;
  onContinue(): void;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const COUNT_FIELDS = [
  { key: 'countYes', label: t.labels.answerSummary.yes },
  { key: 'countYesWithCaveats', label: t.labels.answerSummary.yesWithCaveats },
  { key: 'countNo', label: t.labels.answerSummary.no },
  { key: 'countNotApplicable', label: t.labels.answerSummary.notApplicable },
] as const;
type CountKey = (typeof COUNT_FIELDS)[number]['key'];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    // User-facing message (rendered by handlePdfSelected's catch) — from t.*, and a
    // plain Error whose `.message` carries exactly this string.
    reader.onerror = () => reject(new Error(t.visit.pdfReadError));
    reader.readAsDataURL(file);
  });
}

export function Participation({
  vd, visitId, departmentId, mainDate, ensureVisitDepartmentId, onChanged, onContinue,
}: ParticipationProps) {
  const [regionalReps, setRegionalReps] = useState<string[]>(
    () => (vd?.regionalReps ? vd.regionalReps.split(',').map(s => s.trim()).filter(Boolean) : []),
  );
  const [repDraft, setRepDraft] = useState('');
  const [localReps, setLocalReps] = useState(vd?.localReps ?? '');
  const [verificationDate, setVerificationDate] = useState(vd?.verificationDate ?? '');
  const [counts, setCounts] = useState<Partial<Record<CountKey, number>>>({
    countYes: vd?.countYes, countYesWithCaveats: vd?.countYesWithCaveats,
    countNo: vd?.countNo, countNotApplicable: vd?.countNotApplicable,
  });
  const [pdfAttached, setPdfAttached] = useState(!!vd?.pdfFileId);
  const [pdfError, setPdfError] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveMutation = useApiMutation('visitDepartments.save');
  const uploadMutation = useApiMutation('visitDepartments.uploadPdf');

  function addRep() {
    const name = repDraft.trim();
    if (!name) return;
    setRegionalReps(reps => [...reps, name]);
    setRepDraft('');
  }
  function removeRep(index: number) {
    setRegionalReps(reps => reps.filter((_, i) => i !== index));
  }
  function bump(key: CountKey, delta: number) {
    setCounts(c => ({ ...c, [key]: Math.max(0, (c[key] ?? 0) + delta) }));
  }

  async function handlePdfSelected(file: File) {
    setPdfError(undefined);
    if (!/\.pdf$/i.test(file.name)) { setPdfError(t.visit.pdfMustBePdf); return; }
    if (file.size > MAX_PDF_BYTES) { setPdfError(t.visit.pdfTooLarge); return; }
    try {
      const base64 = await readFileAsBase64(file);
      const id = await ensureVisitDepartmentId();
      const updated = await uploadMutation.run({ id, fileName: file.name, base64 });
      setPdfAttached(true);
      onChanged(updated);
    } catch (err) {
      // Both branches read `.message` directly — String(err) would prepend "Error: ".
      setPdfError(err instanceof Error ? err.message : t.visit.pdfReadError);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit() {
    const updated = await saveMutation.run({
      visitDepartment: {
        visitId, departmentId,
        regionalReps: regionalReps.length ? regionalReps.join(', ') : undefined,
        localReps: localReps.trim() || undefined,
        verificationDate: verificationDate || undefined,
        countYes: counts.countYes, countYesWithCaveats: counts.countYesWithCaveats,
        countNo: counts.countNo, countNotApplicable: counts.countNotApplicable,
      },
    });
    onChanged(updated);
    onContinue();
  }

  return (
    <>
      <div className="visit-body">
        <div className="field">
          <label className="field-label" htmlFor="rep-draft">{t.visit.participation.regionalReps}</label>
          <div className="chip-input">
            {regionalReps.map((name, i) => (
              <span key={`${name}-${i}`} className="chip-input-tag">
                {name}
                <button type="button" aria-label={t.visit.removeRep(name)} onClick={() => removeRep(i)}>✕</button>
              </span>
            ))}
            <input
              id="rep-draft"
              className="chip-input-field"
              placeholder={t.visit.addRepPlaceholder}
              value={repDraft}
              onChange={e => setRepDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRep(); }
                else if (e.key === 'Backspace' && !repDraft && regionalReps.length > 0) removeRep(regionalReps.length - 1);
              }}
              onBlur={addRep}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="local-reps">{t.visit.participation.cityReps}</label>
          <input
            id="local-reps" className="input" placeholder={t.visit.cityRepsPlaceholder}
            value={localReps} onChange={e => setLocalReps(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="verification-date">{t.visit.participation.verificationDate}</label>
          <input
            id="verification-date" type="date" className="input"
            value={verificationDate} onChange={e => setVerificationDate(e.target.value)}
          />
          {!verificationDate ? (
            <div className="field-hint">{t.visit.sameAsMainDate(formatDatePt(mainDate))}</div>
          ) : null}
        </div>

        <div>
          <div className="visit-section-row">
            <span className="visit-section-title">{t.visit.summaryTitle}</span>
            <span className="visit-section-defer">{t.visit.fillLater}</span>
          </div>
          <div className="stepper-grid">
            {COUNT_FIELDS.map(({ key, label }) => (
              <div key={key} className="stepper-card">
                <div>
                  <div className="stepper-card-label">{label}</div>
                  <div className="stepper-card-value">{counts[key] ?? 0}</div>
                </div>
                <div className="stepper-btns">
                  <button
                    type="button" className="stepper-btn" aria-label={t.visit.decrementOf(label)}
                    disabled={(counts[key] ?? 0) === 0} onClick={() => bump(key, -1)}
                  >
                    −
                  </button>
                  <button
                    type="button" className="stepper-btn" aria-label={t.visit.incrementOf(label)}
                    onClick={() => bump(key, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="visit-section-row">
            <span className="visit-section-title">{t.visit.pdfTitle}</span>
            <span className="visit-section-defer">{t.visit.attachLater}</span>
          </div>
          <input
            ref={fileInputRef} type="file" accept="application/pdf" className="visually-hidden"
            id="pdf-input"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handlePdfSelected(f); }}
          />
          {pdfAttached ? (
            <label htmlFor="pdf-input" className="dropzone dropzone-attached">
              <span className="dropzone-icon" aria-hidden="true">✓</span>
              <span className="dropzone-title">{t.visit.pdfAttached}</span>
              <span className="dropzone-replace-link">{t.visit.pdfReplaceCta}</span>
            </label>
          ) : (
            <label htmlFor="pdf-input" className="dropzone">
              <span className="dropzone-icon" aria-hidden="true">↑</span>
              <span className="dropzone-title">
                {uploadMutation.saving ? t.visit.pdfUploading : t.visit.attachPdfCta}
              </span>
              <span className="dropzone-helper">{t.visit.attachPdfHelper}</span>
            </label>
          )}
          {pdfError ? <div className="review-card-error">{pdfError}</div> : null}
        </div>
      </div>
      <div className="visit-footer">
        <Button onClick={() => { void handleSubmit(); }} loading={saveMutation.saving}>
          {t.visit.goToReviewCta}
        </Button>
      </div>
    </>
  );
}
