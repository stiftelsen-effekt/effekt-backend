/**
 * URL-backed list state: filters, sort and paging live in the query string so every view
 * is shareable and bookmarkable, and Back works. Values are encoded as short, readable
 * strings (`?amount=100..500&method=2,5&sort=-timestamp&page=3`).
 *
 * History: every discrete change (a filter applied or removed, a sort, a page) is its own
 * history entry, so Back undoes it. Continuous edits replace the entry instead of piling
 * up: refining a search that's already applied, and repeated changes to the same filter in
 * quick succession (dragging a range, typing a number).
 *
 *   // route file
 *   const donationsList = defineList({
 *     id: "donations",
 *     filters: { q: param.text, amount: param.range, date: param.dateRange, method: param.numberList },
 *     sortable: ["timestamp", "sum", "donor"],
 *     defaultSort: { id: "timestamp", desc: true },
 *   });
 *   export const Route = createFileRoute("/donations")({
 *     validateSearch: donationsList.validateSearch,
 *     component: DonationsPage,
 *   });
 *
 *   // component
 *   const list = useListState(donationsList);
 *   useQuery(trpc.donations.list.queryOptions({ page: list.page - 1, limit: list.pageSize, … }))
 *   <FilterBar list={list}>…</FilterBar>
 *   <DataTable {...list.tableState} … />
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";

export type Codec<T> = {
  decode: (raw: unknown) => T | undefined;
  encode: (value: T | undefined) => string | undefined;
};

/** URL values arrive as strings, or as numbers/booleans when they parse as JSON. */
const str = (raw: unknown) =>
  typeof raw === "string"
    ? raw
    : typeof raw === "number" || typeof raw === "boolean"
    ? String(raw)
    : undefined;

const toNumber = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export type NumberRange = { min?: number; max?: number };
export type DateRangeValue = { from?: string; to?: string };

export const param = {
  text: {
    decode: (raw) => str(raw)?.trim() || undefined,
    encode: (value) => value?.trim() || undefined,
  } satisfies Codec<string>,

  number: {
    decode: (raw) => toNumber(str(raw)),
    encode: (value) => (value === undefined ? undefined : String(value)),
  } satisfies Codec<number>,

  boolean: {
    decode: (raw) =>
      raw === true || raw === "true" ? true : raw === false || raw === "false" ? false : undefined,
    encode: (value) => (value === undefined ? undefined : String(value)),
  } satisfies Codec<boolean>,

  /** "100..500", "100..", "..500" */
  range: {
    decode: (raw) => {
      const [min, max] = (str(raw) ?? "").split("..");
      const value = { min: toNumber(min), max: toNumber(max) };
      return value.min === undefined && value.max === undefined ? undefined : value;
    },
    encode: (value) =>
      value && (value.min !== undefined || value.max !== undefined)
        ? `${value.min ?? ""}..${value.max ?? ""}`
        : undefined,
  } satisfies Codec<NumberRange>,

  /** "2026-01-01..2026-03-31" (inclusive, local dates) */
  dateRange: {
    decode: (raw) => {
      const [from, to] = (str(raw) ?? "").split("..");
      const value = {
        from: from && isoDate.test(from) ? from : undefined,
        to: to && isoDate.test(to) ? to : undefined,
      };
      return value.from || value.to ? value : undefined;
    },
    encode: (value) =>
      value && (value.from || value.to) ? `${value.from ?? ""}..${value.to ?? ""}` : undefined,
  } satisfies Codec<DateRangeValue>,

  numberList: {
    decode: (raw) => {
      const values = (str(raw) ?? "")
        .split(",")
        .map((part) => toNumber(part))
        .filter((value): value is number => value !== undefined);
      return values.length ? values : undefined;
    },
    encode: (value) => (value?.length ? value.join(",") : undefined),
  } satisfies Codec<number[]>,

  /** Comma-separated values, limited to `allowed`. */
  list<const T extends string>(allowed: readonly T[]): Codec<T[]> {
    return {
      decode: (raw) => {
        const values = (str(raw) ?? "")
          .split(",")
          .filter((value): value is T => (allowed as readonly string[]).includes(value));
        return values.length ? values : undefined;
      },
      encode: (value) => (value?.length ? value.join(",") : undefined),
    };
  },

  oneOf<const T extends string>(allowed: readonly T[]): Codec<T> {
    return {
      decode: (raw) => {
        const value = str(raw);
        return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
      },
      encode: (value) => value,
    };
  },
};

// A map of codecs with different value types.
type AnyCodec = Codec<any>;
export type FilterCodecs = Record<string, AnyCodec>;
export type FilterValues<F extends FilterCodecs> = {
  [K in keyof F]?: F[K] extends Codec<infer T> ? T : never;
};

export type ListDefinition<F extends FilterCodecs, S extends string> = {
  id: string;
  filters: F;
  sortable: readonly S[];
  defaultSort: { id: S; desc: boolean };
  defaultPageSize: number;
  pageSizes: number[];
  /** Pass to createFileRoute({ validateSearch }). Keeps only known keys, as URL strings. */
  validateSearch: (raw: Record<string, unknown>) => Record<string, string | number | undefined>;
};

export function defineList<const F extends FilterCodecs, const S extends string>(config: {
  /** Stable id, used as the key for saved views. */
  id: string;
  filters: F;
  sortable: readonly S[];
  defaultSort: { id: NoInfer<S>; desc: boolean };
  defaultPageSize?: number;
  pageSizes?: number[];
}): ListDefinition<F, S> {
  const pageSizes = config.pageSizes ?? [25, 50, 100, 250, 1000];
  const keys = ["page", "size", "sort", ...Object.keys(config.filters)];
  return {
    ...config,
    defaultPageSize: config.defaultPageSize ?? 50,
    pageSizes,
    validateSearch(raw) {
      const out: Record<string, string | number | undefined> = {};
      for (const key of keys) {
        const value = raw[key];
        if (value === undefined || value === null || value === "") continue;
        out[key] = typeof value === "number" ? value : String(value);
      }
      return out;
    },
  };
}

