import { describe, it, expect, beforeEach } from 'vitest';
import { fakePorts } from './fakes';
import { hashPassword } from '../src/server/lib/crypto';
import { dispatch, __testRegister } from '../src/server/api/dispatcher';
import type { UserRow } from '../src/server/services/ports';

const ITER = 10;
function seed(p: ReturnType<typeof fakePorts>, over: Partial<UserRow> = {}) {
  p.repos.users.insert({
    id: 'u1', name: 'José', login: 'jose', role: 'regional', active: true,
    mustChangePassword: false, createdAt: '', salt: 's', hashIterations: ITER,
    passwordHash: hashPassword('Senha123', 's', ITER), failedAttempts: 0, ...over,
  });
}
const loginToken = (p: ReturnType<typeof fakePorts>) => {
  const r = dispatch(p, { action: 'auth.login', payload: { login: 'jose', password: 'Senha123' } });
  if (!r.ok) throw new Error('login failed');
  return (r.data as { token: string }).token;
};

describe('dispatch', () => {
  let p: ReturnType<typeof fakePorts>;
  beforeEach(() => {
    p = fakePorts();
    __testRegister('test.echo', 'regional', (_ctx, payload) => payload);
    __testRegister('test.adminOnly', 'admin', () => 'secret');
    __testRegister('test.boom', 'regional', () => { throw new Error('raw internals'); });
  });

  it('login works without token; other actions demand a session', () => {
    seed(p);
    expect(dispatch(p, { action: 'test.echo', payload: 1 }).ok).toBe(false);
    const token = loginToken(p);
    const r = dispatch(p, { token, action: 'test.echo', payload: { x: 1 } });
    expect(r).toEqual({ ok: true, data: { x: 1 } });
  });
  it('unknown action → NOT_FOUND; insufficient role → FORBIDDEN', () => {
    seed(p);
    const token = loginToken(p);
    const nf = dispatch(p, { token, action: 'nope.nope' });
    expect(!nf.ok && nf.error.code).toBe('NOT_FOUND');
    const fb = dispatch(p, { token, action: 'test.adminOnly' });
    expect(!fb.ok && fb.error.code).toBe('FORBIDDEN');
  });
  it('mustChangePassword gates everything except auth.changePassword/me/logout', () => {
    seed(p, { mustChangePassword: true });
    const token = loginToken(p);
    const blocked = dispatch(p, { token, action: 'test.echo', payload: 1 });
    expect(!blocked.ok && blocked.error.code).toBe('FORBIDDEN');
    expect(dispatch(p, { token, action: 'auth.me' }).ok).toBe(true);
  });
  it('unexpected errors become INTERNAL with reference id, raw message hidden', () => {
    seed(p);
    const token = loginToken(p);
    const r = dispatch(p, { token, action: 'test.boom' });
    expect(!r.ok && r.error.code).toBe('INTERNAL');
    expect(!r.ok && r.error.message).not.toContain('raw internals');
    expect(p.auditRows.some(a => a.action === 'error.INTERNAL')).toBe(true);
  });
});
