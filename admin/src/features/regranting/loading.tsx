/**
 * Minimal loading UI for the regranting pages, kept in one place so it can be swapped for the
 * shared delayed-indicator helper when that reaches this branch: nothing for the first ~300 ms,
 * then a quiet value placeholder (labels stay real; no page skeletons).
 */
import { useEffect, useState } from "react";

/** True once `active` has stayed true for `delay` ms. */
export function useDelayedFlag(active: boolean, delay = 300) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);
  return shown;
}

/** Stands in for a value that is loading. Invisible for the first 300 ms. */
export function ValuePlaceholder({ width = "4rem" }: { width?: string }) {
  const shown = useDelayedFlag(true);
  return (
    <span
      data-slot="value-placeholder"
      aria-hidden
      style={{ width }}
      className={
        shown
          ? "inline-block h-[0.9em] animate-pulse rounded-xs bg-muted align-middle"
          : "inline-block h-[0.9em] align-middle"
      }
    />
  );
}

/** Props for a region that is refetching with its old content shown: aria-busy + slight dim. */
export function busyProps(fetching: boolean, delayed: boolean) {
  const busy = fetching && delayed;
  return {
    "aria-busy": busy || undefined,
    className: busy ? "opacity-70 transition-opacity" : "transition-opacity",
  } as const;
}
