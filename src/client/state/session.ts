/**
 * Client session: restores the token on boot, exposes login/logout/expire, and wires
 * `lib/gas.ts`'s module-level token provider so every `callApi` call carries the
 * current token automatically (spec §3/§6 custom-auth model).
 *
 * Plain .ts (not .tsx): TypeScript requires JSX syntax to live in a .tsx file, so the
 * provider element is built with `createElement` instead.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionUser } from '../../shared/types';
import { callApi, setTokenProvider, invalidateMasterCache } from '../lib/gas';
import { safeStorage } from '../lib/storage';

const TOKEN_KEY = 'sava.token';

export interface SessionContextValue {
  user?: SessionUser;
  booting: boolean;
  login(login: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /**
   * Clears the session (UNAUTHORIZED handling). Latched: returns `true` only for the
   * call that actually transitions a set session to cleared, `false` on any subsequent
   * call while already cleared. This lets callers (useApi.ts's `reportApiError`) show
   * the session-expired toast exactly once even when several concurrent RPCs fail
   * UNAUTHORIZED together. The latch resets on successful login.
   */
  expire(): boolean;
  /**
   * Unconditionally clears the local session (no RPC, no latch). For flows that
   * already know they must force a return to the Login screen and want full control
   * over their own feedback (e.g. ChangePassword's re-login-failure path below) —
   * unlike `expire()`, this doesn't gate on "was a session active", so it can't
   * silently no-op and suppress a toast the caller is about to show.
   */
  clearLocal(): void;
  refreshMe(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | undefined>(undefined);
  const [booting, setBooting] = useState(true);
  const tokenRef = useRef<string | undefined>(undefined);
  const bootStartedRef = useRef(false);
  // Mirrors "is there currently a live session" synchronously (a ref, not state) so
  // `expire()` can answer "did I just transition it?" without waiting on a re-render —
  // see `expire` below.
  const sessionActiveRef = useRef(false);

  // Registered synchronously during render (not inside an effect): React fires child
  // effects before a parent's own effects, so a descendant that fetches on mount
  // (Task 4+ screens via useApiCall) could race an effect-based registration here and
  // read a stale (undefined) token provider. Calling this on every render is cheap and
  // idempotent — it only replaces a closure that reads the current ref value.
  setTokenProvider(() => tokenRef.current);

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    const stored = safeStorage.get(TOKEN_KEY);
    if (!stored) {
      setBooting(false);
      return;
    }
    tokenRef.current = stored;
    callApi('auth.me', undefined)
      .then(u => {
        setUser(u);
        sessionActiveRef.current = true;
      })
      .catch(() => {
        tokenRef.current = undefined;
        safeStorage.remove(TOKEN_KEY);
        setUser(undefined);
      })
      .finally(() => setBooting(false));
  }, []);

  const login = useCallback(async (loginId: string, password: string) => {
    const result = await callApi('auth.login', { login: loginId, password });
    invalidateMasterCache(); // cities.list is role-scoped — drop the previous session's data
    tokenRef.current = result.token;
    safeStorage.set(TOKEN_KEY, result.token);
    setUser(result.user);
    sessionActiveRef.current = true; // resets the expire() latch for the new session
  }, []);

  const logout = useCallback(async () => {
    try {
      await callApi('auth.logout', undefined);
    } catch {
      // best-effort — the client-side session is cleared regardless of server outcome
    }
    tokenRef.current = undefined;
    safeStorage.remove(TOKEN_KEY);
    setUser(undefined);
    sessionActiveRef.current = false;
    invalidateMasterCache();
  }, []);

  const expire = useCallback((): boolean => {
    if (!sessionActiveRef.current) return false;
    sessionActiveRef.current = false;
    tokenRef.current = undefined;
    safeStorage.remove(TOKEN_KEY);
    setUser(undefined);
    invalidateMasterCache();
    return true;
  }, []);

  const clearLocal = useCallback((): void => {
    sessionActiveRef.current = false;
    tokenRef.current = undefined;
    safeStorage.remove(TOKEN_KEY);
    setUser(undefined);
    invalidateMasterCache();
  }, []);

  const refreshMe = useCallback(async () => {
    const u = await callApi('auth.me', undefined);
    setUser(u);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ user, booting, login, logout, expire, clearLocal, refreshMe }),
    [user, booting, login, logout, expire, clearLocal, refreshMe],
  );

  return createElement(SessionContext.Provider, { value }, children);
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
