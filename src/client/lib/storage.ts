/**
 * localStorage access, guarded. Some webview/iframe contexts (notably WebKit
 * third-party iframes — the GAS webapp is served inside one, spec §6) throw a
 * SecurityError on *any* localStorage access, including just reading the property.
 * safeStorage never lets that reach the caller: availability is probed once and
 * cached, and every call still individually falls back to an in-memory Map so a
 * later surprise failure degrades gracefully instead of throwing.
 */

const memory = new Map<string, string>();
let available: boolean | null = null;

function localStorageAvailable(): boolean {
  if (available !== null) return available;
  try {
    const probeKey = '__sava_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

export const safeStorage = {
  get(key: string): string | undefined {
    if (!localStorageAvailable()) return memory.get(key);
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? undefined : v;
    } catch {
      available = false;
      return memory.get(key);
    }
  },
  set(key: string, value: string): void {
    if (!localStorageAvailable()) { memory.set(key, value); return; }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      available = false;
      memory.set(key, value);
    }
  },
  remove(key: string): void {
    if (!localStorageAvailable()) { memory.delete(key); return; }
    try {
      window.localStorage.removeItem(key);
    } catch {
      available = false;
      memory.delete(key);
    }
  },
};
