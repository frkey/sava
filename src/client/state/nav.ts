/**
 * In-app screen routing. SAVA has no URL router (single-page GAS iframe, spec §6) —
 * `Screen` is an in-memory union tracked by NavProvider; `useNav().go()` switches it.
 *
 * Plain .ts (not .tsx): TypeScript requires JSX syntax to live in a .tsx file, so the
 * provider element is built with `createElement` instead.
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { FindingFilters } from '../../shared/types';

export type Screen =
  | { name: 'dashboard' }
  | { name: 'findings'; filters?: FindingFilters }
  | { name: 'finding'; id: string; from?: FindingFilters }
  | { name: 'visit'; visitId?: string }
  | { name: 'admin' }
  | { name: 'indicators' };

export interface NavContextValue {
  screen: Screen;
  go(screen: Screen): void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

const DEFAULT_SCREEN: Screen = { name: 'dashboard' };

export function NavProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>(DEFAULT_SCREEN);
  const go = useCallback((next: Screen) => setScreen(next), []);
  const value = useMemo<NavContextValue>(() => ({ screen, go }), [screen, go]);
  return createElement(NavContext.Provider, { value }, children);
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within a NavProvider');
  return ctx;
}
