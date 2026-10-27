/**
 * Client-side downloads: files the API returns as text (`FilePayload`), and reports the
 * client turns into JSON or CSV.
 */

export type FilePayload = { filename: string; contentType: string; content: string };

/** Saves text as a file through a temporary link. */
export function downloadFile({ filename, contentType, content }: FilePayload) {
  const blob = new Blob([content], { type: contentType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return /[",\r\n;]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows of flat objects as CSV. Columns are the union of keys in first-seen order, so a key
 * missing from early rows still gets a column. Values are written as they are (decimal
 * strings stay exact); nested values become JSON.
 */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
