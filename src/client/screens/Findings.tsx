/**
 * C1 (mobile card list) / C2 (filter sheet, FilterSheet.tsx) / DT2 (desktop table) —
 * DESIGN_REFERENCE §8.3. One `findings.list` result renders as either shape; CSS picks
 * which is visible at the current viewport (`.finding-list` / `.finding-table-wrap`,
 * same "both always in the DOM, CSS switches" pattern as SideBar/NavBar and
 * Dashboard.tsx's `.dashboard-title`) — not a client-side branch on role or viewport.
 *
 * No "Exportar" button (divergence B-2, cut from v1) and no pagination: DT2's mockup
 * shows both, but `Actions['findings.list']` (shared/actions.ts) has no `page` param and
 * no unfiltered-total count to paginate against, so every filtered result renders in one
 * page — same simplification the mobile card list already implies.
 *
 * `cityId`/`departmentId` on a `Finding` are ids only — city/department *names* come from
 * `cities.list`/`departments.list` (per DESIGN_REFERENCE §8.3's own API list), fetched
 * alongside `findings.list` and joined client-side into `cityNameById`/`departmentNameById`.
 */
import { useEffect, useMemo, useState } from 'react';
import type { City, Department, FindingFilters, FindingStatus, Severity } from '../../shared/types';
import { useSession } from '../state/session';
import { useNav } from '../state/nav';
import { useApiCall } from '../hooks/useApi';
import { t, statusLabel, severityLabel, responseLabel } from '../strings/pt';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { FindingCard } from '../components/FindingCard';
import { FilterSheet } from '../components/FilterSheet';
import { findingDeadlineDisplay, isOverdueClient } from '../lib/format';

const SEARCH_DEBOUNCE_MS = 300;

type ChipKey = keyof FindingFilters;

