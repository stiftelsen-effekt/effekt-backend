import { useEffect, useRef, useState } from "react";

/**
 * How long something may take before we say it's loading. Loads that finish sooner show no
 * indicator at all, so fast pages don't blink. The CSS twin is `--delay-pending` in app.css
 * (skeletons reveal themselves after it without JavaScript).
 */
export const PENDING_DELAY_MS = 300;

/** Once shown, an indicator stays at least this long, so a slow load doesn't end in a blink. */
export const PENDING_MIN_MS = 400;

/**
 * `active`, but only once it has been true for `delay` ms; once on, it stays on for at least
 * `minDuration` ms. Drives every loading indicator (progress bar, dimming of updating regions)
 * so loads under ~300 ms show nothing.
 *
 *   const show = useDelayedFlag(query.isFetching);
 */
export function useDelayedFlag(
  active: boolean,
  { delay = PENDING_DELAY_MS, minDuration = PENDING_MIN_MS } = {},
): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active && !shown) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, delay);
      return () => clearTimeout(timer);
    }
    if (!active && shown) {
      const remaining = minDuration - (Date.now() - shownAt.current);
      if (remaining <= 0) {
        setShown(false);
        return;
      }
      const timer = setTimeout(() => setShown(false), remaining);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [active, shown, delay, minDuration]);

  return shown;
}
