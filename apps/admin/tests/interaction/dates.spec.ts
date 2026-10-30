import { expect, test } from "@playwright/test";

// Dates are typed as dd.mm.yyyy (or picked). Reaching a date two years back used to take two
// dozen clicks through the calendar.

test("a date range can be typed", async ({ page }) => {
  await page.goto("/design/components");
  const trigger = page.getByRole("button", { name: "Period" });
  await trigger.click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "From" }).fill("1.10.2024");
  await editor.getByRole("textbox", { name: "To" }).fill("31.10.24");
  await editor.getByRole("textbox", { name: "To" }).press("Enter");
  // The calendar follows the typed dates.
  await expect(editor.getByText("October 2024")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveText("01.10.2024 – 31.10.2024");
});

test("a single date is typed as dd.mm.yyyy and rejects non-dates", async ({ page }) => {
  await page.goto("/design/components");
  const input = page.getByRole("textbox", { name: "Payment date" });
  await expect(input).toHaveValue("24.10.2026");
  await input.fill("31.02.2026");
  await input.blur();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("01022026");
  await input.blur();
  await expect(input).toHaveValue("01.02.2026");
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
});
