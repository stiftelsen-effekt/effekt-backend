import type * as React from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";

/** Shared look for every text-like control (input, select trigger, date trigger, textarea). */
export const controlClasses = [
  "w-full min-w-0 rounded-sm border border-input bg-surface text-sm text-foreground",
  "transition-[color,border-color,box-shadow] duration-(--duration-fast) outline-none",
  "placeholder:text-faint-foreground",
  "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
];

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const field = useFieldControl();
  return (
    <input
      {...field}
      type={type}
      data-slot="input"
      className={cn(
        controlClasses,
        "h-control px-2.5",
        "file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-semibold",
        type === "number" && "num",
        className,
      )}
      {...props}
    />
  );
}
