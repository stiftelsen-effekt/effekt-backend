import type * as React from "react";
import { cn } from "@/lib/utils";

export const controlClasses = [
  "w-full min-w-0 rounded-sm border border-input bg-background text-sm text-foreground",
  "transition-[color,border-color,box-shadow] outline-none",
  "placeholder:text-muted-foreground",
  "hover:border-border-strong",
  "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
  "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
];

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClasses,
        "h-8 px-2.5",
        "file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-semibold",
        type === "number" && "num",
        className,
      )}
      {...props}
    />
  );
}
