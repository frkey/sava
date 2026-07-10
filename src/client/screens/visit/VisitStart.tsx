/**
 * D1 (create/reopen) + D2 (explicit confirmation modal) — spec §8.5 step A. Only
 * rendered by Visit.tsx while no visitId is known yet (fresh `{name:'visit'}` nav).
 *
 * `visits.save` runs `{silent: true}`: the one documented failure mode a user should
 * never see as an error is the uniqueness CONFLICT (`details.existingVisitId`) — per
 * spec that means "enter the existing visit, no error shown" (reopen semantics). Any
 * other failure (e.g. a transient VALIDATION) is rendered inline in the confirm
 * dialog instead of a toast, same reasoning as ReviewDialog.tsx: closing the dialog
 * on error would make the failure invisible.
 */
import { useState } from 'react';
import type { City } from '../../../shared/types';
import { useNav } from '../../state/nav';
import { useApiMutation } from '../../hooks/useApi';
import { ApiError } from '../../lib/gas';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { t } from '../../strings/pt';
import { formatDatePt, formatPeriodMask, isValidPeriodClient, todayIsoSaoPaulo } from '../../lib/format';
import { VisitAppBar } from './shared';

export interface VisitStartProps {
  cities: City[]; // active only (Visit.tsx filters before passing down)
  onEntered(visitId: string): void;
}

export function VisitStart({ cities, onEntered }: VisitStartProps) {
  const { go } = useNav();
  const [cityId, setCityId] = useState('');
  const [mainDate, setMainDate] = useState(todayIsoSaoPaulo());
  const [period, setPeriod] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const saveMutation = useApiMutation('visits.save');

  const periodValid = isValidPeriodClient(period);
  const canContinue = !!cityId && !!mainDate && periodValid;
  const cityName = cities.find(c => c.id === cityId)?.name ?? '';

  async function handleCreate() {
    setErrorMessage(undefined);
    try {
      const visit = await saveMutation.run({ visit: { cityId, period, mainDate } }, { silent: true });
      onEntered(visit.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        const existingId = (err.details as { existingVisitId?: string } | undefined)?.existingVisitId;
        if (existingId) { onEntered(existingId); return; }
      }
      setErrorMessage(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <div className="visit-screen" data-screen="visit">
      <VisitAppBar title={t.visit.title} onBack={() => go({ name: 'dashboard' })} />
      <div className="visit-step-content">
        <div className="visit-body">
          <div className="field">
            <label className="field-label" htmlFor="visit-city">{t.visit.cityLabel}</label>
            <select id="visit-city" className="select" value={cityId} onChange={e => setCityId(e.target.value)}>
              <option value="">{t.visit.cityPlaceholder}</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="new-finding-form-grid">
            <div className="field">
              <label className="field-label" htmlFor="visit-main-date">{t.visit.mainDateLabel}</label>
              <input
                id="visit-main-date" type="date" className="input"
                value={mainDate} onChange={e => setMainDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="visit-period">{t.visit.periodLabel}</label>
              <input
                id="visit-period" className="input" inputMode="numeric" placeholder={t.visit.periodPlaceholder}
                value={period} onChange={e => setPeriod(formatPeriodMask(e.target.value))}
              />
              <div className="field-hint">{t.common.periodFormatHelper}</div>
            </div>
          </div>

          <div className="banner banner-info">
            <span className="banner-icon" aria-hidden="true">i</span>
            <span className="banner-text">{t.visit.uniquenessCallout}</span>
          </div>
        </div>
        <div className="visit-footer">
          <Button disabled={!canContinue} onClick={() => setConfirmOpen(true)}>{t.visit.continueCta}</Button>
        </div>
      </div>

      {confirmOpen ? (
        <Dialog
          open
          title={t.visit.confirmTitle}
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
                {t.visit.backToEdit}
              </Button>
              <Button type="button" onClick={() => { void handleCreate(); }} loading={saveMutation.saving}>
                {t.visit.confirmCta}
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
          <div className="visit-confirm-summary">
            <div className="visit-confirm-city">{cityName}</div>
            <div className="visit-confirm-period">{t.visit.confirmPeriodLabel(period)}</div>
            <div className="visit-confirm-date">{t.visit.confirmMainDateLabel(formatDatePt(mainDate))}</div>
          </div>
          <div className="visit-confirm-helper">{t.visit.confirmHelper}</div>
        </Dialog>
      ) : null}
    </div>
  );
}
