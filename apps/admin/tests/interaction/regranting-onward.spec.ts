import { expect, test } from "@playwright/test";
import { builderFixture, onwardTransferFixture, stubRegrantingApi } from "../regranting-fixtures";

/**
 * The onward block on a paid GiveWell transfer (docs/regranting-downstream.md): each line's
 * status and allocations, and Confirm forwarded prefilled for a pass-through line.
 */
test("a paid GiveWell transfer shows onward status and confirms a pass-through forward", async ({
  page,
}) => {
  const created: unknown[] = [];
  const paidTransfer = {
    ...builderFixture().transfers[0]!,
    currency: "USD",
    amountForeign: "150.03",
    fxRate: "10",
    paidAt: "2026-10-01",
  };
  await stubRegrantingApi(page, {
    overrides: {
      "regranting.rounds.builder": () => ({
        ...builderFixture(),
        round: { ...builderFixture().round, status: "paid", paidAt: "2026-10-01" },
        transfers: [paidTransfer],
      }),
      "regranting.onward.allocations.create": (input) => {
        created.push(input);
        return { allocation: {}, warnings: [], line: { status: "forwarded" } };
      },
    },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto("/regranting/rounds/7");

  const onward = page.getByRole("region", { name: "Onward from transfer #70" });
  await expect(onward).toBeVisible();
  const agf = onward.locator("[data-onward-line='701']");
  const mc = onward.locator("[data-onward-line='702']");
  await expect(agf).toContainText("Partly forwarded");
  await expect(agf).toContainText("Regranting fund");
  await expect(agf).toContainText("IDinsight (external)");
  await expect(agf.getByRole("button", { name: "Confirm forwarded…" })).toHaveCount(0);
  await expect(agf.getByRole("button", { name: "Add grant…" })).toBeVisible();
  await expect(mc).toContainText("Awaiting report");

  // Confirm forwarded: prefilled with the line's recipient and amounts; the keyboard can save
  await mc.getByRole("button", { name: "Confirm forwarded…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/Amount in USD/)).toHaveValue("50.00");
  await expect(dialog.getByLabel(/NOK share of the line/)).toHaveValue("500,00");
  await dialog.getByRole("button", { name: "Confirm forwarded" }).click();
  await expect(dialog.getByText("Enter the date")).toBeVisible();
  await dialog.getByRole("textbox", { name: /Forwarded on/ }).fill("15.10.2026");
  await dialog.getByRole("textbox", { name: /Forwarded on/ }).press("Enter");
  await expect(dialog).toBeHidden();
  expect(created).toEqual([
    {
      transferLineId: 702,
      kind: "grant",
      basis: "reported",
      organizationId: 5,
      externalGranteeId: null,
      projectId: null,
      currency: "USD",
      amountForeign: "50.00",
      amountNok: 500,
      forwardedAt: "2026-10-15",
      reportId: onwardTransferFixture.reportId,
      note: null,
    },
  ]);
});

test("the Awaiting report and Onward reports pages list GiveWell's lines and reports", async ({
  page,
}) => {
  await stubRegrantingApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");

  await page.goto("/regranting/onward");
  const awaiting = page.getByRole("table", { name: "Awaiting report from GiveWell" });
  await expect(awaiting.locator("[data-line='702']")).toContainText("Malaria Consortium");
  await expect(awaiting.locator("[data-line='701']")).toContainText("600,30 kr");

  await page.getByRole("link", { name: "Onward reports" }).first().click();
  const report = page.getByRole("region", { name: "GiveWell grants report October 2026" });
  await expect(report).toContainText("1 allocation");
  await page.getByRole("button", { name: "New report…" }).click();
  await expect(page.getByRole("dialog")).toContainText("New onward report");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
