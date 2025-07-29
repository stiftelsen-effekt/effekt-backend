// utils/csvExport.js

import { DateTime } from "luxon";

/**
 * Escapes a value for CSV format
 * @param {any} value - The value to escape
 * @returns {string} - The escaped CSV value
 */
const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  // If the value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

/**
 * Formats a date for CSV export
 * @param {Date|string|null} date - The date to format
 * @returns {string} - Formatted date string (YYYY-MM-DD) or empty string
 */
const formatDate = (date) => {
  if (!date) return "";
  if (date instanceof Date) {
    return DateTime.fromJSDate(date).toISO();
  } else {
    const dt = DateTime.fromSQL(date, { locale: "no-NB" });
    return dt.isValid ? dt.toISO() : "";
  }
};

/**
 * Formats a boolean value for CSV export
 * @param {boolean} value - The boolean value
 * @returns {string} - "Yes" or "No"
 */
const formatBoolean = (value) => {
  return value ? "Yes" : "No";
};

/**
 * Generates CSV content from data rows
 * @param {Array<Object>} rows - Array of data objects
 * @param {Array<string>} [headers] - Optional array of header names
 * @param {Object} [formatters] - Optional object mapping field names to formatter functions
 * @returns {string} - Complete CSV content with headers
 */
const generateCsv = (rows, headers = null, formatters = {}) => {
  if (!rows || rows.length === 0) {
    return headers ? headers.join(",") : "";
  }

  // If no headers provided, use keys from first row
  const csvHeaders = headers || Object.keys(rows[0]);

  // Create CSV rows
  const csvRows = [
    csvHeaders.join(","), // Header row
    ...rows.map((row) =>
      csvHeaders
        .map((header) => {
          const value = row[header];

          // Apply custom formatter if provided
          if (formatters[header]) {
            return escapeCsvValue(formatters[header](value));
          }

          // Auto-format common types
          if (value instanceof Date || isValidTimestamp(value)) {
            return escapeCsvValue(formatDate(value));
          }

          if (typeof value === "boolean") {
            return escapeCsvValue(formatBoolean(value));
          }

          return escapeCsvValue(value);
        })
        .join(","),
    ),
  ];

  return csvRows.join("\n");
};

function isValidTimestamp(value) {
  // Require at least YYYY-MM-DD format
  const minDatePattern = /^\d{4}-\d{2}-\d{2}/;

  if (!minDatePattern.test(value)) {
    return false;
  }

  return DateTime.fromSQL(value, { zone: "no-NB" }).isValid;
}

/**
 * Sends CSV as download response
 * @param {Object} res - Express response object
 * @param {string} csvContent - The CSV content to send
 * @param {string} filename - Base filename (without extension)
 */
const sendCsvDownload = (res, csvContent, filename) => {
  const timestamp = new Date().toISOString();
  const fullFilename = `${filename}_${timestamp}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fullFilename}"`);
  res.setHeader("Content-Length", Buffer.byteLength(csvContent, "utf8"));

  // Add BOM for better Excel compatibility
  return res.send("\uFEFF" + csvContent);
};

/**
 * Complete CSV export helper - generates and sends CSV in one call
 * @param {Object} res - Express response object
 * @param {Array<Object>} rows - Array of data objects
 * @param {string} filename - Base filename for download
 * @param {Array<string>} [headers] - Optional custom headers
 * @param {Object} [formatters] - Optional field formatters
 */
export const exportCsv = (res, rows, filename, headers = null, formatters = {}) => {
  const csvContent = generateCsv(rows, headers, formatters);
  return sendCsvDownload(res, csvContent, filename);
};
