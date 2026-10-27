import {
  useTable,
  type ColumnVisibilityState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useRouter, type LinkProps } from "@tanstack/react-router";
import { SearchXIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonText } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDelayedFlag } from "@/hooks/use-delayed-flag";
import { useHotkey } from "@/hooks/use-hotkey";
import { formatNumber } from "@/lib/format";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";
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

export type DataTableProps<TData extends RowData> = {
  /** Names the table for screen readers ("Donations"). */
  label: string;
  columns: DataTableColumn<TData>[];
  data: TData[] | undefined;
  getRowId: (row: TData, index: number) => string;
  /** Total rows on the server, for pagination. */
  rowCount?: number;
  /**
   * First load (no data yet): placeholder rows built from the columns, at the real row height.
   * The only table skeleton; never pass it for a parameter change (keep the previous data).
   */
  isLoading?: boolean;
  /** Refetching or showing the previous data while the next loads: rows dim (after 300 ms). */
  isFetching?: boolean;

  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  pageSizeOptions?: number[];

  columnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (visibility: ColumnVisibilityState) => void;

  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  /** Actions for the selected rows, shown in the footer while anything is selected. */
  selectionActions?: (selectedIds: string[]) => ReactNode;

  /** Go to the row's full page. Enter, or click when there is no peek. */
  onRowOpen?: (row: TData, event: MouseEvent | KeyboardEvent) => void;
  /** Quick look. Click and Space. While a row is peeked, moving the cursor moves the peek. */
  onRowPeek?: (row: TData) => void;
  peekedRowId?: string | null;
  /** ⌘/Ctrl-click and middle-click open this in a new tab. */
  getRowHref?: (row: TData) => string;
  /** Listen for j/k on the whole page (the page's main table only). */
  pageHotkeys?: boolean;

  /** Totals for the current filter, left of the pagination. */
  summary?: ReactNode;
  empty?: ReactNode;
  className?: string;
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

const interactive = "a,button,input,select,textarea,label,[role=checkbox],[role=menuitem]";

/** Sample cell text for the first-load rows, by column position, so rows look like text. */
const textSamples = ["Placeholder name", "Short text", "Longer placeholder text", "Text"];

/** Hovering a row this long preloads its page (the router's link intent delay is 50 ms). */
const ROW_INTENT_MS = 100;

/**
 * The list table. Server-side sort and paging, sticky header, density-aware rows, keyboard
 * navigation (↑/↓ or j/k, Enter opens, Space peeks, x selects), optional peek and selection.
 * Fills its container's height and scrolls inside it.
 */
export function DataTable<TData extends RowData>({
  label,
  columns,
  data,
  getRowId,
  rowCount,
  isLoading = false,
  isFetching = false,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  pageSizeOptions,
  columnVisibility,
  onColumnVisibilityChange,
  rowSelection,
  onRowSelectionChange,
  selectionActions,
  onRowOpen,
  onRowPeek,
  peekedRowId,
  getRowHref,
  pageHotkeys = false,
  summary,
  empty,
  className,
}: DataTableProps<TData>) {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [localVisibility, setLocalVisibility] = useState<ColumnVisibilityState>({});
  const [cursor, setCursor] = useState(0);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const selectable = rowSelection !== undefined && onRowSelectionChange !== undefined;
  const navigable = Boolean(onRowOpen || onRowPeek);

  const allColumns = useMemo<DataTableColumn<TData>[]>(
    () => [...(selectable ? [selectionColumn<TData>()] : []), ...columns, optionsColumn<TData>()],
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
  const visibleColumns = table.getVisibleLeafColumns();
  const visibleColumnCount = visibleColumns.length;
  const showSkeleton = isLoading && rows.length === 0;
  const skeletonRows = Math.min(pagination?.pageSize ?? 12, 14);
  const dimmed = useDelayedFlag(isFetching && !showSkeleton);

  // Hovering or moving the cursor onto a row warms the row's page (its route loader), as
  // link hover does for links.
  const router = useRouter({ warn: false });
  const intentTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function preloadRow(row: TData, delay = ROW_INTENT_MS) {
    const href = getRowHref?.(row);
    if (!href || !router) return;
    clearTimeout(intentTimer.current);
    intentTimer.current = setTimeout(
      () => void router.preloadRoute({ to: href as LinkProps["to"] }).catch(() => undefined),
      delay,
    );
  }
  const cancelPreload = () => clearTimeout(intentTimer.current);
  useEffect(() => cancelPreload, []);
  const selectedIds = Object.keys(rowSelection ?? {}).filter((id) => rowSelection?.[id]);

  // Keep the cursor on the peeked row, and inside the data when it changes.
  useEffect(() => {
    if (peekedRowId == null) return;
    const index = rows.findIndex((row) => row.id === peekedRowId);
    if (index >= 0) setCursor(index);
  }, [peekedRowId, rows]);
  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  function focusRow(index: number) {
    const clamped = Math.min(Math.max(index, 0), rows.length - 1);
    if (clamped < 0) return;
    setCursor(clamped);
    const element = bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[data-row]")[clamped];
    element?.focus({ preventScroll: false });
    element?.scrollIntoView({ block: "nearest" });
    const row = rows[clamped];
    if (row) preloadRow(row.original);
    if (row && peekedRowId != null && onRowPeek) onRowPeek(row.original);
  }

  const focusInside = () => bodyRef.current?.contains(document.activeElement) ?? false;
  useHotkey("j", () => focusRow(focusInside() ? cursor + 1 : cursor), {
    enabled: pageHotkeys && navigable,
  });
  useHotkey("k", () => focusRow(focusInside() ? cursor - 1 : cursor), {
    enabled: pageHotkeys && navigable,
  });

  function onRowKeyDown(event: KeyboardEvent, row: Row<DataTableFeatures, TData>, index: number) {
    if ((event.target as HTMLElement) !== event.currentTarget) return;
    switch (event.key) {
      case "ArrowDown":
      case "j":
        event.preventDefault();
        focusRow(index + 1);
        break;
      case "ArrowUp":
      case "k":
        event.preventDefault();
        focusRow(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusRow(0);
        break;
      case "End":
        event.preventDefault();
        focusRow(rows.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        (onRowOpen ?? ((r: TData) => onRowPeek?.(r)))(row.original, event);
        break;
      case " ":
        event.preventDefault();
        if (onRowPeek) onRowPeek(row.original);
        else onRowOpen?.(row.original, event);
        break;
      case "x":
        if (selectable) {
          event.preventDefault();
          row.toggleSelected();
        }
        break;
    }
  }

  function onRowClick(event: MouseEvent, row: Row<DataTableFeatures, TData>, index: number) {
    if ((event.target as HTMLElement).closest(interactive)) return;
    if (window.getSelection()?.toString()) return; // the person is selecting text to copy
    const href = getRowHref?.(row.original);
    if (href && (event.metaKey || event.ctrlKey)) {
      window.open(href, "_blank", "noopener");
      return;
    }
    setCursor(index);
    if (onRowPeek) onRowPeek(row.original);
    else onRowOpen?.(row.original, event);
  }

  return (
    <div data-slot="data-table" className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div
        className="relative min-h-0 flex-1 overflow-auto border-t border-border max-lg:max-h-[75dvh]"
        aria-busy={isLoading || isFetching}
      >
        <Table aria-label={label} aria-rowcount={rowCount ?? data?.length}>
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
                      {header.column.id === "__options" ? (
                        <DataTableViewOptions table={table} />
                      ) : header.isPlaceholder ? null : (
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
          <TableBody
            ref={bodyRef}
            data-updating={dimmed || undefined}
            className="transition-opacity duration-(--duration-base) data-[updating]:opacity-60"
          >
            {showSkeleton ? (
              Array.from({ length: skeletonRows }, (_, index) => (
                <TableRow
                  key={index}
                  data-placeholder-row
                  className="[tbody>&]:hover:bg-transparent"
                >
                  {visibleColumns.map((column, cellIndex) => {
                    const meta = column.columnDef.meta;
                    const blank = column.id === "__options" || column.id === "select";
                    return (
                      <TableCell
                        key={column.id}
                        className={cn(alignment(meta), meta?.cellClassName)}
                      >
                        {!blank && (
                          <SkeletonText>
                            {meta?.placeholder ??
                              (meta?.numeric
                                ? "00 000"
                                : textSamples[(cellIndex + index) % textSamples.length])}
                          </SkeletonText>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumnCount} className="h-auto whitespace-normal">
                  {empty ?? (
                    <EmptyState
                      icon={SearchXIcon}
                      title={strings.list.noResults}
                      description={strings.list.noResultsHint}
                      size="sm"
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => {
                const peeked = peekedRowId != null && row.id === peekedRowId;
                return (
                  <TableRow
                    key={row.id}
                    data-row
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    data-peeked={peeked || undefined}
                    aria-current={peeked || undefined}
                    tabIndex={navigable ? (index === cursor ? 0 : -1) : undefined}
                    onClick={navigable ? (event) => onRowClick(event, row, index) : undefined}
                    onPointerEnter={getRowHref ? () => preloadRow(row.original) : undefined}
                    onPointerLeave={getRowHref ? cancelPreload : undefined}
                    onKeyDown={navigable ? (event) => onRowKeyDown(event, row, index) : undefined}
                    onFocus={navigable ? () => setCursor(index) : undefined}
                    className={cn(
                      navigable && "cursor-default focus-ring-inset",
                      "data-[peeked]:bg-accent-subtle data-[peeked]:shadow-[inset_2px_0_0_var(--accent)]",
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

      {(pagination || summary || selectedIds.length > 0) && (
        <div
          className={cn(
            "flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-1.5 text-sm",
            selectedIds.length > 0 && "bg-accent-subtle",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            {selectedIds.length > 0 ? (
              <>
                <span className="num font-semibold">
                  {strings.list.selected(formatNumber(selectedIds.length))}
                </span>
                {selectionActions?.(selectedIds)}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRowSelectionChange?.({})}
                  className="text-muted-foreground"
                >
                  <XIcon />
                  {strings.list.clearSelection}
                </Button>
              </>
            ) : (
              summary
            )}
          </div>
          {pagination && onPaginationChange && (
            <DataTablePagination
              pagination={pagination}
              rowCount={rowCount ?? data?.length ?? 0}
              onPaginationChange={onPaginationChange}
              pageSizeOptions={pageSizeOptions}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** "1 240 donations · Sum 1 438 093 kr · Average 1 160 kr" for the table footer. */
export function TableSummary({
  items,
}: {
  items: { label?: string; value: ReactNode; suffix?: string }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
      {items.map((item, index) => (
        <li key={index} className="num whitespace-nowrap">
          {item.label && <span>{item.label} </span>}
          <span className="font-semibold text-foreground">{item.value}</span>
          {item.suffix && <span> {item.suffix}</span>}
        </li>
      ))}
    </ul>
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
        tabIndex={-1}
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
      />
    ),
  };
}

/** Narrow trailing column whose header holds the column visibility menu. */
function optionsColumn<TData extends RowData>(): DataTableColumn<TData> {
  return {
    id: "__options",
    enableSorting: false,
    enableHiding: false,
    header: () => null,
    cell: () => null,
    meta: { headerClassName: "w-10 px-1! text-right", cellClassName: "w-10 px-1!" },
  };
}
