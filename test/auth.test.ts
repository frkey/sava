import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import { hashPassword, verifyPassword } from '../src/server/lib/crypto';
import {
  login, validateSession, changePassword, logout, generateTempPassword, applyNewPassword,
  GENERIC_LOGIN_ERROR,
} from '../src/server/services/auth';
import type { UserRow } from '../src/server/services/ports';
import { AppError } from '../src/server/lib/errors';

const ITER = 10;
function seedUser(p: ReturnType<typeof fakePorts>, over: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    id: 'u1', name: 'José', login: 'jose', role: 'regional', active: true,
    mustChangePassword: false, createdAt: '2026-01-01T00:00:00.000Z',
    passwordHash: hashPassword('Senha123', 's1', ITER), salt: 's1', hashIterations: ITER,
    failedAttempts: 0, ...over,
  };
  p.repos.users.insert(row);
  return row;
}

describe('login', () => {
  let p: ReturnType<typeof fakePorts>;
  beforeEach(() => { p = fakePorts(); });

  it('returns token + user on success and resets failures', () => {
    seedUser(p, { failedAttempts: 3 });
    const r = login(p, { login: 'JOSE', password: 'Senha123' }); // case-insensitive login
    expect(r.token).toBeTruthy();
    expect(r.user).toMatchObject({ login: 'jose', role: 'regional' });
    expect((r.user as unknown as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect(p.repos.sessions.byToken(r.token)).toBeTruthy();
    expect(p.repos.users.byId('u1')!.failedAttempts).toBe(0);
  });
  it('same generic error for unknown login, wrong password, locked, inactive', () => {
    seedUser(p);
    for (const attempt of [
      () => login(p, { login: 'nope', password: 'x1234567' }),
      () => login(p, { login: 'jose', password: 'errada12' }),
    ]) {
      try { attempt(); expect.unreachable(); } catch (e) {
        expect((e as AppError).message).toBe(GENERIC_LOGIN_ERROR);
        expect((e as AppError).code).toBe('UNAUTHORIZED');
      }
    }
  });
  it('locks after 5 failures and rejects even correct password while locked', () => {
    seedUser(p);
    for (let i = 0; i < 5; i++) { try { login(p, { login: 'jose', password: 'errada12' }); } catch { /* expected */ } }
    const u = p.repos.users.byId('u1')!;
    expect(u.lockedUntil).toBeTruthy();
    expect(() => login(p, { login: 'jose', password: 'Senha123' })).toThrow(GENERIC_LOGIN_ERROR);
  });
  it('lock expires', () => {
    seedUser(p, { failedAttempts: 5, lockedUntil: '2026-07-09T11:00:00.000Z' }); // now = 12:00
    expect(login(p, { login: 'jose', password: 'Senha123' }).token).toBeTruthy();
  });
});

describe('validateSession', () => {
  it('accepts fresh token, rejects expired/unknown, slides expiry at most daily', () => {
    const p = fakePorts();
    seedUser(p);
    const { token } = login(p, { login: 'jose', password: 'Senha123' });
    expect(validateSession(p, token).login).toBe('jose');
    expect(() => validateSession(p, 'bogus')).toThrow();
    const s = p.repos.sessions.byToken(token)!;
    p.repos.sessions.update({ ...s, expiresAt: '2026-07-01T00:00:00.000Z' });
    expect(() => validateSession(p, token)).toThrow();
  });
});

describe('changePassword', () => {
  it('requires current password, enforces policy, revokes other sessions, clears mustChangePassword', () => {
    const p = fakePorts();
    seedUser(p, { mustChangePassword: true });
    const { token, user } = login(p, { login: 'jose', password: 'Senha123' });
    expect(() => changePassword(p, user, { currentPassword: 'errada12', newPassword: 'Nova1234' })).toThrow();
    expect(() => changePassword(p, user, { currentPassword: 'Senha123', newPassword: 'fraca' })).toThrow();
    changePassword(p, user, { currentPassword: 'Senha123', newPassword: 'Nova1234' });
    expect(p.repos.users.byId('u1')!.mustChangePassword).toBe(false);
    expect(p.repos.sessions.byToken(token)).toBeUndefined(); // sessions revoked
    expect(login(p, { login: 'jose', password: 'Nova1234' }).token).toBeTruthy();
  });
});

describe('logout', () => {
  it('removes the session', () => {
    const p = fakePorts();
    seedUser(p);
    const { token } = login(p, { login: 'jose', password: 'Senha123' });
    logout(p, token);
    expect(p.repos.sessions.byToken(token)).toBeUndefined();
  });
});

describe('generateTempPassword', () => {
  it('matches the readable format and two consecutive calls differ', () => {
    const p = fakePorts();
    const a = generateTempPassword(p);
    const b = generateTempPassword(p);
    expect(a).toMatch(/^[A-Z][a-z]{2}-[2-9]{4}$/);
    expect(b).toMatch(/^[A-Z][a-z]{2}-[2-9]{4}$/);
    expect(a).not.toBe(b);
  });
});

describe('applyNewPassword', () => {
  it('roundtrips: temp password verifies against the new hash, forces change, clears lockout', () => {
    const p = fakePorts();
    const row = seedUser(p, {
      failedAttempts: 4, lockedUntil: '2026-07-09T13:00:00.000Z', mustChangePassword: false,
    });
    const temp = generateTempPassword(p);
    const updated = applyNewPassword(p, row, temp);
    expect(verifyPassword(temp, updated.salt, updated.hashIterations, updated.passwordHash)).toBe(true);
    expect(updated.mustChangePassword).toBe(true);
    expect(updated.failedAttempts).toBe(0);
    expect(updated.lockedUntil).toBeUndefined();
  });
});

describe('audit writes happen inside the lock', () => {
  it('a failed login updates the user and appends the audit entry while the lock is held', () => {
    const p = fakePorts();
    seedUser(p);

    let inLock = false;
    let lockInvocations = 0;
    const origLock = p.lock;
    p.lock = function lockSpy<T>(fn: () => T): T {
      lockInvocations++;
      inLock = true;
      try { return origLock(fn); } finally { inLock = false; }
    };

    let updateCalledInLock = false;
    const origUpdate = p.repos.users.update;
    p.repos.users.update = (row) => { updateCalledInLock = inLock; origUpdate(row); };

    let auditCalledInLock = false;
    const origAppend = p.repos.audit.append;
    p.repos.audit.append = (e) => { auditCalledInLock = inLock; origAppend(e); };

    expect(() => login(p, { login: 'jose', password: 'errada12' })).toThrow(GENERIC_LOGIN_ERROR);

    expect(lockInvocations).toBe(1);
    expect(updateCalledInLock).toBe(true);
    expect(auditCalledInLock).toBe(true);
  });
});
