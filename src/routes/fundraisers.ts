import { Router } from "express";
import { DAO } from "../custom_modules/DAO";
import { DateTime } from "luxon";

export const fundraisersRouter = Router();

fundraisersRouter.get("/list", async (req, res, next) => {
  try {
    const fundraisers = await DAO.fundraisers.getList(0, Number.MAX_SAFE_INTEGER);
    return res.json({
      status: 200,
      content: fundraisers.rows,
    });
  } catch (ex) {
    next(ex);
  }
});

fundraisersRouter.get("/dashboard/:secret", async (req, res, next) => {
  if (!req.params.secret) {
    res.status(400).json({ error: "No secret provided" });
    return;
  }
  const secret = req.params.secret;

  try {
    const transactions = await DAO.fundraisers.getFundraiserTransactionsBySecret(secret, "admin");

    if (!transactions || transactions.length === 0) {
      return res.send("No transactions found for this fundraiser.");
    }

    // Create ASCII dashboard
    const dashboard = generateDashboard(transactions);

    // Set content type and send response
    res.setHeader("Content-Type", "text/html");
    res.send(`
<!DOCTYPE html>
<html>
  <head>
    <style>
      pre {
        white-space: pre;
        overflow-x: auto;
        word-wrap: normal;
        font-family: monospace;
      }
    </style>
  </head>
  <body>
    <pre>${dashboard}</pre>
  </body>
</html>
    `);
  } catch (error) {
    console.error("Error generating fundraiser dashboard:", error);
    res.status(500).send("Error generating fundraiser dashboard");
  }
});

fundraisersRouter.post("/list", async (req, res, next) => {
  try {
    const fundraisers = await DAO.fundraisers.getList(
      req.body.pagination.page,
      req.body.pagination.limit,
      req.body.filter,
      req.body.pagination.sort,
    );
    return res.json({
      status: 200,
      content: fundraisers,
    });
  } catch (ex) {
    next(ex);
  }
});

fundraisersRouter.get("/:id", async (req, res, next) => {
  if (!req.params.id) {
    res.status(400).json({ error: "No ID provided" });
    return;
  }
  if (isNaN(parseInt(req.params.id))) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const fundraiserId = parseInt(req.params.id);

  try {
    const fundraiser = await DAO.fundraisers.getFundraiserByID(fundraiserId);
    if (fundraiser) {
      return res.json({
        status: 200,
        content: fundraiser,
      });
    } else {
      return res.status(404).json({
        status: 404,
        content: "Fundraiser not found",
      });
    }
  } catch (ex) {
    next(ex);
  }
});

/**
 * Generate an ASCII dashboard from transaction data
 */
function generateDashboard(
  transactions: Array<{
    id: number;
    message: string | null;
    name: string | null;
    amount: number;
    date: Date;
    donorName: string | null;
    donorEmail: string | null;
  }>,
): string {
  // Generate header
  const header = `
╔════════════════════════════════════════════════════════════════════════════╗
║                          FUNDRAISER DASHBOARD                              ║
╚════════════════════════════════════════════════════════════════════════════╝
`;

  // Generate statistics section
  const stats = generateStatistics(transactions);

  // Generate daily donations chart
  const chart = generateDonationsChart(transactions);

  // Generate transactions table
  const table = generateTransactionsTable(transactions);

  // Combine all sections
  return `${header}${stats}${chart}${table}`;
}

/**
 * Generate statistics section
 */
function generateStatistics(
  transactions: Array<{
    id: number;
    message: string | null;
    name: string | null;
    amount: number;
    date: Date;
  }>,
): string {
  const totalDonations = transactions.length;
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const avgAmount = totalAmount / totalDonations || 0;
  const maxAmount = Math.max(...transactions.map((t) => t.amount));
  const minAmount = Math.min(...transactions.map((t) => t.amount));

  const firstDate = new Date(Math.min(...transactions.map((t) => new Date(t.date).getTime())));
  const lastDate = new Date(Math.max(...transactions.map((t) => new Date(t.date).getTime())));

  const durationDays =
    Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;
  const amountPerDay = totalAmount / durationDays;
  const donationsPerDay = totalDonations / durationDays;

  return `
╔══════════════════════════════ STATISTICS ═══════════════════════════════╗
║ Total Donations:   ${totalDonations
    .toString()
    .padStart(14)}  │  Total Amount:      ${formatCurrency(totalAmount).padStart(14)} ║
║ Average Donation:  ${formatCurrency(avgAmount).padStart(
    14,
  )}  │  Max Donation:      ${formatCurrency(maxAmount).padStart(14)} ║
║ Min Donation:      ${formatCurrency(minAmount).padStart(14)}  │  Campaign Duration: ${durationDays
    .toString()
    .padStart(14 - 5)} days ║
║ Avg Amount/Day:    ${formatCurrency(amountPerDay).padStart(
    14,
  )}  │  Avg Donations/Day: ${donationsPerDay.toFixed(2).padStart(14)} ║
╚═════════════════════════════════════════════════════════════════════════╝
`;
}

