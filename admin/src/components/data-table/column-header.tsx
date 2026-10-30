import type { Header, RowData } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { DataTableFeatures } from "./features";

export function SortableHeader<TData extends RowData>({
  header,
  children,
}: {
  header: Header<DataTableFeatures, TData, unknown>;
  children: ReactNode;
}) {
  const column = header.column;
  if (!column.getCanSort()) return <>{children}</>;
  const sorted = column.getIsSorted();
  const numeric = column.columnDef.meta?.numeric;
  const Icon =
    sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ChevronsUpDownIcon;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "group/sort -mx-1 inline-flex items-center gap-1 rounded-xs px-1 outline-none",
        "hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        sorted && "text-foreground",
        numeric && "flex-row-reverse",
      )}
    >
      {children}
      <Icon
        className={cn("size-3", !sorted && "opacity-0 group-hover/sort:opacity-60")}
        strokeWidth={2.25}
      />
    </button>
  );
}
