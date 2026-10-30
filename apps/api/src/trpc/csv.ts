import { generateCsv } from "../custom_modules/csvexport";

/** CSV export payload; starts with a BOM like the REST downloads so Excel reads æøå correctly */
export const csvExport = (prefix: string, rows: object[], headers: string[] | null = null) => ({
  filename: `${prefix}-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.csv`,
  csv: "﻿" + generateCsv(rows, headers),
});
