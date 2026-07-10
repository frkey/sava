import type { Envelope, ErrorCode } from '../../shared/types';

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
  }
}
export function fail(code: ErrorCode, message: string, details?: unknown): never {
  throw new AppError(code, message, details);
}
export function ok<T>(data: T): Envelope<T> { return { ok: true, data }; }
export function errEnvelope(code: ErrorCode, message: string, details?: unknown): Envelope<never> {
  return { ok: false, error: { code, message, details } };
}
