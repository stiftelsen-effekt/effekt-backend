import { Router } from "express";
import apicache from "apicache";
import { DAO } from "../../custom_modules/DAO";

const cache = apicache.middleware;

export const donationsByOrgRouter = Router();

/**
 * GET /reports/donationsbyorg
 *
 * Returns monthly aggregate donations by organization in CSV format.
 * Designed for Google Sheets IMPORTDATA function.
 *
 * Cached for 1 hour. Includes all donations up to now.
 */
donationsByOrgRouter.get("/", cache("1 hour"), async (req, res, next) => {
  try {
    const data = await DAO.donations.getMonthlyAggregateByOrganization();

    // Build CSV content
    const headers = ["Year", "Month", "Charity", "Amount (NOK)", "Cause"];
    const rows = data.map((row) =>
      [row.Year, row.Month, escapeCsvValue(row.Charity), row.Amount, row.Cause].join(","),
    );

    const csv = [headers.join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(csv);
  } catch (ex) {
    next(ex);
  }
});

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
