import {
  useTable,
  type ColumnVisibilityState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { SearchXIcon } from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/domain/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHeader } from "./column-header";
import {
  dataTableFeatures,
  type DataTableColumn,
  type DataTableColumnMeta,
  type DataTableFeatures,
} from "./features";
import { DataTablePagination, type PaginationState } from "./pagination";
import { DataTableViewOptions } from "./view-options";

export type { PaginationState, SortingState, ColumnVisibilityState, RowSelectionState };

type DataTableProps<TData extends RowData> = {
  columns: DataTableColumn<TData>[];
  data: TData[] | undefined;
  /** Total rows on the server, for pagination. */
  rowCount?: number;
  isLoading?: boolean;
  isFetching?: boolean;
  getRowId?: (row: TData, index: number) => string;

  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  pageSizeOptions?: number[];

  columnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;

  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;

  onRowClick?: (row: TData, event: MouseEvent | KeyboardEvent) => void;
  isRowActive?: (row: TData) => boolean;

  toolbar?: ReactNode;
  empty?: ReactNode;
  className?: string;
  /** Height cap for the scroll area that keeps the header sticky. */
  scrollClassName?: string;
};

const emptyRows: never[] = [];

function alignment(meta: DataTableColumnMeta | undefined) {
  const align = meta?.align ?? (meta?.numeric ? "right" : "left");
  return cn(
    align === "right" && "text-right",
    align === "center" && "text-center",
    meta?.numeric && "num",
  );
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  rowCount,
  isLoading = false,
  isFetching = false,
  getRowId,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  pageSizeOptions,
  columnVisibility,
  onColumnVisibilityChange,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
  isRowActive,
  toolbar,
  empty,
  className,
  scrollClassName = "max-h-[calc(100dvh-16rem)] min-h-64",
}: DataTableProps<TData>) {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [localVisibility, setLocalVisibility] = useState<ColumnVisibilityState>({});
  const selectable = rowSelection !== undefined && onRowSelectionChange !== undefined;

  const allColumns = useMemo<DataTableColumn<TData>[]>(
    () => (selectable ? [selectionColumn<TData>(), ...columns] : columns),
    [columns, selectable],
  );

  const sortingState = sorting ?? localSorting;
  const visibilityState = columnVisibility ?? localVisibility;

  const table = useTable({
    features: dataTableFeatures,
    columns: allColumns,
    data: data ?? (emptyRows as TData[]),
    getRowId,
    manualSorting: true,
    enableRowSelection: selectable,
    state: {
      sorting: sortingState,
      columnVisibility: visibilityState,
      rowSelection: rowSelection ?? {},
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sortingState) : updater;
      (onSortingChange ?? setLocalSorting)(next);
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(visibilityState) : updater;
      (onColumnVisibilityChange ?? setLocalVisibility)(next);
    },
    onRowSelectionChange: (updater) => {
      const current = rowSelection ?? {};
      onRowSelectionChange?.(typeof updater === "function" ? updater(current) : updater);
    },
  });

  const rows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  const showSkeleton = isLoading && rows.length === 0;
  const skeletonRows = Math.min(pagination?.pageSize ?? 10, 12);

  function rowProps(row: Row<DataTableFeatures, TData>) {
    if (!onRowClick) return {};
    return {
      tabIndex: 0,
      className:
        "cursor-pointer focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
      onClick: (event: MouseEvent) => onRowClick(row.original, event),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Enter") onRowClick(row.original, event);
      },
    };
  }

  return (
    <div data-slot="data-table" className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        <DataTableViewOptions table={table} />
      </div>

      <div
        className={cn("relative overflow-auto border-t border-border", scrollClassName)}
        aria-busy={isLoading || isFetching}
      >
        {isFetching && !showSkeleton && (
          <div className="sticky top-0 left-0 z-20 h-0.5 w-full overflow-hidden" aria-hidden>
            <div className="h-full w-1/3 animate-progress bg-accent" />
          </div>
        )}
        <Table>
          <TableHeader className="sticky top-0 z-10">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                          ? "descending"
                          : undefined
                      }
                      className={cn(alignment(meta), meta?.headerClassName)}
                    >
                      {header.isPlaceholder ? null : (
                        <SortableHeader header={header}>
                          <table.FlexRender header={header} />
                        </SortableHeader>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={cn(isFetching && !showSkeleton && "opacity-60 transition-opacity")}>
            {showSkeleton ? (
              Array.from({ length: skeletonRows }, (_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: visibleColumnCount }, (_, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton
                        className={cn("h-3.5", cellIndex === 0 ? "w-10" : "w-full max-w-32")}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="h-auto whitespace-normal">
                  {empty ?? (
                    <EmptyState
                      icon={SearchXIcon}
                      title="No results"
                      description="Nothing matches the current filters."
                      compact
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const props = rowProps(row);
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    data-active={isRowActive?.(row.original) || undefined}
                    {...props}
                    className={cn(
                      props.className,
                      "data-[active]:bg-accent-subtle data-[active]:shadow-[inset_2px_0_0_var(--accent)]",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(alignment(meta), meta?.cellClassName)}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && onPaginationChange && (
        <div className="border-t border-border-strong">
          <DataTablePagination
            pagination={pagination}
            rowCount={rowCount ?? data?.length ?? 0}
            onPaginationChange={onPaginationChange}
            pageSizeOptions={pageSizeOptions}
          />
        </div>
      )}
    </div>
  );
}

function selectionColumn<TData extends RowData>(): DataTableColumn<TData> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows on this page"
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
            ? "indeterminate"
            : false
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        onClick={(event) => event.stopPropagation()}
      />
    ),
  };
}
