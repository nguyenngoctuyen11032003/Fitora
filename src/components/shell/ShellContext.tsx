import { createContext, useContext } from 'react';

export interface ShellState {
  /** True when the BottomNav is shown under the current route (Page adds bottom padding). */
  hasBottomNav: boolean;
}

export const ShellContext = createContext<ShellState>({ hasBottomNav: false });

export function useShell(): ShellState {
  return useContext(ShellContext);
}
