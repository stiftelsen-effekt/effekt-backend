import {
  columnVisibilityFeature,
  createColumnHelper,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";

export type DataTableColumnMeta = {
  /** Right-aligns and applies tabular numerals. Use for money, counts and IDs. */
  numeric?: boolean;
  align?: "left" | "center" | "right";
  /** Label in the column visibility menu when the header isn't a plain string. */
  label?: string;
  headerClassName?: string;
  cellClassName?: string;
  /**
   * Sample text the size of a typical value, for the first-load placeholder rows
   * (default "00 000" for numeric columns, a short phrase otherwise).
   */
  placeholder?: string;
};

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  rowSelectionFeature,
  columnMeta: {} as DataTableColumnMeta,
});

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;

export function createColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}
