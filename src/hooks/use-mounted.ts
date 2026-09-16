import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True only after the client has hydrated. Server and the client's first
 * render both report `false`, so anything gated on this never mismatches
 * during hydration — unlike a `useState` + `useEffect` "mounted" flag, this
 * doesn't run afoul of the `react-hooks/set-state-in-effect` lint rule.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
