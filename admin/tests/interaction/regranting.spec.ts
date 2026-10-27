import { expect, test, type Page } from "@playwright/test";
import { builderFixture, stubRegrantingApi } from "../regranting-fixtures";

/** The round builder against a stubbed API: local Pay now edits and the Include direct switch. */
async function openBuilder(page: Page, overrides = {}) {
  await stubRegrantingApi(page, { overrides });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto("/regranting/rounds/7");
  await expect(page.getByRole("heading", { name: "Step 2 · Payments by payee" })).toBeVisible();
}

test("editing Pay now updates carries over, the payee and round totals, and asks before saving", async ({
  page,
}) => {
  await openBuilder(page);
  const total = page.getByTestId("round-total");
  await expect(total).toHaveText("1 500,30 kr");
  await expect(page.getByTestId("carries-1:")).toHaveText("0 kr");

  const input = page.getByRole("textbox", {
    name: "Pay now, GiveWell All Grants Fund, Unrestricted",
  });
  await input.fill("600,10");
  await expect(page.getByTestId("carries-1:")).toHaveText("+400,20 kr");
  await expect(page.getByTestId("recipient-pay-1")).toHaveText("600,10 kr");
  await expect(page.getByTestId("payee-total-1")).toHaveText("1 100,10 kr");
  await expect(total).toHaveText("1 100,10 kr");

  // Paying TCF too: carries over goes to 0 and the total grows
  await page
    .getByRole("textbox", { name: "Pay now, GiveWell Top Charities Fund, Unrestricted" })
    .fill("250");
  await expect(page.getByTestId("carries-2:")).toHaveText("0 kr");
  await expect(total).toHaveText("1 350,10 kr");

  await page.getByRole("button", { name: "Save 2 changes…" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("1 000,30 kr → 600,10 kr");
  await expect(confirm).toContainText("0 kr → 250 kr");
  await confirm.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(total).toHaveText("1 500,30 kr");
  await expect(input).toHaveValue("1000,30");
});

test("an invalid amount is flagged and doesn't change the totals", async ({ page }) => {
  await openBuilder(page);
  const input = page.getByRole("textbox", {
    name: "Pay now, GiveWell All Grants Fund, Unrestricted",
  });
  await input.fill("12,345");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("round-total")).toHaveText("1 500,30 kr");
});

test("the Include direct donations switch sends the override and shows the new state", async ({
  page,
}) => {
  let includeTCF = true;
  const calls: unknown[] = [];
  await openBuilder(page, {
    "regranting.rounds.setIncludeDirect": (input: unknown) => {
      calls.push(input);
      const value = (input as { includeDirect: boolean | null }).includeDirect;
      includeTCF = value ?? true;
      return { roundId: 7, organizationId: 2, includeDirectOverride: value };
    },
    "regranting.rounds.builder": () => builderFixture(includeTCF),
  });
  const toggle = page.getByRole("switch", { name: "Include direct donations" }).nth(1);
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(calls).toEqual([{ roundId: 7, organizationId: 2, includeDirect: false }]);
  await expect(page.locator("[data-recipient='2']")).toContainText(
    "changed; regular rounds include them",
  );
});

test("the creator can't approve their own round", async ({ page }) => {
  await stubRegrantingApi(page, { user: { sub: "ops", email: "ops@example.org" } });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto("/regranting/rounds/7");
  await expect(
    page.getByText("You created this round, so someone else must approve it"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve round" })).toBeDisabled();
});
