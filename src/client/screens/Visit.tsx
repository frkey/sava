/**
 * Visit registration — the field flow, spec §8.5, mockups D1–D6
 * (knowledge/mockups/SAVA_JORNADA_VISUAL.dc.html lines 864–1190; DESIGN_REFERENCE §3
 * "§8.5 Visit registration"). Reachable as `{name:'visit'}` (fresh — step A creates or
 * reopens a visit) or `{name:'visit', visitId}` (reopen from the dashboard/latest-visits
 * card, skipping straight to the department grid). Every step persists to the server
 * immediately — there is no final submit anywhere in this flow (spec §12).
 *
 * Rendered full-bleed by App.tsx (own app bar, no sidebar/bottom-nav) — same pattern as
 * ChangePassword.tsx — because every D1–D6 frame shows a dedicated 60px app bar and no
 * bottom-nav strip at all; see App.tsx's AppShell for where this is hoisted above the
 * normal `<main className="app-content">` shell.
 *
 * Component shape (mirrors FindingDetail.tsx's Screen/Body split, one level deeper):
 *   Visit        — owns whether a visitId is known yet; renders VisitStart (step A) or
 *                   VisitLoader.
 *   VisitLoader  — `visits.get {id}`; skeleton/error/loaded states.
 *   VisitBody    — owns `findings.list {cityId}` (for D3's "N novos" sub-lines and D6's
 *                   "already registered this visit" list/banner) and which department
 *                   is open (`phase`); renders DeptGrid (step B) or DepartmentFlow.
 *   DepartmentFlow — the per-department C/D/E/F stepper: app bar + step tabs +
 *                   Participation/ReviewQueue/NewFindings. Owns `ensureVisitDepartmentId`,
 *                   shared by Participation (PDF upload before any field save) and
 *                   NewFindings (findings.save / markDone) so a brand-new department's
 *                   VisitDepartment row is created lazily, exactly once, whichever of
 *                   those needs it first — see the function's own comment below.
 *
 *                   Two fixes from the task-7 visit-flow review live here:
 *                   (1) The three steps stay MOUNTED for the lifetime of a department
 *                   session (see `visitedSteps`/`goToStep` below) — only their
 *                   visibility toggles (`display: contents` vs `none`) — so a step's
 *                   local form state (e.g. Participation's rep chips, in-progress PDF
 *                   upload) survives quick tab navigation instead of being re-seeded
 *                   from a possibly-stale `vd` prop on remount. A step that was never
 *                   opened still never mounts, so e.g. NewFindings' `checklistItems.list`
 *                   fetch doesn't fire until the user actually visits that tab.
 *                   (2) `visitDepartments.save`/`.uploadPdf` return the updated row —
 *                   VisitBody threads it back up (`onVdSaved`) into a local override
 *                   map merged over `visits.get`'s data, so DeptGrid/StepTabs/
 *                   Participation's seed all read the authoritative just-saved row
 *                   immediately, without waiting on the unawaited background
 *                   `visits.get` reload that `onChanged` also kicks off.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { City, Department, Finding, Visit as VisitEntity, VisitDepartment } from '../../shared/types';
import { useApiCall, useApiMutation } from '../hooks/useApi';
import { useNav } from '../state/nav';
import { useSession } from '../state/session';
import { useToast } from '../state/toasts';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Skeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { t } from '../strings/pt';
import { VisitAppBar, SavedIndicator, StepTabs, type DeptStep } from './visit/shared';
import { VisitStart } from './visit/VisitStart';
import { DeptGrid } from './visit/DeptGrid';
import { Participation } from './visit/Participation';
import { ReviewQueue } from './visit/ReviewQueue';
import { NewFindings } from './visit/NewFindings';

export interface VisitProps {
  visitId?: string;
}

export function Visit({ visitId }: VisitProps) {
  const [createdVisitId, setCreatedVisitId] = useState<string | undefined>(undefined);
  const effectiveId = visitId ?? createdVisitId;

  const citiesResult = useApiCall('cities.list', undefined, []);
  const departmentsResult = useApiCall('departments.list', undefined, []);

  if (!effectiveId) {
    return (
      <VisitStart
        cities={(citiesResult.data ?? []).filter(c => c.active)}
        onEntered={id => setCreatedVisitId(id)}
      />
    );
  }

  return (
    <VisitLoader
      key={effectiveId}
      visitId={effectiveId}
      cities={citiesResult.data ?? []}
      departments={(departmentsResult.data ?? []).filter(d => d.active)}
    />
  );
}

function VisitLoader({ visitId, cities, departments }: { visitId: string; cities: City[]; departments: Department[] }) {
  const { go } = useNav();
  const visitResult = useApiCall('visits.get', { id: visitId }, [visitId]);

  if (visitResult.error && !visitResult.data) {
    return (
      <div className="visit-screen" data-screen="visit">
        <VisitAppBar title={t.visit.title} onBack={() => go({ name: 'dashboard' })} />
        <div className="visit-body">
          <EmptyState
            title={visitResult.error.message}
            action={<Button variant="secondary" onClick={visitResult.reload}>{t.toasts.retry}</Button>}
          />
        </div>
      </div>
    );
  }
  if (!visitResult.data) {
    return (
      <div className="visit-screen" data-screen="visit">
        <VisitAppBar title={t.visit.title} onBack={() => go({ name: 'dashboard' })} />
        <div className="visit-body">
          <Skeleton variant="line" width="60%" height={20} />
          <Skeleton variant="card" height={90} />
          <Skeleton variant="card" height={280} />
        </div>
      </div>
    );
  }

  return (
    <VisitBody
      visit={visitResult.data.visit}
      vds={visitResult.data.departments}
      cities={cities}
      departments={departments}
      reloadVisit={visitResult.reload}
    />
  );
}

type Phase = { kind: 'grid' } | { kind: 'department'; departmentId: string };

function VisitBody({
  visit, vds, cities, departments, reloadVisit,
}: { visit: VisitEntity; vds: VisitDepartment[]; cities: City[]; departments: Department[]; reloadVisit(): void }) {
  const { go } = useNav();
  const session = useSession();
  const findingsResult = useApiCall('findings.list', { filters: { cityId: visit.cityId } }, [visit.cityId]);
  const [phase, setPhase] = useState<Phase>({ kind: 'grid' });

  // Optimistic VisitDepartment overrides — task-7 review fix 1. `visitDepartments.save`/
  // `.uploadPdf` both return the updated row; DepartmentFlow feeds it here (`onVdSaved`)
  // the instant a save/upload resolves, well before the *separate*, unawaited
  // `visits.get` reload those same actions also kick off has a chance to land. Every
  // consumer below reads `mergedVds`, never the raw `vds` prop, so DeptGrid's badges,
  // StepTabs' "done" ticks and Participation's re-seed on remount are never looking at
  // a stale pre-save snapshot. Cleared whenever a *fresh* `vds` reference shows up
  // (only happens when a `visits.get` actually resolves) since that snapshot already
  // supersedes every override taken before it started.
  const [vdOverrides, setVdOverrides] = useState<Map<string, VisitDepartment>>(new Map());
  useEffect(() => { setVdOverrides(new Map()); }, [vds]);
  const applyVdOverride = useCallback((updated: VisitDepartment) => {
    setVdOverrides(prev => new Map(prev).set(updated.departmentId, updated));
  }, []);
  const mergedVds = useMemo(() => {
    const byDept = new Map(vds.map(v => [v.departmentId, v]));
    vdOverrides.forEach((v, deptId) => byDept.set(deptId, v));
    return Array.from(byDept.values());
  }, [vds, vdOverrides]);

  const cityName = cities.find(c => c.id === visit.cityId)?.name ?? visit.cityId;
  const findings: Finding[] = findingsResult.data ?? [];
  const department = phase.kind === 'department' ? departments.find(d => d.id === phase.departmentId) : undefined;
  const isAdmin = session.user?.role === 'admin';

  if (phase.kind === 'department' && department) {
    return (
      <DepartmentFlow
        key={department.id}
        visit={visit}
        cityName={cityName}
        department={department}
        vd={mergedVds.find(v => v.departmentId === department.id)}
        allFindings={findings}
        isAdmin={isAdmin}
        onBack={() => { reloadVisit(); findingsResult.reload(); setPhase({ kind: 'grid' }); }}
        onReloadVisit={reloadVisit}
        onReloadFindings={findingsResult.reload}
        onVdSaved={applyVdOverride}
      />
    );
  }

  return (
    <DeptGrid
      visit={visit}
      cityName={cityName}
      vds={mergedVds}
      departments={departments}
      findings={findings}
      isAdmin={isAdmin}
      onSelectDepartment={id => setPhase({ kind: 'department', departmentId: id })}
      onBack={() => go({ name: 'dashboard' })}
      onDeleted={() => go({ name: 'dashboard' })}
    />
  );
}

interface DepartmentFlowProps {
  visit: VisitEntity;
  cityName: string;
  department: Department;
  vd?: VisitDepartment;
  allFindings: Finding[];
  isAdmin: boolean;
  onBack(): void;
  onReloadVisit(): void;
  onReloadFindings(): void;
  onVdSaved(updated: VisitDepartment): void;
}

function DepartmentFlow({
  visit, cityName, department, vd, allFindings, isAdmin, onBack, onReloadVisit, onReloadFindings, onVdSaved,
}: DepartmentFlowProps) {
  const [step, setStep] = useState<DeptStep>('participation');
  const [saved, setSaved] = useState(false);
  const saveVdMutation = useApiMutation('visitDepartments.save');
  const toast = useToast();
  // Caches the in-flight row-creation call so two rapid triggers within the same
  // mounted step (e.g. a second tap while the first create is still resolving) share
  // one `visitDepartments.save` instead of racing two creates.
  const ensuringRef = useRef<Promise<string> | undefined>(undefined);

  async function ensureVisitDepartmentId(): Promise<string> {
    if (vd?.id) return vd.id;
    if (!ensuringRef.current) {
      ensuringRef.current = saveVdMutation
        .run({ visitDepartment: { visitId: visit.id, departmentId: department.id } })
        .then(created => { onVdSaved(created); onReloadVisit(); return created.id; })
        .catch(err => {
          // Never cache a rejection: one failed create (network blip, transient
          // VALIDATION) would otherwise permanently brick every subsequent PDF
          // upload / finding save / markDone for this department until remount.
          ensuringRef.current = undefined;
          throw err;
        });
    }
    return ensuringRef.current;
  }

  const reviewQueueResult = useApiCall(
    'findings.reviewQueue', { visitId: visit.id, departmentId: department.id }, [visit.id, department.id],
  );
  const pendingReview = reviewQueueResult.data?.filter(i => !i.existingReview).length;

  const thisVisitFindings = allFindings.filter(f => f.visitId === visit.id && f.departmentId === department.id);

  // "✓ Participação" means participation DATA was filled, not merely that a row exists —
  // a bare row is lazily created as a side effect of a PDF upload or a finding save
  // (`ensureVisitDepartmentId` above) before the form was ever submitted, and the PDF
  // alone is explicitly deferrable content (spec §5), so it doesn't tick the tab either.
  const participationDone = !!vd && !!(
    vd.regionalReps || vd.localReps || vd.verificationDate || vd.countYes !== undefined
  );

  // Task-7 review fix 1(b): once a step has been visited it stays mounted (hidden via
  // `display:none` rather than removed from the tree) for the rest of this department
  // session, so its local state (Participation's rep chips/PDF, an in-progress
  // ReviewQueue note) survives switching tabs instead of being re-seeded from props on
  // remount. A step that's never opened is never added here, so e.g. NewFindings'
  // `checklistItems.list` fetch only fires once the user actually visits that tab.
  const [visitedSteps, setVisitedSteps] = useState<Set<DeptStep>>(() => new Set<DeptStep>(['participation']));
  function goToStep(next: DeptStep) {
    setVisitedSteps(prev => (prev.has(next) ? prev : new Set(prev).add(next)));
    setStep(next);
  }

  const [deleteVdOpen, setDeleteVdOpen] = useState(false);
  const deleteVdMutation = useApiMutation('visitDepartments.delete');

  async function handleDeleteVd() {
    if (!vd?.id) return;
    try {
      await deleteVdMutation.run({ id: vd.id });
    } catch {
      return; // default (non-silent) error toast already shown, server message included
    }
    toast.show(t.visit.deleteDeptSuccessToast, 'success');
    onBack();
  }

  return (
    <div className="visit-screen" data-screen="visit">
      <VisitAppBar
        title={department.name}
        subtitle={<>{cityName} · <span className="visit-appbar-period">{visit.period}</span></>}
        onBack={onBack}
        right={
          <>
            {isAdmin && vd?.id ? (
              <button type="button" className="visit-appbar-delete" onClick={() => setDeleteVdOpen(true)}>
                {t.visit.deleteDeptCta}
              </button>
            ) : null}
            <SavedIndicator saved={saved} />
          </>
        }
      />
      <StepTabs
        step={step}
        onChange={goToStep}
        participationDone={participationDone}
        reviewDone={pendingReview === 0}
      />

      {visitedSteps.has('participation') ? (
        <div style={{ display: step === 'participation' ? 'contents' : 'none' }}>
          <Participation
            vd={vd}
            visitId={visit.id}
            departmentId={department.id}
            mainDate={visit.mainDate}
            ensureVisitDepartmentId={ensureVisitDepartmentId}
            onChanged={updated => { setSaved(true); onVdSaved(updated); onReloadVisit(); }}
            onContinue={() => goToStep('review')}
          />
        </div>
      ) : null}
      {visitedSteps.has('review') ? (
        <div style={{ display: step === 'review' ? 'contents' : 'none' }}>
          <ReviewQueue
            visitId={visit.id}
            items={reviewQueueResult.data}
            loading={reviewQueueResult.loading && !reviewQueueResult.data}
            onReload={() => { setSaved(true); reviewQueueResult.reload(); }}
            onContinue={() => goToStep('newFindings')}
          />
        </div>
      ) : null}
      {visitedSteps.has('newFindings') ? (
        <div style={{ display: step === 'newFindings' ? 'contents' : 'none' }}>
          <NewFindings
            department={department}
            findings={thisVisitFindings}
            ensureVisitDepartmentId={ensureVisitDepartmentId}
            onFindingSaved={() => { setSaved(true); onReloadFindings(); }}
            onConcluded={() => { setSaved(true); onBack(); }}
            onGoToReview={() => goToStep('review')}
          />
        </div>
      ) : null}

      {deleteVdOpen ? (
        <Dialog
          open
          title={t.visit.deleteDeptConfirmTitle}
          onClose={() => setDeleteVdOpen(false)}
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setDeleteVdOpen(false)}>{t.common.back}</Button>
              <Button
                type="button" variant="danger" onClick={() => { void handleDeleteVd(); }} loading={deleteVdMutation.saving}
              >
                {t.visit.deleteDeptCta}
              </Button>
            </>
          }
        >
          <div className="banner-text">{t.visit.deleteDeptConfirmBody}</div>
        </Dialog>
      ) : null}
    </div>
  );
}
