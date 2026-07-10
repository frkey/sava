/**
 * §8.6 Departments — no distinct mockup (divergence A-1, MOCKUP_DIVERGENCES.md:
 * "implementar clonando o padrão E5/DT4"). Same shape as Cities.tsx, grouping the
 * same `findings.list` fetch by departmentId instead of cityId.
 */
import { useMemo } from 'react';
import { UNRESOLVED } from '../../../shared/types';
import { useApiCall, useApiMutation } from '../../hooks/useApi';
import { useToast } from '../../state/toasts';
import { t } from '../../strings/pt';
import { MasterDataList } from './MasterDataList';

export function Departments() {
  const departmentsResult = useApiCall('departments.list', undefined, []);
  const findingsResult = useApiCall('findings.list', { filters: {} }, []);
  const saveMutation = useApiMutation('departments.save');
  const toast = useToast();

  const departments = departmentsResult.data ?? [];
  const findings = findingsResult.data ?? [];
  const openCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of findings) {
      if (!UNRESOLVED.includes(f.status)) continue;
      map.set(f.departmentId, (map.get(f.departmentId) ?? 0) + 1);
    }
    return map;
  }, [findings]);

  async function handleSave(input: { id?: string; name: string; active: boolean }) {
    await saveMutation.run({ department: input });
    departmentsResult.reload();
    toast.show(t.admin.changesSavedToast, 'success');
  }

  return (
    <MasterDataList
      sectionTitle={t.admin.sections.departments}
      addLabel={t.admin.addNewMasc}
      dialogTitleNew={t.admin.departmentDialog.new}
      dialogTitleEdit={t.admin.departmentDialog.edit}
      nameFieldLabel={t.admin.departmentDialog.name}
      activeFieldLabel={t.admin.departmentDialog.active}
      entities={departments}
      loading={departmentsResult.loading}
      openCountById={openCountById}
      deactivateWarning={t.admin.departmentDeactivateWarning}
      saving={saveMutation.saving}
      onSave={handleSave}
      errorTitle={departmentsResult.error && departments.length === 0 ? t.admin.loadErrorTitle.departments : undefined}
      onRetry={departmentsResult.reload}
    />
  );
}
