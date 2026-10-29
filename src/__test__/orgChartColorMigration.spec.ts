import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";
import { ORG_CHART_COLORS } from "../custom_modules/orgChartColors";

/**
 * The chart colour migration runs on production on merge, so its shape matters: one additive
 * column, updates on Organizations only, and a deterministic backfill over the palette.
 */
const sql = readFileSync(
  join(__dirname, "../../prisma/migrations/20261029120000_organization_chart_color/migration.sql"),
  "utf8",
);
const statements = sql
  .replace(/--.*$/gm, "")
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim())
  .filter(Boolean);

describe("organization chart colour migration", () => {
  it("only adds a nullable column and updates Organizations", () => {
    const kinds = statements.map((statement) => statement.split(" ")[0]!.toUpperCase());
    expect(kinds).to.deep.equal(["ALTER", "SET", "UPDATE", "SET"]);
    expect(statements[0]).to.equal(
      "ALTER TABLE `Organizations` ADD COLUMN `chart_color` VARCHAR(16) NULL",
    );
    expect(statements[2]).to.match(/^UPDATE `Organizations` AS O /);
    expect(sql).not.to.match(/\b(DROP|MODIFY|RENAME|DELETE|INSERT|TRUNCATE)\b/i);
  });

  it("reads donations without locking them and restores the isolation level", () => {
    expect(statements[1]).to.equal("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");
    expect(statements[3]).to.equal("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  });

  it("ranks by donation volume with an id tie-break and fills only empty colours", () => {
    const update = statements[2]!;
    expect(update).to.include(
      "ROW_NUMBER() OVER (ORDER BY volumes.volume DESC, volumes.ID ASC) AS position",
    );
    expect(update).to.include(
      "SUM(D.sum_confirmed * CA.Percentage_share / 100 * CAO.Percentage_share / 100)",
    );
    expect(update).to.match(/WHERE O\.chart_color IS NULL$/);
  });

  it("hands out the API's palette, in order, and wraps around after it", () => {
    const elt = /ELT\( MOD\(ranked\.position - 1, (\d+)\) \+ 1, (.*?) \)/.exec(statements[2]!);
    expect(elt, "ELT(MOD(position - 1, n) + 1, …)").to.not.equal(null);
    const tokens = elt![2]!.split(",").map((token) => token.trim().replace(/'/g, ""));
    expect(tokens).to.deep.equal([...ORG_CHART_COLORS]);
    expect(Number(elt![1])).to.equal(ORG_CHART_COLORS.length);
    expect(tokens).not.to.include("chart-5"); // "Other"
    expect(tokens.every((token) => token.length <= 16)).to.be.true;
  });
});