/** Changes to the same filter closer together than this share one history entry. */
const REPEAT_MS = 1000;

export type SortingState = { id: string; desc: boolean }[];
export type PaginationState = { pageIndex: number; pageSize: number };

type LooseNavigate = (options: {
  to: string;
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace?: boolean;
}) => Promise<void>;

export type ListState<F extends FilterCodecs = FilterCodecs, S extends string = string> = {
  id: string;
  filters: FilterValues<F>;
  setFilter: <K extends keyof F & string>(
    key: K,
    value: FilterValues<F>[K] | undefined,
    options?: { replace?: boolean },
  ) => void;
  clearFilters: () => void;
  activeFilterKeys: (keyof F & string)[];
  sort: { id: S; desc: boolean };
  page: number;
  pageSize: number;
  search: Record<string, unknown>;
  applySearch: (search: Record<string, unknown>) => void;
  tableState: {
    sorting: SortingState;
    onSortingChange: (next: SortingState) => void;
    pagination: PaginationState;
    pageSizeOptions: number[];
    onPaginationChange: (next: PaginationState) => void;
  };
};

/**
 * The `sort` URL value after a header click: undefined when the result is the default sort,
 * so the URL stays clean. TanStack's toggle cycle ends by clearing the sort, which here means
 * the default; clearing the default sort itself would change nothing, so that click flips its
 * direction instead. The default column toggles asc ↔ desc on every click; other columns cycle
 * asc/desc → default, as before.
 */
export function sortParam(
  next: SortingState,
  current: { id: string; desc: boolean },
  defaultSort: { id: string; desc: boolean },
): string | undefined {
  const isCurrentDefault = current.id === defaultSort.id && current.desc === defaultSort.desc;
  const target =
    next[0] ?? (isCurrentDefault ? { id: defaultSort.id, desc: !defaultSort.desc } : defaultSort);
  if (target.id === defaultSort.id && target.desc === defaultSort.desc) return undefined;
  return `${target.desc ? "-" : ""}${target.id}`;
}

export function useListState<F extends FilterCodecs, S extends string>(
  list: ListDefinition<F, S>,
): ListState<F, S> {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate() as unknown as LooseNavigate;

  const filters = useMemo(() => {
    const values: Record<string, unknown> = {};
    for (const [key, codec] of Object.entries(list.filters)) {
      const value = codec.decode(raw[key]);
      if (value !== undefined) values[key] = value;
    }
    return values as FilterValues<F>;
  }, [raw, list.filters]);

  const sortRaw = typeof raw.sort === "string" ? raw.sort : undefined;
  const sortId = sortRaw?.replace(/^-/, "");
  const sort =
    sortRaw && sortId && (list.sortable as readonly string[]).includes(sortId)
      ? { id: sortId as S, desc: sortRaw.startsWith("-") }
      : list.defaultSort;
  const pageSize = list.pageSizes.includes(Number(raw.size))
    ? Number(raw.size)
    : list.defaultPageSize;
  const page = Math.max(1, Math.floor(Number(raw.page) || 1));

  const update = useCallback(
    (
      patch: Record<string, string | number | undefined>,
      { resetPage = true, replace = false }: { resetPage?: boolean; replace?: boolean } = {},
    ) =>
      void navigate({
        to: ".",
        replace,
        search: (prev) => {
          const next: Record<string, unknown> = { ...prev, ...patch };
          if (resetPage) delete next.page;
          for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
          return next;
        },
      }),
    [navigate],
  );

  // The last filter change, to fold rapid repeats of one filter into one history entry.
  const lastChange = useRef<{ key: string; at: number } | null>(null);
  const setFilter = useCallback(
    <K extends keyof F & string>(
      key: K,
      value: FilterValues<F>[K] | undefined,
      options?: { replace?: boolean },
    ) => {
      const now = Date.now();
      const last = lastChange.current;
      const repeat = last !== null && last.key === key && now - last.at < REPEAT_MS;
      lastChange.current = { key, at: now };
      update(
        { [key]: list.filters[key]!.encode(value) },
        { replace: options?.replace ?? (repeat && value !== undefined) },
      );
    },
    [list.filters, update],
  );

  const clearFilters = useCallback(
    () => update(Object.fromEntries(Object.keys(list.filters).map((key) => [key, undefined]))),
    [list.filters, update],
  );

  const activeFilterKeys = (Object.keys(filters) as (keyof F & string)[]).filter(
    (key) => key !== "q",
  );

  return {
    id: list.id,
    filters,
    setFilter,
    clearFilters,
    activeFilterKeys,
    sort,
    page,
    pageSize,
    search: raw,
    applySearch: (search) => void navigate({ to: ".", search: () => ({ ...search }) }),
    tableState: {
      sorting: [{ id: sort.id, desc: sort.desc }],
      onSortingChange: (next) => update({ sort: sortParam(next, sort, list.defaultSort) }),
      pagination: { pageIndex: page - 1, pageSize },
      pageSizeOptions: list.pageSizes,
      onPaginationChange: (next) =>
        update(
          {
            page: next.pageIndex === 0 ? undefined : next.pageIndex + 1,
            size: next.pageSize === list.defaultPageSize ? undefined : next.pageSize,
          },
          { resetPage: false },
        ),
    },
  };
}
