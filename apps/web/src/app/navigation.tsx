import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Tab } from '../components/TabBar';

export type Route =
  | { name: Tab }
  | { name: 'habit'; id: string }
  | { name: 'invite'; habitId: string | null }
  | { name: 'join'; token: string }
  | { name: 'requests' }
  | { name: 'archive' };

interface Navigation {
  tab: Tab;
  route: Route;
  canGoBack: boolean;
  /** Window scroll of the tab root when the first screen was pushed over it. */
  rootScroll: number;
  push: (route: Route) => void;
  back: () => void;
  switchTab: (tab: Tab) => void;
}

const NavigationContext = createContext<Navigation | null>(null);

/**
 * In-memory navigation: three tab roots plus a stack of pushed screens. No URL routing, because
 * Telegram keeps its launch parameters in the URL and the back button is Telegram's own.
 */
export function NavigationProvider({ initial, children }: { initial: { tab: Tab; stack: Route[] }; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const rootScroll = useRef(0);
  const depth = state.stack.length;
  const push = useCallback(
    (route: Route) => {
      // Read before the root gets hidden and the page shrinks.
      if (depth === 0) rootScroll.current = window.scrollY;
      setState((s) => ({ ...s, stack: [...s.stack, route] }));
    },
    [depth],
  );
  const back = useCallback(() => setState((s) => ({ ...s, stack: s.stack.slice(0, -1) })), []);
  const switchTab = useCallback((tab: Tab) => {
    rootScroll.current = 0;
    setState({ tab, stack: [] });
  }, []);
  const value = useMemo<Navigation>(
    () => ({
      tab: state.tab,
      route: state.stack.at(-1) ?? { name: state.tab },
      canGoBack: state.stack.length > 0,
      rootScroll: rootScroll.current,
      push,
      back,
      switchTab,
    }),
    [state, push, back, switchTab],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): Navigation {
  const nav = useContext(NavigationContext);
  if (!nav) throw new Error('useNavigation outside NavigationProvider');
  return nav;
}
