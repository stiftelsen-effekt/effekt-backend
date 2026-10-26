import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Plain table primitives. Row height and cell padding come from the density tokens
 * (--row-h, --cell-px), so every table follows the comfortable/compact preference.
 * For data lists use <DataTable>; use these directly only for small static tables.
 */
export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom border-separate border-spacing-0 text-sm", className)}
      {...props}
    />
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

export function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("font-semibold [&_td]:border-t [&_td]:border-border-strong", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "group/row transition-colors duration-(--duration-fast)",
        "[tbody>&]:hover:bg-hover data-[state=selected]:bg-accent-subtle/60",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 border-b border-border-strong bg-surface px-cell text-left align-middle whitespace-nowrap",
        "text-xs font-semibold text-muted-foreground",
        "first:pl-4 last:pr-4 [&:has([role=checkbox])]:w-9 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-row border-b border-border px-cell align-middle whitespace-nowrap",
        "first:pl-4 last:pr-4 [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
