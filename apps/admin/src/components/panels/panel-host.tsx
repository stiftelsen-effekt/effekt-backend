import {
  CatchBoundary,
  useNavigate,
  useParams,
  useRouter,
  useRouterState,
  useSearch,
  type AnyRoute,
  type LinkProps,
} from "@tanstack/react-router";
import { Maximize2Icon, XIcon } from "lucide-react";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type React from "react";
import { ErrorState } from "@/components/domain/error-state";
import { Button } from "@/components/ui/button";
import { HotkeyScope, useHotkey } from "@/hooks/use-hotkey";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import {
  matchPanelPath,
  MAX_PANELS,
  panelPath,
  paramNames,
  parsePanels,
  sameEntry,
  serializePanels,
  tokenOf,
  type PanelEntry,
  type PanelKind,
} from "./stack";

/** A record kind and the route whose page component the panel renders. */
export type PanelRoute = PanelKind & { routeId: string };

type PanelsApi = {
  entries: PanelEntry[];
  /** Opens `href` as a panel on top when it's a record page that can be one; else false. */
  open: (href: string) => boolean;
  /** Whether `href` is one of the open panels (the list highlights its row). */
  isOpen: (href: string) => boolean;
  /** Closes the top `count` panels. */
  close: (count?: number) => void;
  closeAll: () => void;
  /** Replaces the stack with the top panel's own page. */
  fullscreen: () => void;
  /**
   * The list under the panels (DataTable with `pageHotkeys`) registers here, so j/k in a
   * single panel step to the next or previous row and swap the panel. Pass null to unregister.
   */
  setListNavigator: (navigator: ListNavigator | null) => void;
};

/**
 * Steps the list's open row by `delta`: the next row's href and element (focus returns to it
 * when the panel closes), or null at either end of the page.
 */
export type ListNavigator = {
  step: (delta: 1 | -1) => { href: string; element?: HTMLElement } | null;
};

const PanelsContext = createContext<PanelsApi | null>(null);

/** The panel stack of the current layout, or null outside one (tests, isolated renders). */
export function usePanels() {
  return useContext(PanelsContext);
}

type RecordContextValue = {
  params: Record<string, string>;
  search: Record<string, unknown>;
  setSearch: (patch: Record<string, unknown>) => void;
};
const RecordContext = createContext<RecordContextValue | null>(null);

/**
 * A detail page's params: the route's own, or the panel's when the page is shown in one.
 * Use instead of `Route.useParams()` in pages that open as panels.
 */
export function useRecordParams<TRoute extends AnyRoute>(
  _route: TRoute,
): TRoute["types"]["allParams"] {
  const record = useContext(RecordContext);
  const params = useParams({ strict: false });
  return (record?.params ?? params) as TRoute["types"]["allParams"];
}

/**
 * A detail page's search params and a setter. On its own route they're the URL's; in a
 * panel they're local to the panel (the URL holds only the stack).
 */
export function useRecordSearch<TRoute extends AnyRoute>(_route: TRoute) {
  type Search = TRoute["types"]["fullSearchSchema"];
  const record = useContext(RecordContext);
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const setSearch = useCallback(
    (patch: Partial<Search>, options: { replace?: boolean } = {}) => {
      if (record) record.setSearch(patch as Record<string, unknown>);
      else
        void navigate({
          search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
          replace: options.replace,
          resetScroll: false,
        } as never);
    },
    [record, navigate],
  );
  return [(record?.search ?? search) as Search, setSearch] as const;
}

type HistoryPanelState = { panelPushes?: number };

/** How long a closing panel stays for its exit animation (--animate-panel-exit). */
const EXIT_MS = 140;

/** Routes whose code-split page component has been loaded for a panel. */
const loadedRoutes = new Set<string>();

type Rendered = { key: string; entry: PanelEntry; index: number };

/**
 * Record pages as stacking panels over the current page. The stack is the `panel` search
 * param (validated by the layout route with `validatePanelParam`), so it survives reload and
 * Back pops one panel. DataTable rows open panels through `usePanels()`; links inside a panel
 * to another record open on top. Wrap the layout's outlet in it.
 */
