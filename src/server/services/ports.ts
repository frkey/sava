import type {
  City, Department, ChecklistItem, Visit, VisitDepartment, Finding, FindingReview,
  Role, SessionUser,
} from '../../shared/types';

export interface UserRow {
  id: string; name: string; login: string; role: Role; cityId?: string;
  active: boolean; mustChangePassword: boolean; createdAt: string;
  passwordHash: string; salt: string; hashIterations: number;
  failedAttempts: number; lockedUntil?: string;
}
export interface SessionRow {
  token: string; userId: string; createdAt: string; expiresAt: string; lastSeenAt: string;
}
export interface AuditEntry {
  timestamp: string; userId: string; action: string; entity: string; entityId: string; detail: string;
}

export interface Table<T extends { id: string }> {
  all(): T[];
  byId(id: string): T | undefined;
  insert(row: T): void;
  update(row: T): void; // locates by id at write time; throws if missing
  remove(id: string): void; // locates by id at write time; throws if missing
}
export interface SessionsTable {
  byToken(token: string): SessionRow | undefined;
  insert(row: SessionRow): void;
  update(row: SessionRow): void;
  deleteByToken(token: string): void;
  deleteByUserId(userId: string): void;
  deleteExpired(nowIso: string): number;
}
export interface Repos {
  cities: Table<City>;
  departments: Table<Department>;
  checklistItems: Table<ChecklistItem>;
  users: Table<UserRow>;
  sessions: SessionsTable;
  visits: Table<Visit>;
  visitDepartments: Table<VisitDepartment>;
  findings: Table<Finding>;
  findingReviews: Table<FindingReview>;
  audit: { append(e: AuditEntry): void };
}
export interface FilesPort {
  savePdf(folderToken: string, cityName: string, fileName: string, base64: string): { fileId: string; url: string };
  readPdf(fileId: string): { fileName: string; base64: string };
}
export interface Ports {
  repos: Repos;
  files: FilesPort;
  now(): Date;
  todayIso(): string;      // YYYY-MM-DD in America/Sao_Paulo
  uuid(): string;
  randomToken(): string;   // ≥ 240 bits
  lock<T>(fn: () => T): T;
  invalidateCache(keys: string[]): void;
}
export interface Ctx { ports: Ports; user: SessionUser }

export function audit(ports: Ports, userId: string, action: string, entity: string, entityId: string, detail = ''): void {
  ports.repos.audit.append({ timestamp: ports.now().toISOString(), userId, action, entity, entityId, detail });
}