/**
 * Generate ASCII chart of donations per day
 */
function generateDonationsChart(
  transactions: Array<{
    id: number;
    message: string | null;
    name: string | null;
    amount: number;
    date: Date;
  }>,
): string {
  // Group transactions by day
  const dailyTotals = new Map<string, { sum: number; count: number }>();

  transactions.forEach((t) => {
    const date = DateTime.fromJSDate(new Date(t.date)).toFormat("yyyy-MM-dd");
    if (!dailyTotals.has(date)) {
      dailyTotals.set(date, { sum: 0, count: 0 });
    }
    const current = dailyTotals.get(date)!;
    current.sum += t.amount;
    current.count += 1;
    dailyTotals.set(date, current);
  });

  // Get all days in the range, including those with no donations
  const firstDate = new Date(Math.min(...transactions.map((t) => new Date(t.date).getTime())));
  const lastDate = new Date(Math.max(...transactions.map((t) => new Date(t.date).getTime())));

  const durationDays =
    Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) || 1;

  const allDays: string[] = [];
  for (let i = 0; i < durationDays; i++) {
    const day = DateTime.fromJSDate(firstDate).plus({ days: i }).toFormat("yyyy-MM-dd");
    allDays.push(day);
  }

  // Find maximum for scaling
  const maxDailySum = Math.max(...Array.from(dailyTotals.values()).map((v) => v.sum));
  const chartWidth = 50;

  // Build chart
  let chart = `
╔═══════════════════════════════ DONATIONS PER DAY ══════════════════════════════╗
`;

  allDays.forEach((day) => {
    const data = dailyTotals.get(day) ?? { sum: 0, count: 0 };
    const barLength = Math.round((data.sum / maxDailySum) * chartWidth) || 0;
    const bar = "█".repeat(barLength);
    const dayLabel = DateTime.fromJSDate(new Date(day)).toFormat("dd.MM");
    const amountLabel = formatCurrency(data.sum).padStart(14);
    const countLabel = `(${data.count})`;

    chart += `║ ${dayLabel} ${bar.padEnd(chartWidth)} ${amountLabel} ${countLabel.padEnd(6)} ║\n`;
  });

  chart += `╚════════════════════════════════════════════════════════════════════════════════╝
`;

  return chart;
}

/**
 * Generate transaction table
 */
function generateTransactionsTable(
  transactions: Array<{
    id: number;
    message: string | null;
    name: string | null;
    amount: number;
    date: Date;
    donorName: string | null;
    donorEmail: string | null;
  }>,
): string {
  // Headers
  let table = `
╔═════════════════════════════ TRANSACTIONS ═══════════════════════════════════════════════════════════════════════════════════════════════════────────
║ Date        │ Amount        │ Name                          │ Message      
║─────────────┼───────────────┼───────────────────────────────┼──────────────
`;

  // Rows
  transactions.forEach((t) => {
    const id = t.id.toString().padEnd(8);
    const date = DateTime.fromJSDate(new Date(t.date)).toFormat("dd.MM yyyy").padEnd(12);
    const amount = formatCurrency(t.amount).padStart(14);
    const name = (t.name || "Anonymous").slice(0, 29).padEnd(30);
    const message = t.message || "";

    table += `║ ${date}│ ${amount}│ ${name}│ ${message} \n`;
  });

  table += `╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════────────`;

  return table;
}

/**
 * Format currency with two decimal places
 */
function formatCurrency(amount: number): string {
  return `${Intl.NumberFormat("NO-nb", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)} kr`;
}
