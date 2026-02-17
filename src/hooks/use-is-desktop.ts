import { useSyncExternalStore } from "react";

const mdQuery = "(min-width: 768px)";
const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(mdQuery);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
};
const getSnapshot = () => window.matchMedia(mdQuery).matches;
const getServerSnapshot = () => true;

export function useIsDesktop() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
