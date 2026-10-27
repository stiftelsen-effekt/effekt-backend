/**
 * The import log API returns a page count, not a row count. On the last page the total is
 * exact; before that it is the upper bound (every page full), which is what pagination
 * needs to offer the next page.
 */
export function importLogRowCount(
  pages: number,
  page: number,
  pageSize: number,
  rowsOnPage: number,
) {
  if (pages <= 0) return 0;
  if (page >= pages) return (pages - 1) * pageSize + rowsOnPage;
  return pages * pageSize;
}

/**
 * Splits a log entry's result into the raw file it stored (most imports keep the uploaded
 * file under `file`) and the rest, so the JSON view isn't one huge string.
 */
export function withoutFile(result: unknown): {
  result: unknown;
  file: string | null;
  filename: string | null;
} {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { result, file: null, filename: null };
  }
  const { file, ...rest } = result as Record<string, unknown>;
  const filename = typeof rest.filename === "string" ? rest.filename : null;
  if (typeof file !== "string") return { result, file: null, filename };
  return { result: rest, file, filename };
}
