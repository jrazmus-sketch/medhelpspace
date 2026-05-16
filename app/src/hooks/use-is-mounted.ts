import { useSyncExternalStore } from "react";

const NOOP = () => () => {};
const getTrue = () => true;
const getFalse = () => false;

/**
 * Returns false on the server / during SSR hydration, true on the client.
 * Replaces the useState(false) + useEffect(() => setMounted(true), []) pattern,
 * which triggers an extra render and trips the react-hooks/set-state-in-effect rule.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(NOOP, getTrue, getFalse);
}
