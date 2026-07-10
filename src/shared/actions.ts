import type {
  City, Department, ChecklistItem, SessionUser, Visit, VisitDepartment,
  Finding, FindingReview, FindingFilters, ReviewQueueItem, DashboardSummary,
  LoginResult, ReviewResult, FindingStatus,
} from './types';

export interface ImportPreviewRow {
  itemRef: string; section: string; text: string; severity: string;
  kind: 'new' | 'changed' | 'unchanged' | 'invalid';
}
export interface ImportPreview {
  rows: ImportPreviewRow[];
  absent: ChecklistItem[]; // active items not in the paste — deactivation proposal
}

/** payload/result typing per action — dispatcher and client both derive from this */
export interface Actions {
  'auth.login': { p: { login: string; password: string }; r: LoginResult };
  'auth.logout': { p: void; r: void };
  'auth.me': { p: void; r: SessionUser };
  'auth.changePassword': { p: { currentPassword: string; newPassword: string }; r: void };
  'cities.list': { p: void; r: City[] };
  'cities.save': { p: { city: Partial<City> & { name: string } }; r: City };
  'departments.list': { p: void; r: Department[] };
  'departments.save': { p: { department: Partial<Department> & { name: string } }; r: Department };
  'checklistItems.list': { p: { departmentId?: string }; r: ChecklistItem[] };
  'checklistItems.save': { p: { item: Partial<ChecklistItem> }; r: ChecklistItem };
  'checklistItems.importPaste': {
    p: { departmentId: string; tsv: string; apply?: boolean; deactivateAbsent?: string[] };
    r: ImportPreview;
  };
  'users.list': { p: void; r: (SessionUser & { active: boolean })[] };
  'users.save': { p: { user: Partial<SessionUser> & { name: string; login: string; active?: boolean } }; r: { user: SessionUser; tempPassword?: string } };
  'users.resetPassword': { p: { userId: string }; r: { tempPassword: string } };
  'visits.list': { p: { cityId?: string; period?: string }; r: Visit[] };
  'visits.get': { p: { id: string }; r: { visit: Visit; departments: VisitDepartment[] } };
  'visits.save': { p: { visit: Partial<Visit> & { cityId: string; period: string; mainDate: string } }; r: Visit };
  'visits.delete': { p: { id: string }; r: void };
  'visitDepartments.save': { p: { visitDepartment: Partial<VisitDepartment> & { visitId: string; departmentId: string } }; r: VisitDepartment };
  'visitDepartments.markDone': { p: { id: string }; r: VisitDepartment };
  'visitDepartments.delete': { p: { id: string }; r: void };
  'visitDepartments.uploadPdf': { p: { id: string; fileName: string; base64: string }; r: VisitDepartment };
  'visitDepartments.downloadPdf': { p: { visitDepartmentId: string }; r: { fileName: string; base64: string } };
  'findings.list': { p: { filters?: FindingFilters }; r: Finding[] };
  'findings.get': { p: { id: string }; r: { finding: Finding; reviews: FindingReview[] } };
  'findings.save': { p: { finding: Partial<Finding> & { itemText: string }; force?: boolean }; r: Finding };
  'findings.updateStatus': { p: { id: string; status: FindingStatus; note: string }; r: Finding };
  'findings.reviewQueue': { p: { visitId: string; departmentId: string }; r: ReviewQueueItem[] };
  'findingReviews.save': { p: { findingId: string; visitId: string; result: ReviewResult; notes?: string }; r: FindingReview };
  'dashboard.summary': { p: { cityId?: string }; r: DashboardSummary };
}
export type ActionName = keyof Actions;
