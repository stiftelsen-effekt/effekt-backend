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

/**
 * Typical cell values for `meta.placeholder`, so the first-load rows give each column about
 * its final width and the header doesn't shift when the data arrives.
 */
export const cellPlaceholder = {
  id: "00000",
  name: "Firstname Lastname",
  email: "firstname.lastname@example.org",
  date: "00.00.0000",
  dateTime: "00.00.0000 00:00",
  money: "00 000 kr",
  count: "00",
  kid: "000000000000000",
  word: "Subscribed",
} as const;

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
