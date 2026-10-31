import { CalendarIcon } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { dateOfDay, dayOf, formatDayText, parseDayText } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { useFieldControl } from "./field";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/*
 * Dates are typed or picked as dd.mm.yyyy (docs/admin-design.md › Money, numbers and dates). Values are
 * YYYY-MM-DD strings; "" means no date. Native <input type="date"> isn't used: its format
 * follows the browser's locale, not Norway's.
 */

type DayTextInputProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  /** YYYY-MM-DD or "" */
  value: string;
  /** Called with YYYY-MM-DD, "" when cleared, or null while the text isn't a date. */
  onValueChange: (value: string | null) => void;
};

/**
 * A text box for one day. Reads "24.10.2026", "24.10.26", "24102026" or "2026-10-24" and
 * normalises to dd.mm.yyyy on blur; text that isn't a date is marked invalid.
 */
export function DayTextInput({
  value,
  onValueChange,
  className,
  onBlur,
  onKeyDown,
  ...props
}: DayTextInputProps) {
  const [text, setText] = useState(formatDayText(value));
  const [invalid, setInvalid] = useState(false);
  // Follow outside changes (calendar picks, presets, resets) unless the text already says it.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- follows outside changes unless the text already says the value
    setText((current) => (parseDayText(current) === value ? current : formatDayText(value)));
    if (value) setInvalid(false);
  }, [value]);

  const commit = (next: string) => {
    if (next.trim() === "") {
      setInvalid(false);
      onValueChange("");
      return;
    }
    const parsed = parseDayText(next);
    setInvalid(parsed === null);
    onValueChange(parsed);
    if (parsed) setText(formatDayText(parsed));
  };

  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd.mm.yyyy"
      value={text}
      aria-invalid={invalid || props["aria-invalid"] ? true : undefined}
      className={cn("num", className)}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = parseDayText(event.target.value);
        // Complete dates apply as they're typed; the rest waits for blur.
        if (parsed && event.target.value.replace(/\D/g, "").length >= 8) {
          setInvalid(false);
          onValueChange(parsed);
        }
      }}
      onBlur={(event) => {
        commit(event.target.value);
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit(event.currentTarget.value);
        onKeyDown?.(event);
      }}
    />
  );
}

/** One day: typed as dd.mm.yyyy, or picked from the calendar button. Use inside a Field. */
export function DateInput({
  value,
  onValueChange,
  id,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  /** YYYY-MM-DD or "" */
  value: string;
  /** YYYY-MM-DD, "" when cleared. Text that isn't a date isn't passed on. */
  onValueChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const field = useFieldControl();
  const [open, setOpen] = useState(false);
  const selected = value ? dateOfDay(value) : undefined;
  return (
    <div data-slot="date-input" className={cn("relative", className)}>
      <DayTextInput
        {...field}
        id={id ?? field.id}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        className="pr-9"
        onValueChange={(next) => {
          if (next !== null) onValueChange(next);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label="Choose date from calendar"
            className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
          >
            <CalendarIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              onValueChange(date ? dayOf(date) : "");
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
