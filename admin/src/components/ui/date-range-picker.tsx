import { CalendarIcon, XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { DateRange } from "react-day-picker";
import { addDays, dateOfDay, dayOf, formatDayText, osloDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { DayTextInput } from "./date-input";
import { useFieldControl } from "./field";
import { controlClasses } from "./input";
import { Label } from "./label";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type { DateRange };

/** An inclusive range of days as YYYY-MM-DD; either end may be open. */
export type DayRange = { from?: string; to?: string };

export type DateRangePreset = { label: string; range: () => DayRange };

const firstOfMonth = (day: string, monthsBack = 0) => {
  const [y, m] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1 - monthsBack, 1));
  return date.toISOString().slice(0, 10);
};

/** Presets in Oslo days. "To" is today for running periods. */
export const defaultDatePresets: DateRangePreset[] = [
  { label: "Today", range: () => ({ from: osloDay(), to: osloDay() }) },
  { label: "Last 7 days", range: () => ({ from: addDays(osloDay(), -6), to: osloDay() }) },
  { label: "Last 30 days", range: () => ({ from: addDays(osloDay(), -29), to: osloDay() }) },
  { label: "This month", range: () => ({ from: firstOfMonth(osloDay()), to: osloDay() }) },
  {
    label: "Last month",
    range: () => ({
      from: firstOfMonth(osloDay(), 1),
      to: addDays(firstOfMonth(osloDay()), -1),
    }),
  },
  { label: "This year", range: () => ({ from: `${osloDay().slice(0, 4)}-01-01`, to: osloDay() }) },
  {
    label: "Last year",
    range: () => {
      const year = Number(osloDay().slice(0, 4)) - 1;
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    },
  },
];

const monthOf = (day: string | undefined) => {
  const date = day ? dateOfDay(day) : undefined;
  return date && new Date(date.getFullYear(), date.getMonth(), 1);
};

/**
 * The editor behind every date range: typed From / To (dd.mm.yyyy), presets, and a calendar
 * that follows what was typed. Used by DateRangePicker (forms) and the date filter chip.
 */
export function DateRangeEditor({
  value,
  onValueChange,
  onPreset,
  presets = defaultDatePresets,
  numberOfMonths = 2,
}: {
  value: DayRange | undefined;
  onValueChange: (range: DayRange | undefined) => void;
  /** After a preset was applied (e.g. to close the popover). */
  onPreset?: () => void;
  presets?: DateRangePreset[] | false;
  numberOfMonths?: number;
}) {
  const from = value?.from ?? "";
  const to = value?.to ?? "";
  const initialMonth = () => {
    const anchor = monthOf(value?.from) ?? monthOf(value?.to) ?? monthOf(osloDay())!;
    return value?.from || value?.to
      ? anchor
      : new Date(anchor.getFullYear(), anchor.getMonth() - (numberOfMonths - 1), 1);
  };
  const [month, setMonth] = useState<Date>(initialMonth);

  const set = (next: DayRange) =>
    onValueChange(next.from || next.to ? { from: next.from, to: next.to } : undefined);

  // A typed date shows its month.
  const showDay = (day: string, end: "from" | "to") => {
    const target = monthOf(day);
    if (!target) return;
    setMonth(
      end === "to" && numberOfMonths > 1
        ? new Date(target.getFullYear(), target.getMonth() - (numberOfMonths - 1), 1)
        : target,
    );
  };

  return (
    <div className="flex">
      {presets && (
        <div className="hidden w-32 shrink-0 flex-col gap-px border-r border-border p-2 sm:flex">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              onClick={() => {
                const range = preset.range();
                set(range);
                if (range.from) showDay(range.from, "from");
                onPreset?.();
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}
      <div className="grid gap-1">
        <div className="grid grid-cols-2 gap-2 px-3 pt-3">
          <RangeEnd
            label="From"
            value={from}
            onValueChange={(day) => {
              set({ from: day || undefined, to: to || undefined });
              if (day) showDay(day, "from");
            }}
          />
          <RangeEnd
            label="To"
            value={to}
            onValueChange={(day) => {
              set({ from: from || undefined, to: day || undefined });
              if (day) showDay(day, "to");
            }}
          />
        </div>
        <Calendar
          mode="range"
          numberOfMonths={numberOfMonths}
          month={month}
          onMonthChange={setMonth}
          selected={{ from: from ? dateOfDay(from) : undefined, to: to ? dateOfDay(to) : undefined }}
          onSelect={(range) =>
            set({
              from: range?.from ? dayOf(range.from) : undefined,
              to: range?.to ? dayOf(range.to) : undefined,
            })
          }
        />
      </div>
    </div>
  );
}

function RangeEnd({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: string;
  onValueChange: (day: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <DayTextInput
        id={id}
        value={value}
        className="h-7"
        onValueChange={(day) => {
          if (day !== null) onValueChange(day);
        }}
      />
    </div>
  );
}

export function summarizeDayRange(value: DayRange | undefined, placeholder: string) {
  if (!value?.from && !value?.to) return placeholder;
  return `${value.from ? formatDayText(value.from) : "…"} – ${value.to ? formatDayText(value.to) : "…"}`;
}

type DateRangePickerProps = {
  value: DateRange | undefined;
  onValueChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  presets?: DateRangePreset[] | false;
  numberOfMonths?: number;
  className?: string;
  id?: string;
  disabled?: boolean;
};

const toDayRange = (range: DateRange | undefined): DayRange | undefined =>
  range && {
    from: range.from ? dayOf(range.from) : undefined,
    to: range.to ? dayOf(range.to) : undefined,
  };

/** A date range field for forms and reports; lists use the date filter chip. */
export function DateRangePicker({
  value,
  onValueChange,
  placeholder = "Any date",
  presets = defaultDatePresets,
  numberOfMonths = 2,
  className,
  id,
  disabled,
}: DateRangePickerProps) {
  const field = useFieldControl();
  const [open, setOpen] = useState(false);
  const days = toDayRange(value);
  const hasValue = Boolean(days?.from || days?.to);
  const label = summarizeDayRange(days, placeholder);
  // Remount the editor on open so its calendar starts at the current value.
  const [openCount, setOpenCount] = useState(0);
  useEffect(() => {
    if (open) setOpenCount((count) => count + 1);
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id ?? field.id}
            type="button"
            disabled={disabled}
            aria-describedby={field["aria-describedby"]}
            aria-invalid={field["aria-invalid"]}
            data-slot="date-range-trigger"
            className={cn(
              controlClasses,
              "num flex h-control items-center gap-2 px-2.5 text-left data-[state=open]:border-ring",
              hasValue ? "pr-8" : "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <DateRangeEditor
            key={openCount}
            value={days}
            presets={presets}
            numberOfMonths={numberOfMonths}
            onPreset={() => setOpen(false)}
            onValueChange={(range) =>
              onValueChange(
                range && {
                  from: range.from ? dateOfDay(range.from) : undefined,
                  to: range.to ? dateOfDay(range.to) : undefined,
                },
              )
            }
          />
        </PopoverContent>
      </Popover>
      {hasValue && !disabled && (
        <button
          type="button"
          aria-label="Clear dates"
          onClick={() => onValueChange(undefined)}
          className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-content-center rounded-xs text-muted-foreground focus-ring hover:bg-hover hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
