import type * as React from "react";
import { cn } from "@/lib/utils";
import { useFieldControl } from "./field";
import { controlClasses } from "./input";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  const field = useFieldControl();
  return (
    <textarea
      {...field}
      data-slot="textarea"
      className={cn(controlClasses, "field-sizing-content min-h-16 px-2.5 py-1.5", className)}
      {...props}
    />
  );
}
