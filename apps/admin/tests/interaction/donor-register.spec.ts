import { expect, test } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";
import { donor, donorKids, registerReference, splitFor } from "../donor-register-fixtures";

/**
 * Registering a donation from the donor page against a stubbed API: the KID comes from the
 * donor's own distributions (most used first), the check step shows the amount in the button,
 * and the donor's donations refetch afterwards.
 */
test("registers on the donor's most used KID with the chosen owner, then refetches", async ({
  page,
}) => {
  const registered: unknown[] = [];
  let donationsCalls = 0;
  await stubAnalysisApi(page, {
    extra: {
      ...registerReference,
      "donors.get": donor,
      "donors.distributionsAggregated": donorKids,
    },
    overrides: {
      "donations.distributions.get": splitFor,
      "donors.donations": () => {
        donationsCalls++;
        return [];
      },
      "donations.register": (input: unknown) => {
        registered.push(input);
        return { donationId: 90001, KID: (input as { KID: string }).KID, newDistribution: false };
      },
    },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto("/donors/569");

  await page.getByRole("button", { name: "Add donation" }).click();
  const dialog = page.getByRole("dialog", { name: "Add donation for Kari Nordmann" });
  const kid = dialog.getByRole("combobox", { name: "KID" });
  // Most used first, with its split in brief
  await expect(kid).toContainText("000569112233445");
  await expect(kid).toContainText("AMF 60 %, GD 40 %");
  await kid.click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await expect(page.getByRole("option").first()).toContainText("12 donations");
  await page.keyboard.press("Escape");

  // Invalid amounts are flagged next to the field and nothing is sent
  await dialog.getByRole("textbox", { name: "Amount" }).fill("100,555");
  await dialog.getByRole("button", { name: "Check" }).click();
  await expect(dialog).toContainText("at most two decimals");
  await expect(dialog).toContainText("Enter the payment date");

  await dialog.getByRole("textbox", { name: "Amount" }).fill("1500,50");
  await dialog.getByRole("textbox", { name: "Payment date" }).fill("20.10.2026");
  await dialog.getByRole("combobox", { name: "Payment method" }).click();
  await page.getByRole("option", { name: "Bank" }).click();
  await dialog.getByRole("combobox", { name: "Data owner" }).click();
  await page.getByRole("option", { name: "Effekt", exact: true }).click();
  await dialog.getByRole("button", { name: "Check" }).click();

  const before = donationsCalls;
  await dialog.getByRole("button", { name: "Register 1 500,50 kr" }).click();
  await expect(dialog).toBeHidden();
  expect(registered).toEqual([
    {
      KID: "000569112233445",
      sum: 1500.5,
      timestamp: "2026-10-19T22:00:00.000Z",
      paymentId: 2,
      paymentExternalRef: null,
      metaOwnerId: 1,
      sendReceipt: true,
    },
  ]);
  await expect(page.getByText("Registered 1 500,50 kr")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open donation" })).toBeVisible();
  await expect.poll(() => donationsCalls).toBeGreaterThan(before);

  // The next registration starts with the owner used last
  await page.getByRole("button", { name: "Add donation" }).click();
  await expect(dialog.getByRole("combobox", { name: "Data owner" })).toHaveText("Effekt");
});
