/**
 * Final review wave, item 5. `ACTION_MIN_ROLE` (src/client/lib/mock/server.ts) is a
 * hand-maintained copy of the real dispatcher's route table (src/server/api/registry.ts,
 * populated via `register()` calls into src/server/api/dispatcher.ts's module-level
 * `routes` map) — the two files can't share code (client and server are separate
 * TypeScript programs, see mock/server.ts's own file header), so nothing at the type
 * level stops them drifting apart. This test makes that drift structurally impossible:
 * it diffs the real route table against the mock's, action-by-action.
 *
 * `__testRoutes()` is a test-only accessor (dispatcher.ts) exposing the module-level
 * `routes` map read-only — importing '../../src/server/api/registry' for its side
 * effects (the `register(...)` calls at its top level) is what actually populates it;
 * dispatcher.ts itself only self-registers the 4 auth.* routes.
 */
import { describe, it, expect } from 'vitest';
import { __testRoutes } from '../../src/server/api/dispatcher';
import '../../src/server/api/registry';
import { ACTION_MIN_ROLE } from '../../src/client/lib/mock/server';

describe('mock/server route parity', () => {
  it('the dev mock exposes exactly the same action set, with the same minRole, as the real dispatcher registry', () => {
    const serverRoutes = __testRoutes();
    // 30 = 26 registered by registry.ts + the 4 auth.* routes dispatcher.ts registers itself.
    expect(serverRoutes.size).toBe(30);

    // 'auth.login' is public on both sides, but — by design, per ACTION_MIN_ROLE's own
    // comment — has no entry in the mock's map (it's handled before any role check, in
    // `mockApi`, exactly mirroring the real dispatcher's `dispatch()`). Added here
    // explicitly so the key-set comparison below still covers all 30 actions.
    const mockRoutes = new Map<string, string>(Object.entries(ACTION_MIN_ROLE));
    expect(mockRoutes.has('auth.login')).toBe(false);
    mockRoutes.set('auth.login', 'public');

    expect(new Set(mockRoutes.keys())).toEqual(new Set(serverRoutes.keys()));
    for (const [action, minRole] of serverRoutes) {
      expect(mockRoutes.get(action), `minRole mismatch for ${action}`).toBe(minRole);
    }
  });
});
