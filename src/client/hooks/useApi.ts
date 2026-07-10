/**
 * RPC hooks layered over `lib/gas.ts#callApi`. Centralizes the two cross-cutting
 * behaviors every screen needs: UNAUTHORIZED always ends the session and shows the
 * standard toast exactly once, even if several calls fail UNAUTHORIZED concurrently
 * (session.expire()'s latch — see state/session.ts); every other error surfaces as a
 * toast with the server's own pt-BR message (mutations can opt out via `{silent: true}`
 * to run their own CONFLICT flow).
 */
import { useCallback, useEffect, useState } from 'react';
import type { Actions, ActionName } from '../../shared/actions';
import { ApiError, callApi } from '../lib/gas';
import { useSession, type SessionContextValue } from '../state/session';
import { useToast, type ToastContextValue } from '../state/toasts';
import { t } from '../strings/pt';

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ApiError('INTERNAL', message);
}

/** Shared UNAUTHORIZED/toast handling for both hooks below. Returns the typed error. */
function reportApiError(
  err: unknown,
  session: SessionContextValue,
  toast: ToastContextValue,
  silent?: boolean,
): ApiError {
  const apiError = toApiError(err);
  if (apiError.code === 'UNAUTHORIZED') {
    // expire() is latched: only the call that actually transitions a set session to
    // cleared shows the toast, so N concurrent calls failing UNAUTHORIZED together
    // (e.g. Promise.all of several mutations after the token dies) surface exactly one.
    if (session.expire()) toast.show(t.auth.sessionExpired, 'error');
  } else if (!silent) {
    toast.show(apiError.message, 'error');
  }
  return apiError;
}

export interface UseApiCallResult<R> {
  data?: R;
  loading: boolean;
  error?: ApiError;
  reload(): void;
}

/** Fetches `action` on mount and whenever `deps` changes. */
export function useApiCall<K extends ActionName>(
  action: K,
  payload: Actions[K]['p'],
  deps: unknown[],
): UseApiCallResult<Actions[K]['r']> {
  const session = useSession();
  const toast = useToast();
  const [data, setData] = useState<Actions[K]['r'] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    callApi(action, payload)
      .then(result => {
        if (cancelled) return;
        setData(result);
      })
      .catch(err => {
        if (cancelled) return;
        setError(reportApiError(err, session, toast));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `deps` is caller-controlled by design (mirrors the useEffect deps contract) —
    // `action`/`payload` intentionally aren't auto-tracked beyond what's in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, tick, ...deps]);

  const reload = useCallback(() => setTick(x => x + 1), []);

  return { data, loading, error, reload };
}

export interface UseApiMutationResult<K extends ActionName> {
  run(payload: Actions[K]['p'], opts?: { silent?: boolean }): Promise<Actions[K]['r']>;
  saving: boolean;
}

/** Wraps `action` as an imperative call with a `saving` flag. */
export function useApiMutation<K extends ActionName>(action: K): UseApiMutationResult<K> {
  const session = useSession();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const run = useCallback(
    async (payload: Actions[K]['p'], opts?: { silent?: boolean }): Promise<Actions[K]['r']> => {
      setSaving(true);
      try {
        return await callApi(action, payload);
      } catch (err) {
        throw reportApiError(err, session, toast, opts?.silent);
      } finally {
        setSaving(false);
      }
    },
    [action, session, toast],
  );

  return { run, saving };
}
