import { SearchIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { FilterGroup } from "./filter-panel";

export function TextFilter({
  label,
  value,
  onChange,
  placeholder = "Search…",
  debounce = 300,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  debounce?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? "");
  const commit = useDebouncedCallback(
    (next: string) => onChange(next.trim() || undefined),
    debounce,
  );

  useEffect(() => setDraft(value ?? ""), [value]);

  return (
    <FilterGroup label={label} htmlFor={id} onClear={value ? () => onChange(undefined) : undefined}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          className="pl-8"
          onChange={(event) => {
            setDraft(event.target.value);
            commit(event.target.value);
          }}
        />
      </div>
    </FilterGroup>
  );
}

export type NumberRange = { min?: number; max?: number };

function parseNumber(value: string) {
  if (value.trim() === "") return undefined;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function NumberRangeInputs({
  value,
  onChange,
  unit,
  idPrefix,
}: {
  value: NumberRange;
  onChange: (value: NumberRange) => void;
  unit?: string;
  idPrefix?: string;
}) {
  const [min, setMin] = useState(value.min?.toString() ?? "");
  const [max, setMax] = useState(value.max?.toString() ?? "");
  useEffect(() => setMin(value.min?.toString() ?? ""), [value.min]);
  useEffect(() => setMax(value.max?.toString() ?? ""), [value.max]);

  const commit = () => onChange({ min: parseNumber(min), max: parseNumber(max) });

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <Input
        id={idPrefix ? `${idPrefix}-min` : undefined}
        inputMode="decimal"
        aria-label="Minimum"
        placeholder="Min"
        value={min}
        className="num"
        onChange={(event) => setMin(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && commit()}
      />
      <span className="text-muted-foreground">–</span>
      <div className="relative">
        <Input
          inputMode="decimal"
          aria-label="Maximum"
          placeholder="Max"
          value={max}
          className={cn("num", unit && "pr-9")}
          onChange={(event) => setMax(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && commit()}
        />
        {unit && (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

export function NumberRangeFilter({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: NumberRange;
  onChange: (value: NumberRange) => void;
  unit?: string;
}) {
  const id = useId();
  const active = value.min !== undefined || value.max !== undefined;
  return (
    <FilterGroup
      label={label}
      htmlFor={`${id}-min`}
      onClear={active ? () => onChange({}) : undefined}
    >
      <NumberRangeInputs value={value} onChange={onChange} unit={unit} idPrefix={id} />
    </FilterGroup>
  );
}

export function DateRangeFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateRange | undefined;
  onChange: (value: DateRange | undefined) => void;
}) {
  const id = useId();
  return (
    <FilterGroup
      label={label}
      htmlFor={id}
      onClear={value?.from || value?.to ? () => onChange(undefined) : undefined}
    >
      <DateRangePicker id={id} value={value} onValueChange={onChange} numberOfMonths={2} />
    </FilterGroup>
  );
}

export type MultiSelectOption = { value: string; label: string; count?: number };

export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  searchable = options.length > 8,
}: {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  searchable?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const visible = query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const selected = new Set(value);

  function toggle(optionValue: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(optionValue);
    else next.delete(optionValue);
    onChange(options.map((o) => o.value).filter((v) => next.has(v)));
  }

  return (
    <FilterGroup label={label} onClear={value.length ? () => onChange([]) : undefined}>
      {searchable && (
        <Input
          value={query}
          placeholder={`Find ${label.toLowerCase()}…`}
          aria-label={`Find ${label.toLowerCase()}`}
          className="h-7 text-xs"
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <ul className="grid max-h-56 gap-px overflow-y-auto">
        {visible.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <li key={option.value}>
              <label
                htmlFor={optionId}
                className="flex h-7 cursor-pointer items-center gap-2.5 rounded-sm px-1 text-sm hover:bg-muted"
              >
                <Checkbox
                  id={optionId}
                  checked={selected.has(option.value)}
                  onCheckedChange={(checked) => toggle(option.value, checked === true)}
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.count !== undefined && (
                  <span className="num text-xs text-muted-foreground">
                    {formatNumber(option.count)}
                  </span>
                )}
              </label>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="px-1 py-1 text-xs text-muted-foreground">No matches</li>
        )}
      </ul>
    </FilterGroup>
  );
}
