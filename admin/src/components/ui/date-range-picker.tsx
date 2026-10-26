import {
  endOfMonth,
  endOfYear,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { controlClasses } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type { DateRange };

type Preset = { label: string; range: () => DateRange };

const defaultPresets: Preset[] = [
  { label: "Last 7 days", range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
  { label: "Last 30 days", range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
  {
    label: "This month",
    range: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    label: "Last month",
    range: () => {
      const last = subMonths(new Date(), 1);
      return { from: startOfMonth(last), to: endOfMonth(last) };
    },
  },
  { label: "This year", range: () => ({ from: startOfYear(new Date()), to: new Date() }) },
  {
    label: "Last year",
    range: () => {
      const last = subYears(new Date(), 1);
      return { from: startOfYear(last), to: endOfYear(last) };
    },
  },
];

type DateRangePickerProps = {
  value: DateRange | undefined;
  onValueChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  presets?: Preset[] | false;
  numberOfMonths?: number;
  className?: string;
  id?: string;
  disabled?: boolean;
};

export function DateRangePicker({
  value,
  onValueChange,
  placeholder = "Any date",
  presets = defaultPresets,
  numberOfMonths = 2,
  className,
  id,
  disabled,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const hasValue = Boolean(value?.from || value?.to);
  const label = hasValue
    ? `${value?.from ? formatDate(value.from) : "…"} – ${value?.to ? formatDate(value.to) : "…"}`
    : placeholder;

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
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
        <PopoverContent className="flex w-auto p-0" align="start">
          {presets && (
            <div className="hidden w-36 flex-col gap-px border-r border-border p-2 sm:flex">
              {presets.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal"
                  onClick={() => {
                    onValueChange(preset.range());
                    setOpen(false);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <Calendar
            mode="range"
            selected={value}
            onSelect={onValueChange}
            numberOfMonths={numberOfMonths}
            defaultMonth={value?.from ?? subMonths(new Date(), numberOfMonths - 1)}
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
