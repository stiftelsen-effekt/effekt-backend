import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";
import { formatNumber } from "@/lib/format";
import { strings } from "@/lib/strings";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PaginationState = { pageIndex: number; pageSize: number };

export function DataTablePagination({
  pagination,
  rowCount,
  onPaginationChange,
  pageSizeOptions = [25, 50, 100, 250],
}: {
  pagination: PaginationState;
  rowCount: number;
  onPaginationChange: (next: PaginationState) => void;
  pageSizeOptions?: number[];
}) {
  const { pageIndex, pageSize } = pagination;
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  const first = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(rowCount, (pageIndex + 1) * pageSize);
  const go = (index: number) =>
    onPaginationChange({ pageSize, pageIndex: Math.min(Math.max(index, 0), pageCount - 1) });

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <p className="num text-muted-foreground" aria-live="polite">
        {strings.list.range(formatNumber(first), formatNumber(last), formatNumber(rowCount))}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground max-sm:hidden">{strings.list.rowsPerPage}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPaginationChange({ pageIndex: 0, pageSize: Number(value) })}
          >
            <SelectTrigger size="sm" className="num w-18" aria-label={strings.list.rowsPerPage}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)} className="num">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="First page"
            disabled={pageIndex === 0}
            onClick={() => go(0)}
          >
            <ChevronsLeftIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous page"
            disabled={pageIndex === 0}
            onClick={() => go(pageIndex - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="num min-w-14 text-center text-muted-foreground">
            {formatNumber(pageIndex + 1)} / {formatNumber(pageCount)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next page"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => go(pageIndex + 1)}
          >
            <ChevronRightIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Last page"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => go(pageCount - 1)}
          >
            <ChevronsRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