export function PanelHost({ kinds, children }: { kinds: PanelRoute[]; children: ReactNode }) {
  const router = useRouter();
  const navigate = useNavigate();
  const raw = useSearch({
    strict: false,
    select: (search) => (search as { panel?: unknown }).panel,
  });
  const entries = useMemo(() => parsePanels(raw, kinds), [raw, kinds]);
  const pushes = useRouterState({
    select: (state) => (state.location.state as HistoryPanelState).panelPushes ?? 0,
  });
  const count = entries.length;

  const setStack = useCallback(
    (next: PanelEntry[], { replace, pushes }: { replace: boolean; pushes: number }) =>
      void navigate({
        search: (prev: Record<string, unknown>) => {
          const { panel: _panel, ...rest } = prev;
          const panel = serializePanels(next);
          return panel ? { ...rest, panel } : rest;
        },
        replace,
        resetScroll: false,
        state: (prev: Record<string, unknown>) => ({ ...prev, panelPushes: pushes }),
      } as never),
    [navigate],
  );

  const entryFor = useCallback(
    (href: string): PanelEntry | null => {
      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return null;
      }
      if (url.origin !== window.location.origin) return null;
      const entry = matchPanelPath(url.pathname, kinds);
      if (!entry) return null;
      // A static sibling (/distributions/new) wins over the param route, as in the router.
      const found = router.getMatchedRoutes(url.pathname)[2];
      return found?.id === kinds.find((k) => k.kind === entry.kind)?.routeId ? entry : null;
    },
    [kinds, router],
  );

  // Focus goes into a new panel; closing it puts focus back where it was when it opened.
  const returnFocus = useRef(new Map<number, HTMLElement>());
  const navigator = useRef<ListNavigator | null>(null);
  // The panel swapped in by j/k appears in place, without the slide.
  const swapped = useRef<string | null>(null);

  const close = useCallback(
    (n = 1) => {
      const closing = Math.min(n, count);
      if (closing <= 0) return;
      // Opened here with a history entry each: go back, so Back and close agree.
      if (pushes >= closing) router.history.go(-closing);
      else setStack(entries.slice(0, count - closing), { replace: true, pushes: 0 });
    },
    [count, entries, pushes, router, setStack],
  );

  const api = useMemo<PanelsApi>(
    () => ({
      entries,
      open: (href) => {
        const entry = entryFor(href);
        if (!entry) return false;
        swapped.current = null;
        const existing = entries.findIndex((e) => sameEntry(e, entry));
        if (existing >= 0) {
          close(count - 1 - existing);
          return true;
        }
        if (document.activeElement instanceof HTMLElement)
          returnFocus.current.set(count, document.activeElement);
        void router.preloadRoute({ to: href as LinkProps["to"] }).catch(() => undefined);
        setStack([...entries, entry].slice(-MAX_PANELS), { replace: false, pushes: pushes + 1 });
        return true;
      },
      isOpen: (href) => {
        const entry = entryFor(href);
        return entry !== null && entries.some((e) => sameEntry(e, entry));
      },
      close,
      closeAll: () => close(count),
      fullscreen: () => {
        const top = entries.at(-1);
        if (top) void navigate({ to: panelPath(top, kinds) as LinkProps["to"] });
      },
      setListNavigator: (next) => {
        navigator.current = next;
      },
    }),
    [entries, entryFor, close, count, router, setStack, pushes, navigate, kinds],
  );

  useHotkey("escape", () => close(1), { enabled: count > 0 });
  useHotkey("f", () => api.fullscreen(), { enabled: count > 0 });

  // j/k with one panel open: the next or previous row of the list underneath, in place.
  function step(delta: 1 | -1) {
    const next = navigator.current?.step(delta);
    const entry = next ? entryFor(next.href) : null;
    if (!entry || sameEntry(entry, entries[0]!)) return;
    if (next?.element) returnFocus.current.set(0, next.element);
    swapped.current = `0:${tokenOf(entry)}`;
    setStack([entry], { replace: true, pushes });
  }
  useHotkey("j", () => step(1), { enabled: count === 1 });
  useHotkey("k", () => step(-1), { enabled: count === 1 });

  // Closed panels stay a moment for their exit animation.
  const live = useMemo<Rendered[]>(
    () => entries.map((entry, index) => ({ key: `${index}:${tokenOf(entry)}`, entry, index })),
    [entries],
  );
  const [closing, setClosing] = useState<Rendered[]>([]);
  const previous = useRef(live);
  const exitTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = exitTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);
  useLayoutEffect(() => {
    // A j/k swap replaces the panel in place: the old one leaves without its exit animation.
    const isSwap = swapped.current !== null && live.some((l) => l.key === swapped.current);
    const gone = isSwap ? [] : previous.current.filter((p) => !live.some((l) => l.key === p.key));
    previous.current = live;
    setClosing((current) => [
      ...current.filter((c) => !live.some((l) => l.key === c.key)),
      ...gone.filter((g) => !current.some((c) => c.key === g.key)),
    ]);
    if (gone.length === 0) return;
    // Not cleared when the stack changes again: closing two panels within EXIT_MS must not
    // leave the first one behind.
    const timer = setTimeout(() => {
      exitTimers.current.delete(timer);
      setClosing((current) => current.filter((c) => !gone.some((g) => g.key === c.key)));
    }, EXIT_MS);
    exitTimers.current.add(timer);
  }, [live]);

  // Panels already in the URL when the page loads appear without sliding in.
  const [animate, setAnimate] = useState(false);
  // oxlint-disable-next-line react/set-state-in-effect -- tracks panels leaving to play their exit animation
  useEffect(() => setAnimate(true), []);

  const root = useRef<HTMLDivElement>(null);
  const previousCount = useRef(0);
  const topKey = live.at(-1)?.key;
  useEffect(() => {
    const before = previousCount.current;
    previousCount.current = count;
    const top = root.current?.querySelector<HTMLElement>(`[data-panel-index="${count - 1}"]`);
    if (count >= before && count > 0) {
      top?.focus({ preventScroll: true });
    } else if (count < before) {
      const target = returnFocus.current.get(count);
      for (const depth of Array.from(returnFocus.current.keys()))
        if (depth >= count) returnFocus.current.delete(depth);
      if (target?.isConnected) target.focus({ preventScroll: true });
      else top?.focus({ preventScroll: true });
    }
  }, [count, topKey]);

  // Each panel's own search params (a donor's tab, a statement's period) live here.
  const [panelSearch, setPanelSearch] = useState<Record<string, Record<string, unknown>>>({});

  const rendered = [...live, ...closing.filter((c) => !live.some((l) => l.key === c.key))].sort(
    (a, b) => a.index - b.index,
  );

  return (
    <PanelsContext.Provider value={api}>
      <div ref={root} data-slot="panel-host" className="relative flex min-h-0 flex-1 flex-col">
        <HotkeyScope.Provider value={count === 0}>
          <div className="flex min-h-0 flex-1 flex-col" inert={count > 0 || undefined}>
            {children}
          </div>
        </HotkeyScope.Provider>
        {rendered.length > 0 && (
          <div
            data-slot="panel-stack"
            className={cn(
              "inset-0 z-40 max-lg:fixed lg:absolute",
              "[--panel-gap:0px] [--panel-step:0px]",
              "sm:[--panel-gap:clamp(4rem,9vw,7.5rem)] sm:[--panel-step:1rem]",
            )}
          >
            <div
              aria-hidden
              data-slot="panel-backdrop"
              onClick={() => close(count)}
              className={cn(
                "absolute inset-0 bg-black/10 dark:bg-black/30",
                count === 0 ? "animate-fade-out" : animate && "animate-fade-in",
              )}
            />
            {/* oxlint-disable-next-line react/refs -- a j/k swap (swapped.current) skips the slide-in; state would cost an extra render */}
            {rendered.map((item) => {
              const kind = kinds.find((k) => k.kind === item.entry.kind)!;
              const isClosing = !live.some((l) => l.key === item.key);
              return (
                <Panel
                  key={item.key}
                  kind={kind}
                  entry={item.entry}
                  index={item.index}
                  isTop={!isClosing && item.index === count - 1}
                  isClosing={isClosing}
                  animate={animate && item.key !== swapped.current}
                  canCloseAll={count > 1}
                  onCloseAbove={() => close(count - 1 - item.index)}
                  search={panelSearch[item.key] ?? {}}
                  setSearch={(patch) =>
                    setPanelSearch((all) => ({
                      ...all,
                      [item.key]: { ...all[item.key], ...patch },
                    }))
                  }
                  api={api}
                />
              );
            })}
          </div>
        )}
      </div>
    </PanelsContext.Provider>
  );
}

