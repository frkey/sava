/**
 * B1/B2/DT1 — Painel (DESIGN_REFERENCE §8.2). One screen, two shapes driven entirely by
 * what `dashboard.summary` returns — the client never branches its RPC payload by role
 * (`useApiCall('dashboard.summary', {}, [])` always, per CLAUDE.md: "`local` role is
 * filtered by their cityId server-side, always"). `role === 'local'` only decides which
 * pieces of the same response to render:
 *  - **Regional/admin** (B1 mobile / DT1 desktop): "Painel" heading, semester context
 *    line (see the C-4 note below), CTA "Registrar visita", "Abertos por cidade" (top 6,
 *    'ver todas' → Indicadores), "Últimas visitas" across all cities.
 *  - **Local** (B2): city name as the heading instead of a por-cidade list (there's only
 *    one city), no CTA, "Abertos por departamento" in the city-list card's place,
 *    "Últimas visitas em {cidade}", and a positive resolution-rate KPI card in the 4th
 *    slot when the server computes one (falls back to the same "sem PDF/resumo" KPI
 *    regional/admin always see, if it isn't defined).
 *
 * Divergence C-4 (knowledge/mockups/MOCKUP_DIVERGENCES.md): the mockups label this
 * screen "Regional · competência {MM/YYYY}" right above the KPI row, but
 * dashboard.summary's KPIs (abertos/vencidos/alta/sem PDF) are current-state, not
 * period-filtered — so that copy is dropped. The competência/semester concept only
 * really applies to `citiesVisitedInSemester` and the "últimas visitas" list, so it's
 * kept there instead, as a plain "semestre atual" context line, never attached to a KPI.
 *
 * KPI sub-lines: DT1 mocks a second line per card ("31 abertos · 16 em tratamento",
 * "o mais antigo: 47 dias", "em 7 cidades", "em 3 visitas") that `dashboard.summary`
 * has no backing fields for (no open/in_treatment split, no oldest-overdue-age, no
 * per-severity city count, no per-visit missing-PDF count) — rather than fabricate
 * numbers the server doesn't return, KpiCard's `sub` prop is simply left unset here.
 */
import type { ReactNode } from 'react';
import type { DashboardSummary, VisitProgress } from '../../shared/types';
import { useSession } from '../state/session';
import { useNav, type NavContextValue } from '../state/nav';
import { useApiCall } from '../hooks/useApi';
import { Card } from '../components/Card';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { KpiCard, type KpiCardVariant } from '../components/KpiCard';
import { t } from '../strings/pt';

interface BarRow { key: string; label: string; value: number; overdue?: number }

function BarList({ rows, deptFill }: { rows: BarRow[]; deptFill?: boolean }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="bar-list">
      {rows.map(r => (
        <div className="bar-row" key={r.key}>
          <span className="bar-row-label">{r.label}</span>
          <div className="bar-row-track">
            <div
              className={`bar-row-fill${deptFill ? ' bar-row-fill-dept' : ''}`}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <span className="bar-row-count">{r.value}</span>
          {r.overdue ? <span className="bar-row-overdue">{t.dashboard.overdueBadge(r.overdue)}</span> : null}
        </div>
      ))}
    </div>
  );
}

function VisitRow({ vp, showCityName, onClick }: { vp: VisitProgress; showCityName: boolean; onClick(): void }) {
  const isDone = vp.total > 0 && vp.done === vp.total;
  return (
    <button type="button" className="visit-row" onClick={onClick}>
      <span className="visit-row-main">
        <span className="visit-row-title">
          {showCityName ? `${vp.cityName} · ` : ''}
          <span className="visit-row-period">{vp.visit.period}</span>
        </span>
        <span className="visit-row-progress">{t.visit.progress(vp.done, vp.total)}</span>
        {vp.missingPdfOrCounts > 0 ? <span className="visit-missing-badge">{t.labels.missingBoth}</span> : null}
      </span>
      <span className={`visit-status-chip ${isDone ? 'visit-status-chip-done' : 'visit-status-chip-progress'}`}>
        {isDone ? t.labels.visitStatus.done : t.labels.visitStatus.inProgress}
      </span>
      <span className="visit-row-chevron" aria-hidden="true">›</span>
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-screen">
      <div className="dashboard-skeleton">
        <Skeleton variant="line" width="45%" height={24} />
        <Skeleton variant="line" width="55%" height={14} />
        <div className="kpi-grid dashboard-skeleton-grid">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="card" height={82} />)}
        </div>
        <Skeleton variant="card" height={190} />
        <Skeleton variant="card" height={190} />
      </div>
    </div>
  );
}

export interface KpiDef { key: string; value: ReactNode; label: string; variant?: KpiCardVariant; onClick?(): void }

