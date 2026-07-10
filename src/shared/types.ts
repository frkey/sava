export type Role = 'admin' | 'regional' | 'local';
export type FindingStatus = 'open' | 'in_treatment' | 'resolved' | 'cancelled';
export type FindingResponse = 'no' | 'yes_with_caveats';
export type Severity = 'high' | 'medium' | 'low';
export type ReviewResult = 'resolved' | 'not_resolved' | 'partial';
export type ReviewType = 'visit_review' | 'status_change';
export const UNRESOLVED: readonly FindingStatus[] = ['open', 'in_treatment'];

export type ErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'INTERNAL';

export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };

export interface ApiRequest { token?: string; action: string; payload?: unknown }

export interface City { id: string; name: string; active: boolean }
export interface Department { id: string; name: string; active: boolean }
export interface ChecklistItem {
  id: string; departmentId: string; itemRef: string; section: string;
  text: string; severity: Severity; active: boolean;
}
export interface SessionUser {
  id: string; name: string; login: string; role: Role; cityId?: string;
  mustChangePassword: boolean;
}
export interface Visit {
  id: string; cityId: string; period: string; mainDate: string; notes?: string;
  createdAt: string; createdBy: string;
}
export interface VisitDepartment {
  id: string; visitId: string; departmentId: string; cityId: string; period: string;
  verificationDate?: string; regionalReps?: string; localReps?: string;
  countYes?: number; countYesWithCaveats?: number; countNo?: number; countNotApplicable?: number;
  pdfFileId?: string; pdfUrl?: string;
  completedAt?: string; completedBy?: string; notes?: string;
  createdAt: string; createdBy: string;
}
export interface Finding {
  id: string; code: string; visitDepartmentId: string;
  visitId: string; cityId: string; departmentId: string; period: string;
  itemRef?: string; section?: string; itemText: string; severity: Severity;
  response: FindingResponse; considerations?: string;
  status: FindingStatus; deadline?: string; assignee?: string;
  resolvedAt?: string; resolvedBy?: string;
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
}
export interface FindingReview {
  id: string; findingId: string; type: ReviewType; visitId?: string;
  result?: ReviewResult; newStatus?: FindingStatus; notes?: string;
  createdAt: string; createdBy: string;
}
export interface FindingFilters {
  cityId?: string; departmentId?: string; status?: FindingStatus; period?: string;
  severity?: Severity; response?: FindingResponse; text?: string; overdue?: boolean;
}
export interface ReviewQueueItem { finding: Finding; existingReview?: FindingReview }
export interface VisitProgress { visit: Visit; cityName: string; done: number; total: number; missingPdfOrCounts: number }
export interface DashboardSummary {
  openByCity: { cityId: string; cityName: string; open: number; overdue: number }[];
  openByDepartment: { departmentId: string; departmentName: string; open: number }[];
  overdue: number; highSeverityOpen: number; completedMissingPdfOrCounts: number;
  citiesVisitedInSemester: { visited: number; total: number };
  latestVisits: VisitProgress[];
  resolutionRateSemester?: number; // 0..1, per-city when cityId given
}
export interface LoginResult { token: string; user: SessionUser }
