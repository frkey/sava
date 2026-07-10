export function escapeCell(v: unknown): unknown {
  if (typeof v === 'string' && v.startsWith('=')) return `'${v}`;
  return v;
}

export function rowToObject<T>(headers: string[], row: unknown[]): T {
  const obj: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    const cell = row[i];
    if (cell === '' || cell === null || cell === undefined) return;
    if (cell === 'TRUE') obj[h] = true;
    else if (cell === 'FALSE') obj[h] = false;
    else obj[h] = cell;
  });
  return obj as T;
}

export function objectToRow(headers: string[], obj: Record<string, unknown>): unknown[] {
  return headers.map((h) => {
    const v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return escapeCell(v);
  });
}

export const SHEET_COLUMNS: Record<string, string[]> = {
  Cities: ['id', 'name', 'active'],
  Departments: ['id', 'name', 'active'],
  ChecklistItems: ['id', 'departmentId', 'itemRef', 'section', 'text', 'severity', 'active'],
  Users: ['id', 'name', 'login', 'role', 'cityId', 'active', 'mustChangePassword', 'createdAt',
    'passwordHash', 'salt', 'hashIterations', 'failedAttempts', 'lockedUntil'],
  Sessions: ['token', 'userId', 'createdAt', 'expiresAt', 'lastSeenAt'],
  Visits: ['id', 'cityId', 'period', 'mainDate', 'notes', 'createdAt', 'createdBy'],
  VisitDepartments: ['id', 'visitId', 'departmentId', 'cityId', 'period', 'verificationDate',
    'regionalReps', 'localReps', 'countYes', 'countYesWithCaveats', 'countNo', 'countNotApplicable',
    'pdfFileId', 'pdfUrl', 'completedAt', 'completedBy', 'notes', 'createdAt', 'createdBy'],
  Findings: ['id', 'code', 'visitDepartmentId', 'visitId', 'cityId', 'departmentId', 'period',
    'itemRef', 'section', 'itemText', 'severity', 'response', 'considerations', 'status',
    'deadline', 'assignee', 'resolvedAt', 'resolvedBy', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
  FindingReviews: ['id', 'findingId', 'type', 'visitId', 'result', 'newStatus', 'notes', 'createdAt', 'createdBy'],
  AuditLog: ['timestamp', 'userId', 'action', 'entity', 'entityId', 'detail'],
};
