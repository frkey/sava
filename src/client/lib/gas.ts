/**
 * Typed RPC wrapper over the single dispatcher (`api({token, action, payload})`,
 * spec §3/§9). In prod this calls `google.script.run`; in dev (`import.meta.env.DEV`)
 * it calls the in-memory mock (lib/mock/server.ts) with a simulated network delay so
 * loading states stay honest during development.
 */
import type { Envelope, ErrorCode } from '../../shared/types';
import type { Actions, ActionName } from '../../shared/actions';
import { t } from '../strings/pt';

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenProvider = () => string | undefined;
let tokenProvider: TokenProvider = () => undefined;

/** Wired by session state (Task 2) so callApi always sends the current token. */
export function setTokenProvider(fn: TokenProvider): void {
  tokenProvider = fn;
}

/**
 * `google.script.run` client surface actually used here. Declared locally rather
 * than pulling in the full @types/google-apps-script client-side ambient types,
 * which aren't a good fit for a Vite-built SPA.
 */
interface GoogleScriptRunRequest {
  api(request: { token?: string; action: string; payload?: unknown }): void;
}
interface GoogleScriptRun {
  withSuccessHandler(fn: (result: unknown) => void): GoogleScriptRun & GoogleScriptRunRequest;
  withFailureHandler(fn: (error: Error) => void): GoogleScriptRun & GoogleScriptRunRequest;
}
declare global {
  interface Window {
    google?: { script: { run: GoogleScriptRun } };
  }
}

function randomDelayMs(): number {
  return 400 + Math.random() * 400; // 400–800 ms, per plan brief
}

function callProd<K extends ActionName>(action: K, payload: Actions[K]['p'], token: string | undefined): Promise<Actions[K]['r']> {
  return new Promise((resolve, reject) => {
    const run = window.google?.script.run;
    if (!run) {
      reject(new ApiError('INTERNAL', t.errors.gasUnavailable));
      return;
    }
    run
      .withSuccessHandler((result) => {
        const envelope = result as Envelope<Actions[K]['r']>;
        if (envelope.ok) resolve(envelope.data);
        else reject(new ApiError(envelope.error.code, envelope.error.message, envelope.error.details));
      })
      .withFailureHandler((error) => {
        reject(new ApiError('INTERNAL', error?.message || t.errors.unexpected));
      })
      .api({ token, action, payload });
  });
}

async function callDev<K extends ActionName>(action: K, payload: Actions[K]['p'], token: string | undefined): Promise<Actions[K]['r']> {
  await new Promise(resolve => setTimeout(resolve, randomDelayMs()));
  const { mockApi } = await import('./mock/server');
  const envelope = mockApi(action, payload, token);
  if (!envelope.ok) throw new ApiError(envelope.error.code, envelope.error.message, envelope.error.details);
  return envelope.data;
}

/**
 * Client-side cache for the small, stable master-data lists read on nearly every screen.
 * The full round-trip (~1 s on GAS) is skipped when a fresh cached result exists.
 * Correctness guards:
 *  - keyed by action only (both payloads are void); the promise is cached so concurrent
 *    screens dedupe onto one in-flight request;
 *  - `cities.list` is role-scoped server-side (a `local` user sees only their city), so the
 *    cache is cleared whenever the session changes (login/logout — see state/session.ts);
 *  - a successful `cities.save`/`departments.save` clears it, so admin edits show at once;
 *  - a 5-min TTL bounds staleness from another admin's edit;
 *  - a rejected request is evicted so errors never stick.
 */
const CACHEABLE_READS = new Set<ActionName>(['cities.list', 'departments.list']);
const MASTER_MUTATIONS = new Set<ActionName>(['cities.save', 'departments.save']);
const MASTER_TTL_MS = 5 * 60 * 1000;
interface CacheEntry { at: number; promise: Promise<unknown>; }
let masterCache = new Map<string, CacheEntry>();

/** Drop all cached master data. Called on session change and after a master-data mutation. */
export function invalidateMasterCache(): void {
  masterCache = new Map();
}

export async function callApi<K extends ActionName>(action: K, payload: Actions[K]['p']): Promise<Actions[K]['r']> {
  const token = tokenProvider();
  const invoke = () => (import.meta.env.DEV ? callDev(action, payload, token) : callProd(action, payload, token));

  if (CACHEABLE_READS.has(action)) {
    const hit = masterCache.get(action);
    if (hit && Date.now() - hit.at < MASTER_TTL_MS) return hit.promise as Promise<Actions[K]['r']>;
    const promise = invoke();
    masterCache.set(action, { at: Date.now(), promise });
    promise.catch(() => {
      const current = masterCache.get(action);
      if (current && current.promise === promise) masterCache.delete(action);
    });
    return promise;
  }

  const result = await invoke();
  if (MASTER_MUTATIONS.has(action)) invalidateMasterCache();
  return result;
}
