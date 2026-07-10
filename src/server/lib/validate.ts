import type { Finding } from '../../shared/types';
import { UNRESOLVED } from '../../shared/types';
import { fail } from './errors';

export function requireString(v: unknown, field: string, opts: { min?: number; max?: number } = {}): string {
  if (typeof v !== 'string' || v.trim() === '') fail('VALIDATION', `Campo obrigatório: ${field}`, { field });
  const s = v.trim();
  if (opts.min && s.length < opts.min) fail('VALIDATION', `${field}: mínimo de ${opts.min} caracteres`, { field });
  if (opts.max && s.length > opts.max) fail('VALIDATION', `${field}: máximo de ${opts.max} caracteres`, { field });
  return s;
}
export function optionalString(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') fail('VALIDATION', 'Valor inválido');
  return v.trim();
}
export function requireEnum<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v))
    fail('VALIDATION', `Valor inválido para ${field}`, { field, allowed });
  return v as T;
}
export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
export function isValidPeriod(s: string): boolean {
  const m = /^(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const month = Number(m[1]);
  return month >= 1 && month <= 12;
}
export function periodFolderToken(period: string): string {
  const [mm, yyyy] = period.split('/');
  return `${yyyy}-${mm}`;
}
export function semesterOf(period: string): string {
  const [mm, yyyy] = period.split('/');
  return `${yyyy}-${Number(mm) <= 6 ? 1 : 2}`;
}
export function currentPeriodSemester(now: Date): string {
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1 <= 6 ? 1 : 2}`;
}
export function isOverdue(f: Pick<Finding, 'status' | 'deadline'>, todayIso: string): boolean {
  return !!f.deadline && UNRESOLVED.includes(f.status) && f.deadline < todayIso;
}
