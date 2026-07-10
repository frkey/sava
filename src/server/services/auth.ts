import type { LoginResult, SessionUser } from '../../shared/types';
import { fail } from '../lib/errors';
import { requireString } from '../lib/validate';
import {
  hashPassword, verifyPassword, checkPasswordPolicy, DEFAULT_ITERATIONS, DUMMY_SALT, sha256Hex,
} from '../lib/crypto';
import type { Ports, UserRow, Ctx } from './ports';
import { audit } from './ports';

export const SESSION_DAYS = 30;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
export const GENERIC_LOGIN_ERROR =
  'Usuário ou senha inválidos. Após tentativas repetidas, aguarde 15 minutos.';

export function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id, name: u.name, login: u.login, role: u.role,
    cityId: u.cityId, mustChangePassword: u.mustChangePassword,
  };
}
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000).toISOString();
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000).toISOString();

export function login(ports: Ports, payload: { login: string; password: string }): LoginResult {
  const loginName = requireString(payload.login, 'usuário').toLowerCase();
  const password = requireString(payload.password, 'senha');
  const nowIso = ports.now().toISOString();
  const user = ports.repos.users.all().find(u => u.login.toLowerCase() === loginName);

  // equal-work invariant (spec §6): verifyPassword must run exactly ONE hashPassword
  // call on every path — known user, unknown user, locked, inactive — so elapsed time
  // never leaks whether the login exists. '0'.repeat(64) is a fixed hex literal that
  // hashPassword (a hex-digest chain) can never produce, so it never matches.
  const salt = user ? user.salt : DUMMY_SALT;
  const iterations = user ? user.hashIterations : DEFAULT_ITERATIONS;
  const expected = user ? user.passwordHash : '0'.repeat(64);
  const passwordOk = verifyPassword(password, salt, iterations, expected);

  const locked = !!user?.lockedUntil && user.lockedUntil > nowIso;
  if (!user || !user.active || locked || !passwordOk) {
    if (user && user.active && !locked && !passwordOk) {
      ports.lock(() => {
        const fresh = ports.repos.users.byId(user.id);
        if (!fresh) return;
        const failures = fresh.failedAttempts + 1;
        const lockedUntil = failures >= MAX_FAILURES ? addMinutes(ports.now(), LOCK_MINUTES) : fresh.lockedUntil;
        ports.repos.users.update({ ...fresh, failedAttempts: failures, lockedUntil });
        audit(ports, user.id, 'auth.login.failure', 'Users', user.id, `failures=${failures}`);
      });
    }
    fail('UNAUTHORIZED', GENERIC_LOGIN_ERROR);
  }
  const token = ports.randomToken();
  ports.lock(() => {
    const fresh = ports.repos.users.byId(user.id);
    if (fresh && (fresh.failedAttempts > 0 || fresh.lockedUntil)) {
      ports.repos.users.update({ ...fresh, failedAttempts: 0, lockedUntil: undefined });
    }
    ports.repos.sessions.insert({
      token, userId: user.id, createdAt: nowIso,
      expiresAt: addDays(ports.now(), SESSION_DAYS), lastSeenAt: nowIso,
    });
    audit(ports, user.id, 'auth.login.success', 'Users', user.id);
  });
  return { token, user: toSessionUser(user) };
}

export function validateSession(ports: Ports, token: string | undefined): SessionUser {
  if (!token) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  const s = ports.repos.sessions.byToken(token);
  const nowIso = ports.now().toISOString();
  if (!s || s.expiresAt < nowIso) fail('UNAUTHORIZED', 'Sessão expirada. Entre novamente.');
  const user = ports.repos.users.byId(s.userId);
  if (!user || !user.active) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  // slide expiry at most once per day (avoid write amplification, spec §5)
  if (s.lastSeenAt < nowIso.slice(0, 10)) {
    ports.lock(() => ports.repos.sessions.update({
      ...s, lastSeenAt: nowIso, expiresAt: addDays(ports.now(), SESSION_DAYS),
    }));
  }
  return toSessionUser(user);
}

export function logout(ports: Ports, token: string): void {
  ports.lock(() => ports.repos.sessions.deleteByToken(token));
}

export function me(ctx: Ctx): SessionUser { return ctx.user; }

export function changePassword(
  ports: Ports, user: SessionUser, payload: { currentPassword: string; newPassword: string },
): void {
  const row = ports.repos.users.byId(user.id);
  if (!row) fail('UNAUTHORIZED', 'Sessão inválida. Entre novamente.');
  const current = requireString(payload.currentPassword, 'senha atual');
  if (!verifyPassword(current, row.salt, row.hashIterations, row.passwordHash))
    fail('VALIDATION', 'Senha atual incorreta.');
  const newPw = requireString(payload.newPassword, 'nova senha');
  const policyError = checkPasswordPolicy(newPw);
  if (policyError) fail('VALIDATION', policyError);
  const salt = ports.uuid();
  ports.lock(() => {
    ports.repos.users.update({
      ...row, salt, hashIterations: DEFAULT_ITERATIONS,
      passwordHash: hashPassword(newPw, salt, DEFAULT_ITERATIONS), mustChangePassword: false,
    });
    ports.repos.sessions.deleteByUserId(row.id); // revoke all sessions (client re-logs)
    audit(ports, user.id, 'auth.changePassword', 'Users', user.id);
  });
}

/** Temp password like "Kxq-4729": readable over WhatsApp, satisfies policy. */
export function generateTempPassword(ports: Ports): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  // ports.randomToken() carries no encoding guarantee (may not be hex, may be too
  // short) — hash it through sha256Hex to get 64 deterministic hex chars. The slight
  // modulo bias from 256 % pool.length is acceptable here: this is a one-time,
  // forced-change temp password, not a long-lived secret.
  const seedHex = sha256Hex(ports.randomToken());
  const pick = (i: number, pool: string) => pool[parseInt(seedHex.slice(i * 2, i * 2 + 2), 16) % pool.length]!;
  const l = (i: number) => pick(i, letters);
  const d = (i: number) => pick(i, '23456789');
  return `${l(0)!.toUpperCase()}${l(1)}${l(2)}-${d(3)}${d(4)}${d(5)}${d(6)}`;
}
export function applyNewPassword(ports: Ports, row: UserRow, tempPassword: string): UserRow {
  const salt = ports.uuid();
  return {
    ...row, salt, hashIterations: DEFAULT_ITERATIONS,
    passwordHash: hashPassword(tempPassword, salt, DEFAULT_ITERATIONS),
    mustChangePassword: true, failedAttempts: 0, lockedUntil: undefined,
  };
}
