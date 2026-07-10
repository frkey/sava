import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('safeStorage', () => {
  beforeEach(() => {
    // availability is memoized per module instance — force a fresh import per test
    // so each scenario (real localStorage vs. throwing localStorage) starts clean.
    vi.resetModules();
  });

  it('roundtrips get/set/remove through real localStorage', async () => {
    window.localStorage.clear();
    const { safeStorage } = await import('../../src/client/lib/storage');

    expect(safeStorage.get('sava.missing')).toBeUndefined();
    safeStorage.set('sava.key', 'v1');
    expect(safeStorage.get('sava.key')).toBe('v1');
    expect(window.localStorage.getItem('sava.key')).toBe('v1'); // actually persisted, not just memory
    safeStorage.remove('sava.key');
    expect(safeStorage.get('sava.key')).toBeUndefined();
    expect(window.localStorage.getItem('sava.key')).toBeNull();
  });

  it('falls back to an in-memory Map when localStorage throws (WebKit iframe case)', async () => {
    const original = window.localStorage;
    const throwing: Storage = {
      length: 0,
      clear: () => { throw new Error('SecurityError: blocked'); },
      getItem: () => { throw new Error('SecurityError: blocked'); },
      key: () => { throw new Error('SecurityError: blocked'); },
      removeItem: () => { throw new Error('SecurityError: blocked'); },
      setItem: () => { throw new Error('SecurityError: blocked'); },
    };
    Object.defineProperty(window, 'localStorage', { value: throwing, configurable: true });

    try {
      const { safeStorage } = await import('../../src/client/lib/storage');

      expect(safeStorage.get('sava.key')).toBeUndefined();
      expect(() => safeStorage.set('sava.key', 'v1')).not.toThrow();
      expect(safeStorage.get('sava.key')).toBe('v1'); // served from the memory fallback
      expect(() => safeStorage.remove('sava.key')).not.toThrow();
      expect(safeStorage.get('sava.key')).toBeUndefined();
    } finally {
      Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
    }
  });
});