/**
 * The 4 KPI cards (open / overdue / high-severity-open / resolution-rate-or-missing-
 * PDF) are identical data AND identical tap-to-filter navigation on both Painel (this
 * file) and Indicadores (Indicators.tsx, task 9 brief: "same 4 KPIs as Painel") —
 * factored out here so the two screens' KPI row can't silently drift apart.
 */
export function buildKpis(data: DashboardSummary, go: NavContextValue['go']): KpiDef[] {
  const totalOpen = data.openByCity.reduce((sum, r) => sum + r.open, 0);
  return [
    { key: 'open', value: totalOpen, label: t.dashboard.kpi.open, onClick: () => go({ name: 'findings' }) },
    {
      key: 'overdue', value: data.overdue, label: t.dashboard.kpi.overdue, variant: 'alert',
      onClick: () => go({ name: 'findings', filters: { overdue: true } }),
    },
    {
      key: 'high', value: data.highSeverityOpen, label: t.dashboard.kpi.highSeverityOpen,
      onClick: () => go({ name: 'findings', filters: { severity: 'high' } }),
    },
    data.resolutionRateSemester !== undefined
      ? {
          key: 'resolution', value: `${Math.round(data.resolutionRateSemester * 100)}%`,
          label: t.dashboard.kpi.resolvedSemester, variant: 'positive',
        }
      : {
          key: 'missing', value: data.completedMissingPdfOrCounts,
          label: t.dashboard.kpi.completedMissingPdfOrSummary,
        },
  ];
}

export function Dashboard() {
  const session = useSession();
  const { go } = useNav();
  const { data, loading, error, reload } = useApiCall('dashboard.summary', {}, []);

  if (error) {
    return (
      <div className="dashboard-screen">
        <EmptyState
          title={t.dashboard.loadErrorTitle}
          action={<Button variant="secondary" onClick={reload}>{t.toasts.retry}</Button>}
        />
      </div>
    );
  }
  if (loading || !data) return <DashboardSkeleton />;

  const user = session.user!;
  const isLocal = user.role === 'local';
  const cityName = isLocal ? (data.openByCity[0]?.cityName ?? '') : undefined;
  const kpis = buildKpis(data, go);

  return (
    <div className="dashboard-screen">
      <div className="dashboard-header">
        <div className="dashboard-header-text">
          <h1 className="dashboard-title">{isLocal ? cityName : t.nav.mobile.painel}</h1>
          <div className="dashboard-subtitle">
            {isLocal ? (
              <>
                <span>{t.dashboard.subtitleLocal}</span>
                <span className="badge-readonly">{t.labels.readOnlyBadge}</span>
              </>
            ) : (
              <>
                <span>{t.dashboard.currentSemesterLabel}</span>
                <span>·</span>
                <span>
                  {t.dashboard.citiesVisitedOfTotal(
                    data.citiesVisitedInSemester.visited,
                    data.citiesVisitedInSemester.total,
                  )}
                </span>
              </>
            )}
          </div>
        </div>
        {!isLocal ? (
          <div className="dashboard-cta-wrap">
            <Button className="dashboard-cta" onClick={() => go({ name: 'visit' })}>+ {t.visit.title}</Button>
            <div className="dashboard-cta-helper">{t.dashboard.registerVisitHelper}</div>
          </div>
        ) : null}
      </div>

      <div className="kpi-grid">
        {kpis.map(k => (
          <KpiCard key={k.key} value={k.value} label={k.label} variant={k.variant} onClick={k.onClick} />
        ))}
      </div>

      {isLocal ? (
        <Card title={t.dashboard.openByDepartmentTitle}>
          <BarList
            rows={data.openByDepartment.map(r => ({ key: r.departmentId, label: r.departmentName, value: r.open }))}
            deptFill
          />
        </Card>
      ) : (
        <Card
          title={t.dashboard.openByCityTitle}
          rightAction={
            <button type="button" className="card-link-btn" onClick={() => go({ name: 'indicators' })}>
              {t.dashboard.seeAll}
            </button>
          }
        >
          <BarList
            rows={data.openByCity.slice(0, 6).map(r => ({
              key: r.cityId, label: r.cityName, value: r.open, overdue: r.overdue,
            }))}
          />
        </Card>
      )}

      {data.latestVisits.length > 0 ? (
        <Card title={isLocal ? t.dashboard.latestVisitsInCityTitle(cityName ?? '') : t.dashboard.latestVisitsTitle}>
          <div className="visit-list">
            {data.latestVisits.map(vp => (
              <VisitRow
                key={vp.visit.id}
                vp={vp}
                showCityName={!isLocal}
                onClick={() => go({ name: 'visit', visitId: vp.visit.id })}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
