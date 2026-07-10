/**
 * §8.6 Cities — DESIGN_REFERENCE E5. Per-city "N apontamentos abertos" and the
 * deactivate-warning count both come from a single `findings.list` fetch (admin
 * omits `filters.cityId`, so it returns every city's findings, spec §7), grouped
 * client-side by cityId — there is no dedicated per-city-counts endpoint.
 */
import { useMemo } from 'react';
import { UNRESOLVED } from '../../../shared/types';
import { useApiCall, useApiMutation } from '../../hooks/useApi';
import { useToast } from '../../state/toasts';
import { t } from '../../strings/pt';
import { MasterDataList } from './MasterDataList';

export function Cities() {
  const citiesResult = useApiCall('cities.list', undefined, []);
  const findingsResult = useApiCall('findings.list', { filters: {} }, []);
  const saveMutation = useApiMutation('cities.save');
  const toast = useToast();

  const cities = citiesResult.data ?? [];
  const findings = findingsResult.data ?? [];
  const openCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of findings) {
      if (!UNRESOLVED.includes(f.status)) continue;
      map.set(f.cityId, (map.get(f.cityId) ?? 0) + 1);
    }
    return map;
  }, [findings]);

  async function handleSave(input: { id?: string; name: string; active: boolean }) {
    await saveMutation.run({ city: input });
    citiesResult.reload();
    toast.show(t.admin.changesSavedToast, 'success');
  }

  return (
    <MasterDataList
      sectionTitle={t.admin.sections.cities}
      addLabel={t.admin.addNewFem}
      dialogTitleNew={t.admin.cityDialog.new}
      dialogTitleEdit={t.admin.cityDialog.edit}
      nameFieldLabel={t.admin.cityDialog.name}
      activeFieldLabel={t.admin.cityDialog.active}
      entities={cities}
      loading={citiesResult.loading}
      openCountById={openCountById}
      deactivateWarning={t.admin.cityDeactivateWarning}
      saving={saveMutation.saving}
      onSave={handleSave}
      errorTitle={citiesResult.error && cities.length === 0 ? t.admin.loadErrorTitle.cities : undefined}
      onRetry={citiesResult.reload}
    />
  );
}
