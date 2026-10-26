import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type * as React from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";
import { appLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={appLocale.dateFns}
      weekStartsOn={1}
      className={cn("p-3 [--cell:--spacing(8)]", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4 sm:flex-row", defaults.months),
        month: cn("flex w-full flex-col gap-3", defaults.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaults.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "aria-disabled:opacity-40",
          defaults.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "aria-disabled:opacity-40",
          defaults.button_next,
        ),
        month_caption: cn(
          "flex h-7 w-full items-center justify-center px-8",
          defaults.month_caption,
        ),
        caption_label: cn("text-sm font-semibold capitalize select-none", defaults.caption_label),
        month_grid: "w-full border-collapse",
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn(
          "w-(--cell) text-2xs font-semibold text-muted-foreground uppercase select-none",
          defaults.weekday,
        ),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn("group/day relative size-(--cell) p-0 text-center select-none", defaults.day),
        day_button: cn(
          "num grid size-(--cell) place-content-center rounded-sm text-sm transition-colors outline-none",
          "hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        ),
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/85",
        range_start: "rounded-l-sm bg-subtle",
        range_middle:
          "bg-subtle [&>button]:rounded-none [&>button]:bg-transparent! [&>button]:text-foreground! [&>button]:hover:bg-muted!",
        range_end: "rounded-r-sm bg-subtle",
        today: "[&>button]:underline [&>button]:decoration-2 [&>button]:underline-offset-4",
        outside: "text-muted-foreground opacity-60 aria-selected:opacity-100",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeftIcon className={cn("size-4", chevronClass)} {...rest} />
          ) : (
            <ChevronRightIcon className={cn("size-4", chevronClass)} {...rest} />
          ),
      }}
      {...props}
    />
  );
}