export function Findings() {
  const session = useSession();
  const { screen, go } = useNav();
  const user = session.user!;
  const isLocal = user.role === 'local';
  const navFilters = screen.name === 'findings' ? screen.filters : undefined;

  const [filters, setFilters] = useState<FindingFilters>(() => ({
    ...navFilters,
    ...(isLocal && user.cityId ? { cityId: user.cityId } : {}),
  }));
  const [searchText, setSearchText] = useState(filters.text ?? '');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Debounced text search (300ms) — feeds `filters.text`, the server-side text filter
  // (src/server/services/findings.ts#listFindings). Nothing fires while the timer is
  // pending; only the settled value ever reaches `filters`.
  useEffect(() => {
    const trimmed = searchText.trim();
    const handle = setTimeout(() => {
      setFilters(f => {
        const nextText = trimmed || undefined;
        return f.text === nextText ? f : { ...f, text: nextText };
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchText]);

  const citiesResult = useApiCall('cities.list', undefined, []);
  const departmentsResult = useApiCall('departments.list', undefined, []);
  const findingsResult = useApiCall('findings.list', { filters }, [JSON.stringify(filters)]);

  const cities = citiesResult.data ?? [];
  const departments = departmentsResult.data ?? [];
  const cityNameById = useMemo(() => new Map<string, string>(cities.map(c => [c.id, c.name])), [cities]);
  const departmentNameById = useMemo(() => new Map<string, string>(departments.map(d => [d.id, d.name])), [departments]);
  // Sheet options only offer active cadastros; the name maps above stay unfiltered so a
  // finding tied to a since-deactivated city/department still shows a real name.
  const activeCities = useMemo(() => cities.filter((c: City) => c.active), [cities]);
  const activeDepartments = useMemo(() => departments.filter((d: Department) => d.active), [departments]);

  const findings = findingsResult.data ?? [];
  const lockedCityId = isLocal ? user.cityId : undefined;

  function patchFilters(patch: Partial<FindingFilters>) {
    setFilters(f => ({ ...f, ...patch }));
  }
  function removeFilter(key: ChipKey) {
    setFilters(f => {
      const next = { ...f };
      delete next[key];
      return next;
    });
  }
  function clearAll() {
    setSearchText('');
    setFilters(isLocal && user.cityId ? { cityId: user.cityId } : {});
  }

  const chips: { key: ChipKey; label: string }[] = [];
  if (filters.cityId && !isLocal) chips.push({ key: 'cityId', label: cityNameById.get(filters.cityId) ?? filters.cityId });
  if (filters.departmentId) chips.push({ key: 'departmentId', label: departmentNameById.get(filters.departmentId) ?? filters.departmentId });
  if (filters.status) chips.push({ key: 'status', label: statusLabel[filters.status as FindingStatus] });
  if (filters.period) chips.push({ key: 'period', label: filters.period });
  if (filters.severity) chips.push({ key: 'severity', label: severityLabel[filters.severity as Severity] });
  if (filters.response) chips.push({ key: 'response', label: responseLabel[filters.response] });
  if (filters.overdue) chips.push({ key: 'overdue', label: t.findings.overdueOnly });
  const hasActiveFilters = chips.length > 0 || !!filters.text;

  const mastersLoading = (citiesResult.loading && citiesResult.data === undefined)
    || (departmentsResult.loading && departmentsResult.data === undefined);
  const firstFindingsLoad = findingsResult.loading && findingsResult.data === undefined;

  if (findingsResult.error && findingsResult.data === undefined) {
    return (
      <div className="findings-screen">
        <EmptyState
          title={t.findings.loadErrorTitle}
          action={<Button variant="secondary" onClick={findingsResult.reload}>{t.toasts.retry}</Button>}
        />
      </div>
    );
  }

  if (mastersLoading || firstFindingsLoad) {
    return (
      <div className="findings-screen">
        <div className="findings-skeleton">
          <Skeleton variant="line" width="45%" height={24} />
          <Skeleton variant="line" width="70%" height={45} />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} variant="card" height={110} />)}
        </div>
      </div>
    );
  }

  const emptyCityName = filters.cityId ? cityNameById.get(filters.cityId) : undefined;

  return (
    <div className="findings-screen">
      <div className="findings-header">
        <h1 className="findings-title">{t.nav.mobile.apontamentos}</h1>
        <span className="findings-count">{t.findings.resultsCount(findings.length)}</span>
      </div>

      <div className="findings-search-wrap">
        <span className="search-icon" aria-hidden="true" />
        <input
          className="search-input"
          type="search"
          placeholder={t.findings.searchPlaceholder}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          aria-label={t.findings.searchPlaceholder}
        />
      </div>

      <div className="findings-toolbar">
        <div className="filter-trigger-wrap">
          <button type="button" className="filter-trigger-btn" onClick={() => setSheetOpen(true)}>
            {t.findings.filtersTitle}
          </button>
          <FilterSheet
            open={sheetOpen}
            filters={filters}
            cities={activeCities}
            departments={activeDepartments}
            lockedCityId={lockedCityId}
            onApply={next => { patchFilters({ ...next, text: filters.text }); setSheetOpen(false); }}
            onClose={() => setSheetOpen(false)}
          />
        </div>
        {chips.map(chip => (
          <span key={chip.key} className="active-filter-chip">
            {chip.label}
            <button
              type="button"
              className="active-filter-chip-remove"
              aria-label={`${t.findings.clear} ${chip.label}`}
              onClick={() => removeFilter(chip.key)}
            >
              ✕
            </button>
          </span>
        ))}
        {hasActiveFilters ? (
          <button type="button" className="findings-clear-link" onClick={clearAll}>{t.findings.clear}</button>
        ) : null}
      </div>

      {findings.length === 0 ? (
        <EmptyState
          icon="✓"
          title={t.dashboard.emptyTitle}
          hint={emptyCityName ? t.dashboard.emptyBody(emptyCityName) : undefined}
          action={
            <Button variant="secondary" onClick={() => patchFilters({ status: 'resolved' })}>
              {t.dashboard.emptySeeResolved}
            </Button>
          }
        />
      ) : (
        <>
          <div className="finding-list">
            {findings.map(f => (
              <FindingCard
                key={f.id}
                finding={f}
                cityName={cityNameById.get(f.cityId) ?? f.cityId}
                departmentName={departmentNameById.get(f.departmentId) ?? f.departmentId}
                onClick={() => go({ name: 'finding', id: f.id, from: filters })}
              />
            ))}
          </div>

          <div className="finding-table-wrap">
            <div className="finding-table-header">
              <span>{t.findings.tableHeaders.city}</span>
              <span>{t.findings.tableHeaders.department}</span>
              <span>{t.findings.tableHeaders.item}</span>
              <span>{t.findings.tableHeaders.severity}</span>
              <span>{t.findings.tableHeaders.status}</span>
              <span className="finding-table-deadline-header">{t.findings.tableHeaders.deadline}</span>
            </div>
            {findings.map(f => {
              const overdue = isOverdueClient(f);
              const deadline = findingDeadlineDisplay(f, true);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`finding-table-row${overdue ? ' finding-table-row-overdue' : ''}`}
                  onClick={() => go({ name: 'finding', id: f.id, from: filters })}
                  data-finding-id={f.id}
                >
                  <span>{cityNameById.get(f.cityId) ?? f.cityId}</span>
                  <span>{departmentNameById.get(f.departmentId) ?? f.departmentId}</span>
                  <span className="finding-table-item">
                    {f.itemRef ? <span className="finding-code-chip">{f.itemRef}</span> : null}
                    <span className="finding-table-item-text">{f.itemText}</span>
                  </span>
                  <span className={`finding-table-severity finding-table-severity-${f.severity}`}>
                    {t.labels.criticalityTag[f.severity]}
                  </span>
                  <span><StatusBadge status={f.status} /></span>
                  <span className={`finding-deadline finding-deadline-${deadline.kind} finding-table-deadline-cell`}>
                    {deadline.text}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
