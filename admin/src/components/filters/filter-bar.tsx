import { CheckIcon, ListFilterIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { format as formatDateFns, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useHotkey } from "@/hooks/use-hotkey";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { HistogramRange, NumberRangeInputs, type HistogramBin } from "./histogram-range";
import type { DateRangeValue, ListState, NumberRange } from "./list-state";

/*
 * The filter bar replaces the old filter drawer. Filters are visible as chips in the page,
 * each chip opens its own small editor, and "Add filter" lists the rest. Every filter
 * component is rendered twice by the bar: once as a chip (only when active or being added)
 * and once as an entry in the Add filter menu (only when inactive). That keeps the API to
 * plain children:
 *
 *   <FilterBar list={list} searchPlaceholder="Donor, KID or donation ID" end={<SavedViews list={list} />}>
 *     <RangeFilter field="amount" label="Amount" format="money" histogram={bins} />
 *     <DateRangeFilter field="date" label="Date" />
 *     <OptionsFilter field="method" label="Payment method" options={methods} />
 *   </FilterBar>
 */

type Mode = "chip" | "menu";
// The bar only reads and writes generic values; each filter component knows its own type.
type AnyList = ListState<Record<string, never>, string> & {
  filters: Record<string, unknown>;
  setFilter: (key: string, value: unknown) => void;
};

type FilterBarContextValue = {
  list: AnyList;
  mode: Mode;
  openKey: string | null;
  setOpenKey: (key: string | null) => void;
  /** From the Add filter menu: open this filter's editor once the menu has closed. */
  requestOpen: (key: string) => void;
};

const FilterBarContext = createContext<FilterBarContextValue | null>(null);

function useFilterSlot<T>(field: string) {
  const context = useContext(FilterBarContext);
  if (!context) throw new Error("Filter components must be rendered inside <FilterBar>");
  const value = context.list.filters[field] as T | undefined;
  return {
    mode: context.mode,
    value,
    active: value !== undefined,
    open: context.openKey === field,
    setOpen: (open: boolean) => context.setOpenKey(open ? field : null),
    requestOpen: () => context.requestOpen(field),
    setValue: (next: T | undefined) => context.list.setFilter(field, next),
    clear: () => context.list.setFilter(field, undefined),
  };
}

export function FilterBar({
  list,
  searchField = "q",
  searchPlaceholder = "Search",
  children,
  end,
  className,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: accepts any list definition
  list: ListState<any, any>;
  /** Filter key used for free-text search; null hides the search box. */
  searchField?: string | null;
  searchPlaceholder?: string;
  children?: ReactNode;
  /** Right-aligned controls, e.g. <SavedViews>. */
  end?: ReactNode;
  className?: string;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Opening a chip's editor while the menu is still closing races with the menu's own
  // dismissal and closes the new editor again, so the menu hands the key over on close.
  const pendingOpen = useRef<string | null>(null);
  const requestOpen = (key: string) => {
    pendingOpen.current = key;
  };
  const anyList = list as AnyList;
  const hasFilters = list.activeFilterKeys.length > 0;

  return (
    <div
      data-slot="filter-bar"
      role="search"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {searchField && (
        <SearchBox
          value={anyList.filters[searchField] as string | undefined}
          onChange={(value) => anyList.setFilter(searchField, value)}
          placeholder={searchPlaceholder}
        />
      )}
      <FilterBarContext.Provider
        value={{ list: anyList, mode: "chip", openKey, setOpenKey, requestOpen }}
      >
        {children}
      </FilterBarContext.Provider>
      {children && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              {hasFilters ? <PlusIcon /> : <ListFilterIcon />}
              {hasFilters ? strings.list.filter : strings.list.addFilter}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-52"
            // Focus moves to the new chip's editor, not back to this button.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (pendingOpen.current) {
                setOpenKey(pendingOpen.current);
                pendingOpen.current = null;
              }
            }}
          >
            <DropdownMenuLabel>{strings.list.addFilter}</DropdownMenuLabel>
            <FilterBarContext.Provider
              value={{ list: anyList, mode: "menu", openKey, setOpenKey, requestOpen }}
            >
              {children}
            </FilterBarContext.Provider>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={list.clearFilters}
        >
          {strings.actions.clearAll}
        </Button>
      )}
      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const commit = useDebouncedCallback((next: string) => onChange(next.trim() || undefined), 250);
  useEffect(() => setDraft(value ?? ""), [value]);
  useHotkey("/", () => inputRef.current?.focus());

  return (
    <div className="relative w-full sm:w-72">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={strings.list.search}
        className="pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (draft) {
              setDraft("");
              onChange(undefined);
            } else inputRef.current?.blur();
          }
          if (event.key === "Enter") onChange(draft.trim() || undefined);
        }}
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            onChange(undefined);
          }}
          className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-content-center rounded-xs text-muted-foreground hover:bg-hover hover:text-foreground focus-ring"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : (
        <Kbd className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 max-sm:hidden">
          /
        </Kbd>
      )}
    </div>
  );
}

