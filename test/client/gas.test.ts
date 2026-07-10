import { describe, it, expect, beforeEach } from 'vitest';
import { callApi, ApiError, setTokenProvider, invalidateMasterCache } from '../../src/client/lib/gas';
import { resetMockState } from '../../src/client/lib/mock/server';

// callApi's dev path (import.meta.env.DEV, true under vitest/vite) always routes
// through the in-memory mock — these tests exercise that path end to end.
describe('callApi — dev mock path', () => {
  beforeEach(() => {
    resetMockState();
    setTokenProvider(() => undefined);
  });

  it('resolves a typed result for a successful mock call', async () => {
    const result = await callApi('auth.login', { login: 'sava.admin', password: 'Sava1234' });
    expect(result.token).toBeTruthy();
    expect(result.user).toMatchObject({ login: 'sava.admin', role: 'admin', mustChangePassword: false });
  });

  it('rejects with an ApiError carrying the server pt-BR message on bad credentials', async () => {
    try {
      await callApi('auth.login', { login: 'sava.admin', password: 'senha-errada' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('UNAUTHORIZED');
      // Same generic, credential-agnostic message the real server returns
      // (src/server/services/auth.ts GENERIC_LOGIN_ERROR) — the mock mirrors it verbatim.
      expect((e as ApiError).message).toBe(
        'Usuário ou senha inválidos. Após tentativas repetidas, aguarde 15 minutos.',
      );
    }
  });

  it('rejects with UNAUTHORIZED when a token-required action is called without a token', async () => {
    try {
      await callApi('dashboard.summary', {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe('UNAUTHORIZED');
      expect((e as ApiError).message).toBe('Sessão inválida. Entre novamente.');
    }
  });

  it('succeeds for a token-required action once a valid session token is provided', async () => {
    const { token } = await callApi('auth.login', { login: 'jose', password: 'Senha123' });
    setTokenProvider(() => token);
    const summary = await callApi('dashboard.summary', {});
    expect(summary.openByCity.length).toBeGreaterThan(0);
  });
});

describe('callApi — master-data cache', () => {
  beforeEach(async () => {
    resetMockState();
    invalidateMasterCache();
    const { token } = await callApi('auth.login', { login: 'jose', password: 'Senha123' });
    setTokenProvider(() => token);
    invalidateMasterCache(); // login() would clear it in the app; do it explicitly here
  });

  it('serves a repeated cities.list from cache (same resolved reference, no refetch)', async () => {
    const first = await callApi('cities.list', undefined);
    const second = await callApi('cities.list', undefined);
    // A cache miss builds a fresh array in the mock each call, so identity proves the hit.
    expect(second).toBe(first);
  });

  it('refetches after invalidateMasterCache (fresh reference)', async () => {
    const first = await callApi('cities.list', undefined);
    invalidateMasterCache();
    const second = await callApi('cities.list', undefined);
    expect(second).not.toBe(first);
    expect(second).toEqual(first); // same data, new fetch
  });

  it('a cities.save invalidates the cache so the next cities.list refetches', async () => {
    // admin session — cities.save is admin-only
    const admin = await callApi('auth.login', { login: 'sava.admin', password: 'Sava1234' });
    setTokenProvider(() => admin.token);
    invalidateMasterCache();
    const before = await callApi('cities.list', undefined);
    await callApi('cities.save', { city: { name: 'Nova Cidade Teste' } });
    const after = await callApi('cities.list', undefined);
    expect(after).not.toBe(before);
    expect(after.some(c => c.name === 'Nova Cidade Teste')).toBe(true);
  });
});