function Panel({
  kind,
  entry,
  index,
  isTop,
  isClosing,
  animate,
  canCloseAll,
  onCloseAbove,
  search,
  setSearch,
  api,
}: {
  kind: PanelRoute;
  entry: PanelEntry;
  index: number;
  isTop: boolean;
  isClosing: boolean;
  animate: boolean;
  canCloseAll: boolean;
  onCloseAbove: () => void;
  search: Record<string, unknown>;
  setSearch: (patch: Record<string, unknown>) => void;
  api: PanelsApi;
}) {
  const router = useRouter();
  const route = (router.routesById as unknown as Record<string, AnyRoute>)[kind.routeId];
  const Component = route?.options.component as
    (React.ComponentType & { preload?: () => Promise<unknown> }) | undefined;
  const label = kind.label(entry.params);
  // Route components are code-split: load the chunk before rendering it, rather than
  // suspending inside the panel.
  const [loaded, setLoaded] = useState(() => !Component?.preload || loadedRoutes.has(kind.routeId));
  useEffect(() => {
    if (loaded || !Component?.preload) return;
    let current = true;
    void Component.preload().then(() => {
      loadedRoutes.add(kind.routeId);
      if (current) setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [loaded, Component, kind.routeId]);

  const record = useMemo<RecordContextValue>(() => {
    const names = paramNames(kind.path);
    const validate = route?.options.validateSearch;
    return {
      params: Object.fromEntries(names.map((name, i) => [name, entry.params[i] ?? ""])),
      search: typeof validate === "function" ? validate(search) : search,
      setSearch,
    };
    // setSearch is a fresh closure per render of the host; the record only changes with
    // its params or search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, entry, route, search]);

  // Links in the panel to another record open on top instead of leaving the page.
  // Modified clicks (new tab) and other links behave as links.
  function onClickCapture(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download"))
      return;
    if (api.open(anchor.href)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  return (
    <section
      data-slot="panel"
      data-panel-index={isClosing ? undefined : index}
      aria-label={label}
      tabIndex={-1}
      onClickCapture={onClickCapture}
      style={{ left: `calc(var(--panel-gap) + ${index} * var(--panel-step))` }}
      className={cn(
        "absolute inset-y-0 right-0 flex flex-col overflow-hidden border-l border-border bg-background shadow-panel outline-none sm:rounded-l-lg",
        "origin-left transition-[scale] duration-(--duration-panel) ease-out",
        !isTop && !isClosing && "scale-[0.98]",
        isClosing ? "pointer-events-none animate-panel-exit" : animate && "animate-panel-enter",
      )}
    >
      <HotkeyScope.Provider value={isTop}>
        <div className="flex min-h-0 flex-1 flex-col" inert={!isTop || undefined}>
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border pr-2 pl-4">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{label}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={api.fullscreen}
              aria-label={strings.actions.openFullPage}
              title={`${strings.actions.openFullPage} (F)`}
            >
              <Maximize2Icon />
              <span className="max-sm:sr-only">Full page</span>
            </Button>
            {canCloseAll && (
              <Button variant="ghost" size="sm" onClick={api.closeAll}>
                Close all
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => api.close(1)}
              aria-label={strings.actions.close}
              title={`${strings.actions.close} (Esc)`}
            >
              <XIcon />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <CatchBoundary
              getResetKey={() => tokenOf(entry)}
              errorComponent={({ error, reset }) => (
                <ErrorState error={error} onRetry={reset} className="m-6" />
              )}
            >
              <RecordContext.Provider value={record}>
                <Suspense fallback={null}>{Component && loaded ? <Component /> : null}</Suspense>
              </RecordContext.Provider>
            </CatchBoundary>
          </div>
        </div>
      </HotkeyScope.Provider>
      {!isTop && !isClosing && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Back to ${label}`}
          onClick={onCloseAbove}
          className="absolute inset-0 animate-fade-in bg-black/5 transition-colors hover:bg-black/10 dark:bg-black/25 dark:hover:bg-black/15"
        />
      )}
    </section>
  );
}