/** Shared shell for every filter type: chip + popover editor, or a menu entry. */
function FilterShell({
  field,
  label,
  summary,
  active,
  slot,
  editorClassName,
  children,
}: {
  field: string;
  label: string;
  summary: ReactNode;
  active: boolean;
  slot: {
    mode: Mode;
    open: boolean;
    setOpen: (open: boolean) => void;
    requestOpen: () => void;
    clear: () => void;
  };
  editorClassName?: string;
  children: ReactNode;
}) {
  if (slot.mode === "menu") {
    if (active) return null;
    return <DropdownMenuItem onSelect={slot.requestOpen}>{label}</DropdownMenuItem>;
  }
  if (!active && !slot.open) return null;
  return (
    <Popover open={slot.open} onOpenChange={slot.setOpen}>
      <PopoverAnchor asChild>
        <div
          data-slot="filter-chip"
          data-field={field}
          className={cn(
            "flex h-7 items-center rounded-sm border text-sm",
            active ? "border-accent/40 bg-accent-subtle" : "border-dashed border-input",
          )}
        >
          <button
            type="button"
            onClick={() => slot.setOpen(!slot.open)}
            className="flex h-full items-center gap-1 rounded-l-sm pr-1.5 pl-2 focus-ring-inset"
          >
            <span className="text-muted-foreground">{label}</span>
            {active && <span className="num max-w-64 truncate font-semibold">{summary}</span>}
          </button>
          {active && (
            <button
              type="button"
              aria-label={`Remove ${label.toLowerCase()} filter`}
              onClick={slot.clear}
              className="grid h-full w-6 place-content-center rounded-r-sm text-muted-foreground hover:bg-hover hover:text-foreground focus-ring-inset"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className={cn("grid gap-3", editorClassName)}
        aria-label={`${label} filter`}
      >
        <p className="text-sm font-semibold">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

function formatAmount(value: number, format: "money" | "number") {
  return format === "money" ? formatMoney(value) : formatNumber(value);
}

export function summarizeRange(value: NumberRange, format: "money" | "number" = "number") {
  if (value.min !== undefined && value.max !== undefined)
    return `${formatAmount(value.min, format)} – ${formatAmount(value.max, format)}`;
  if (value.min !== undefined) return `≥ ${formatAmount(value.min, format)}`;
  if (value.max !== undefined) return `≤ ${formatAmount(value.max, format)}`;
  return "";
}

/** Amounts, counts, charge days. With `histogram`, shows where the values are. */
export function RangeFilter({
  field,
  label,
  format = "number",
  unit,
  histogram,
}: {
  field: string;
  label: string;
  format?: "money" | "number";
  unit?: string;
  histogram?: HistogramBin[];
}) {
  const slot = useFilterSlot<NumberRange>(field);
  const value = slot.value ?? {};
  const set = (next: NumberRange) =>
    slot.setValue(next.min === undefined && next.max === undefined ? undefined : next);
  return (
    <FilterShell
      field={field}
      label={label}
      active={slot.active}
      slot={slot}
      summary={summarizeRange(value, format)}
    >
      {histogram ? (
        <HistogramRange label={label} bins={histogram} value={value} onChange={set} unit={unit} />
      ) : (
        <NumberRangeInputs label={label} value={value} onChange={set} unit={unit} />
      )}
    </FilterShell>
  );
}

const toIso = (date: Date | undefined) => (date ? formatDateFns(date, "yyyy-MM-dd") : undefined);

export function summarizeDates(value: DateRangeValue) {
  if (value.from && value.to) return `${formatDate(value.from)} – ${formatDate(value.to)}`;
  if (value.from) return `from ${formatDate(value.from)}`;
  if (value.to) return `until ${formatDate(value.to)}`;
  return "";
}

/** Inclusive date ranges, with common presets. */
export function DateRangeFilter({
  field,
  label,
  presets = defaultDatePresets,
}: {
  field: string;
  label: string;
  presets?: { label: string; range: () => DateRangeValue }[];
}) {
  const slot = useFilterSlot<DateRangeValue>(field);
  const value = slot.value;
  return (
    <FilterShell
      field={field}
      label={label}
      active={slot.active}
      slot={slot}
      summary={value ? summarizeDates(value) : ""}
      editorClassName="w-auto"
    >
      <div className="flex gap-3">
        <div className="hidden w-32 flex-col gap-px sm:flex">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              onClick={() => {
                slot.setValue(preset.range());
                slot.setOpen(false);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={{
            from: value?.from ? parseISO(value.from) : undefined,
            to: value?.to ? parseISO(value.to) : undefined,
          }}
          defaultMonth={value?.from ? parseISO(value.from) : undefined}
          onSelect={(range) =>
            slot.setValue(
              range?.from || range?.to
                ? { from: toIso(range.from), to: toIso(range.to) }
                : undefined,
            )
          }
        />
      </div>
    </FilterShell>
  );
}

const iso = (date: Date) => formatDateFns(date, "yyyy-MM-dd");
const defaultDatePresets: { label: string; range: () => DateRangeValue }[] = [
  {
    label: "Today",
    range: () => ({ from: iso(new Date()), to: iso(new Date()) }),
  },
  {
    label: "Last 7 days",
    range: () => ({ from: iso(new Date(Date.now() - 6 * 864e5)), to: iso(new Date()) }),
  },
  {
    label: "This month",
    range: () => {
      const now = new Date();
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    },
  },
  {
    label: "Last month",
    range: () => {
      const now = new Date();
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    },
  },
  {
    label: "This year",
    range: () => {
      const now = new Date();
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
    },
  },
  {
    label: "Last year",
    range: () => {
      const year = new Date().getFullYear() - 1;
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    },
  },
];

export type FilterOption<V extends string | number = string | number> = {
  value: V;
  label: string;
  count?: number;
};

/** Pick one or more values (payment method, status, organization). */
export function OptionsFilter<V extends string | number>({
  field,
  label,
  options,
}: {
  field: string;
  label: string;
  options: FilterOption<V>[];
}) {
  const slot = useFilterSlot<V[]>(field);
  const [query, setQuery] = useState("");
  const selected = new Set(slot.value ?? []);
  const visible = query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const names = options.filter((o) => selected.has(o.value)).map((o) => o.label);
  const summary = names.length <= 2 ? names.join(", ") : `${names.length} selected`;

  function toggle(value: V) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    const ordered = options.map((o) => o.value).filter((v) => next.has(v));
    slot.setValue(ordered.length ? ordered : undefined);
  }

  return (
    <FilterShell
      field={field}
      label={label}
      active={slot.active}
      slot={slot}
      summary={summary}
      editorClassName="w-64 p-2"
    >
      {options.length > 8 && (
        <Input
          value={query}
          placeholder={`Find ${label.toLowerCase()}…`}
          aria-label={`Find ${label.toLowerCase()}`}
          className="h-7"
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <ul className="-mx-1 grid max-h-64 gap-px overflow-y-auto">
        {visible.map((option) => (
          <li key={option.value}>
            <label className="flex h-7 cursor-pointer items-center gap-2.5 rounded-sm px-1.5 text-sm hover:bg-hover">
              <Checkbox
                checked={selected.has(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.count !== undefined && (
                <span className="num text-xs text-muted-foreground">
                  {formatNumber(option.count)}
                </span>
              )}
            </label>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-1.5 py-1 text-sm text-muted-foreground">No matches</li>
        )}
      </ul>
    </FilterShell>
  );
}

/** Yes/no facts (newsletter subscriber, has tax unit). */
export function BooleanFilter({
  field,
  label,
  trueLabel = "Yes",
  falseLabel = "No",
}: {
  field: string;
  label: string;
  trueLabel?: string;
  falseLabel?: string;
}) {
  const slot = useFilterSlot<boolean>(field);
  return (
    <FilterShell
      field={field}
      label={label}
      active={slot.active}
      slot={slot}
      summary={slot.value ? trueLabel : falseLabel}
      editorClassName="w-48 p-2"
    >
      <div className="-mx-1 grid gap-px">
        {[
          { value: true, label: trueLabel },
          { value: false, label: falseLabel },
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => {
              slot.setValue(option.value);
              slot.setOpen(false);
            }}
            className="flex h-7 items-center gap-2 rounded-sm px-1.5 text-left text-sm hover:bg-hover focus-ring-inset"
          >
            <CheckIcon className={cn("size-3.5", slot.value !== option.value && "invisible")} />
            {option.label}
          </button>
        ))}
      </div>
    </FilterShell>
  );
}

/** Exactly one of a few values (how a donor gave to fundraisers). For several, OptionsFilter. */
export function ChoiceFilter<V extends string>({
  field,
  label,
  options,
}: {
  field: string;
  label: string;
  options: readonly { value: V; label: string }[];
}) {
  const slot = useFilterSlot<V>(field);
  return (
    <FilterShell
      field={field}
      label={label}
      active={slot.active}
      slot={slot}
      summary={options.find((option) => option.value === slot.value)?.label ?? ""}
      editorClassName="w-60 p-2"
    >
      <div className="-mx-1 grid gap-px">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              slot.setValue(option.value);
              slot.setOpen(false);
            }}
            className="flex h-7 items-center gap-2 rounded-sm px-1.5 text-left text-sm hover:bg-hover focus-ring-inset"
          >
            <CheckIcon className={cn("size-3.5", slot.value !== option.value && "invisible")} />
            {option.label}
          </button>
        ))}
      </div>
    </FilterShell>
  );
}

/**
 * One exact or partial value that isn't the free-text search: a KID, a donation id, a
 * fundraiser id. Applies on Enter or Apply.
 */
export function TextFilter({
  field,
  label,
  placeholder,
  numeric = false,
}: {
  field: string;
  label: string;
  placeholder?: string;
  /** Digits only: numeric keyboard and tabular figures. */
  numeric?: boolean;
}) {
  const slot = useFilterSlot<string>(field);
  const [draft, setDraft] = useState(slot.value ?? "");
  useEffect(() => setDraft(slot.value ?? ""), [slot.value, slot.open]);
  const apply = () => {
    slot.setValue(draft.trim() || undefined);
    slot.setOpen(false);
  };
  return (
    <FilterShell
      field={field}
      label={label}
      active={slot.active}
      slot={slot}
      summary={slot.value}
      editorClassName="w-64"
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <Input
          value={draft}
          aria-label={label}
          placeholder={placeholder}
          inputMode={numeric ? "numeric" : undefined}
          autoComplete="off"
          className={cn("h-7", numeric && "num")}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" size="sm">
          {strings.actions.apply}
        </Button>
      </form>
    </FilterShell>
  );
}
