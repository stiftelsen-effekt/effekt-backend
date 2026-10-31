import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { WidgetAction } from "./actions";
import { createInitialState, widgetReducer } from "./reducer";
import { State } from "./state";
import { breakdownOf } from "./flows";

/**
 * The donation widget's state: a reducer (reducer.ts) behind a small store that React reads with
 * useSyncExternalStore. The payment flows (flows.ts) are plain async functions that read the
 * latest state with getState() after each await, which a component's own useReducer state can't
 * give them.
 *
 * One store per widget: _app.page.tsx keeps one for the widget pane for the whole visit (so it
 * remembers the donor's choices across page navigation), and every inline widget block gets its own.
 */
export type WidgetStore = {
  getState: () => State;
  dispatch: (action: WidgetAction) => void;
  subscribe: (listener: () => void) => () => void;
  /** Flows running now, by name (flows.ts `leading`) */
  inFlight: Set<string>;
  /** The latest run of each flow whose older runs' results are dropped (flows.ts `latest`) */
  runs: Map<string, number>;
};

export const createWidgetStore = (initialState: State = createInitialState()): WidgetStore => {
  let state = initialState;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch: (action) => {
      const next = widgetReducer(state, action);
      if (next === state) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    inFlight: new Set(),
    runs: new Map(),
  };
};

const WidgetStoreContext = createContext<WidgetStore | null>(null);

/** Provides `store`, or a new store of its own when none is given (an inline widget) */
export const WidgetStoreProvider: React.FC<{ store?: WidgetStore; children: React.ReactNode }> = ({
  store,
  children,
}) => {
  const [ownStore] = useState(() => store ?? createWidgetStore());
  return (
    <WidgetStoreContext.Provider value={store ?? ownStore}>{children}</WidgetStoreContext.Provider>
  );
};

export const useWidgetStore = (): WidgetStore => {
  const store = useContext(WidgetStoreContext);
  if (!store) throw new Error("The donation widget needs a WidgetStoreProvider");
  return store;
};

export const useWidgetDispatch = () => useWidgetStore().dispatch;

/**
 * Reads from the widget's state and re-renders when that part changes. The selector must return
 * a part of the state or a primitive, not a new object or array (default those outside it).
 */
export const useWidgetSelector = <T,>(selector: (state: State) => T): T => {
  const store = useWidgetStore();
  const snapshot = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, snapshot, snapshot);
};

/**
 * The donation's total with the operations cut, as registered (for the payment panes and the
 * analytics events). Only for panes shown after the cause areas have loaded.
 */
export const useDonationTotal = () => {
  const donation = useWidgetSelector((state) => state.donation);
  const causeAreas = useWidgetSelector((state) => state.layout.causeAreas);
  return breakdownOf(donation, causeAreas ?? []).totalAmount;
};
