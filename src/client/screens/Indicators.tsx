/**
 * B3 (mobile) / DT6 (desktop) — Indicadores, DESIGN_REFERENCE §8.7. Same
 * `dashboard.summary` data as Painel (`useApiCall('dashboard.summary', {}, [])`,
 * unchanged payload — CLAUDE.md: "`local` role is filtered by their cityId
 * server-side, always") and the exact same 4 KPI cards (`buildKpis`, factored out of
 * Dashboard.tsx in this task so the two screens' KPI row can't silently drift apart),
 * with two additional recortes (segmented pills) over those SAME counts: "Por cidade"
 * (`openByCity`, with a VENCIDOS column) and "Por departamento" (`openByDepartment`,
 * no VENCIDOS column — `dashboard.summary` has no per-department overdue count). No
 * third "Novos × resolvidos por visita" pill DT6 mocks (divergence B-5: no table backs
 * it in-app; that cut lives in the external Looker report only, spec §10).
 *
 * `local` users land on the exact same component — the pills still work, but every
 * row in `dashboard.summary` is already forced to their own city server-side, so "por
 * cidade" degenerates to a single row. No client-side role branch decides what data
 * comes back, only which chrome renders around it (the Looker button, below).
 *
 * "Painel completo" (Looker) button: regional/admin only (spec §10 — the report is
 * regional-level, shared only with the regional team's Google accounts; `local` has no
 * other indicator surface than these same cards, so it's hidden for them entirely,
 * not just disabled). `LOOKER_URL` (lib/config.ts) is `undefined` until a real report
 * exists (spec §15's rollout checklist) — the button still renders for regional/admin
 * in that state, disabled, with a helper explaining why, rather than disappearing, so
 * it stays discoverable once a report ships.
 */
import { useState } from 'react';
import { useSession } from '../state/session';
import { useNav } from '../state/nav';
import { useApiCall } from '../hooks/useApi';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { KpiCard } from '../components/KpiCard';
import { buildKpis } from './Dashboard';
import { LOOKER_URL } from '../lib/config';
import { t } from '../strings/pt';

type Cut = 'city' | 'department';

function IndicatorsSkeleton() {
  return (
    <div className="indicators-screen">
      <div className="indicators-skeleton">
        <Skeleton variant="line" width="45%" height={24} />
        <Skeleton variant="line" width="55%" height={14} />
        <div className="kpi-grid dashboard-skeleton-grid">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="card" height={82} />)}
        </div>
        <Skeleton variant="line" width="200px" height={36} />
        <Skeleton variant="card" height={220} />
      </div>
    </div>
  );
}

export function Indicators() {
  const session = useSession();
  const { go } = useNav();
  const { data, loading, error, reload } = useApiCall('dashboard.summary', {}, []);
  const [cut, setCut] = useState<Cut>('city');

  if (error) {
    return (
      <div className="indicators-screen">
        <EmptyState
          title={t.indicators.loadErrorTitle}
          action={<Button variant="secondary" onClick={reload}>{t.toasts.retry}</Button>}
        />
      </div>
    );
  }
  if (loading || !data) return <IndicatorsSkeleton />;

  const user = session.user!;
  // Divergence B-3/8 (task brief): the Looker link is regional/admin only — `local`
  // never sees the button at all (not merely disabled), same gate spec §10 applies to
  // report sharing itself.
  const canOpenLooker = user.role === 'regional' || user.role === 'admin';
  const kpis = buildKpis(data, go);
  const lookerHelper = LOOKER_URL ? t.indicators.lookerHelper : t.indicators.lookerUnconfiguredHelper;

  function handleOpenLooker() {
    if (!LOOKER_URL) return;
    // rel safety: the opened tab must not get a `window.opener` handle back to this
    // app (tabnabbing) — `noopener` also implies `noreferrer` in modern browsers, but
    // both are passed for older-engine compatibility.
    window.open(LOOKER_URL, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="indicators-screen">
      <div className="indicators-header">
        <div className="indicators-header-text">
          <h1 className="indicators-title">{t.nav.mobile.indicadores}</h1>
          <div className="indicators-subtitle">
            <span>{t.dashboard.currentSemesterLabel}</span>
            <span>·</span>
            <span>
              {t.dashboard.citiesVisitedOfTotal(
                data.citiesVisitedInSemester.visited,
                data.citiesVisitedInSemester.total,
              )}
            </span>
          </div>
        </div>
        {canOpenLooker ? (
          <div className="indicators-looker-wrap">
            <Button
              variant="secondary"
              className="indicators-looker-btn"
              disabled={!LOOKER_URL}
              title={lookerHelper}
              onClick={handleOpenLooker}
            >
              {t.indicators.lookerButton}
            </Button>
            <div className="indicators-looker-helper">{lookerHelper}</div>
          </div>
        ) : null}
      </div>

      <div className="kpi-grid">
        {kpis.map(k => (
          <KpiCard key={k.key} value={k.value} label={k.label} variant={k.variant} onClick={k.onClick} />
        ))}
      </div>

      <div className="indicators-pills">
        <button
          type="button"
          className={`indicator-pill${cut === 'city' ? ' is-active' : ''}`}
          aria-pressed={cut === 'city'}
          onClick={() => setCut('city')}
        >
          {t.indicators.segments.byCity}
        </button>
        <button
          type="button"
          className={`indicator-pill${cut === 'department' ? ' is-active' : ''}`}
          aria-pressed={cut === 'department'}
          onClick={() => setCut('department')}
        >
          {t.indicators.segments.byDepartment}
        </button>
      </div>

      {cut === 'city' ? (
        <div className="indicators-table-wrap" data-cut="city">
          <div className="indicators-table-header has-overdue">
            <span>{t.indicators.headers.city}</span>
            <span>{t.indicators.headers.open}</span>
            <span>{t.indicators.headers.overdue}</span>
          </div>
          {data.openByCity.map(row => (
            <div className="indicators-table-row has-overdue" key={row.cityId} data-city-id={row.cityId}>
              <span>{row.cityName}</span>
              <span className="indicators-table-open">{row.open}</span>
              <span className={row.overdue > 0 ? 'indicators-table-overdue' : 'indicators-table-overdue-zero'}>
                {row.overdue}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="indicators-table-wrap" data-cut="department">
          <div className="indicators-table-header">
            <span>{t.indicators.headers.department}</span>
            <span>{t.indicators.headers.open}</span>
          </div>
          {data.openByDepartment.map(row => (
            <div className="indicators-table-row" key={row.departmentId} data-department-id={row.departmentId}>
              <span>{row.departmentName}</span>
              <span className="indicators-table-open">{row.open}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
