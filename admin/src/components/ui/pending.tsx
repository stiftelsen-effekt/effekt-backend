import { useEffect, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { cn } from "@/lib/utils";

/*
 * Loading indicators. One rule for all of them: nothing for the first 300 ms
 * (useDelayedFlag), so fast loads don't blink, and once shown they stay briefly so slow ones
 * don't end in a flash.
 *
 *   first load of a section      its real structure with skeleton values (Skeleton, Stat pending…)
 *   parameter change / refetch   previous content stays, dimmed (<Updating>), + the top <ProgressBar>
 *   route change                 previous page stays + the top progress bar, until the next is ready
 *   button action                <Button pending> (its own rule: immediate)
 */

/** A thin accent line that runs while `active` (after the delay). Static under reduced motion. */
export function ProgressBar({ active, className }: { active: boolean; className?: string }) {
  const shown = useDelayedFlag(active);
  return (
    <div
      aria-hidden
      data-slot="progress-bar"
      data-active={shown || undefined}
      className={cn("pointer-events-none h-0.5 w-full overflow-hidden", className)}
    >
      {shown && (
        <div className="h-full w-1/3 animate-progress bg-accent motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
      )}
    </div>
  );
}

/**
 * A region whose content is being replaced (new day, page, filter). Keeps the previous
 * content in place; marks it busy for assistive tech at once and dims it slightly after the
 * delay. Never swaps to skeletons.
 */
export function Updating({
  active,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { active: boolean; children: ReactNode }) {
  const dim = useDelayedFlag(active);
  return (
    <div
      data-slot="updating"
      aria-busy={active || undefined}
      data-updating={dim || undefined}
      className={cn(
        "transition-opacity duration-(--duration-base) data-[updating]:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// "Something on this page is updating": a count of active reporters, read by the app's top
// progress bar, so a parameter change anywhere shows the same indicator as a route change.
let updating = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Report that this component's content is updating (shown by the top progress bar). */
export function useReportUpdating(active: boolean) {
  useEffect(() => {
    if (!active) return;
    updating++;
    emit();
    return () => {
      updating--;
      emit();
    };
  }, [active]);
}

/** Whether anything on the page reports it's updating. */
export function useAnyUpdating() {
  return useSyncExternalStore(
    subscribe,
    () => updating > 0,
    () => false,
  );
}
