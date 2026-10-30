import { expect, test } from "@playwright/test";

// Every entry in "Add filter" must open that filter's editor and survive the menu closing.
// Opening the editor while the menu was still closing used to dismiss it at random.
for (const path of ["/design/list", "/design/components"]) {
  test(`every Add filter entry opens its editor on ${path}`, async ({ page }) => {
    await page.goto(path);
    const addFilter = page.getByRole("button", { name: /^(add filter|filter)$/i }).first();
    await addFilter.click();
    const names = await page.getByRole("menuitem").allInnerTexts();
    await page.keyboard.press("Escape");
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      await addFilter.click();
      await page.getByRole("menuitem", { name, exact: true }).click();
      const editor = page.getByRole("dialog", { name: `${name} filter` });
      await expect(editor, `${name} editor`).toBeVisible();
      // Give a late dismissal a chance to happen before checking it stayed open
      await page.waitForTimeout(250);
      await expect(editor, `${name} editor stays open`).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(editor).toBeHidden();
    }
  });
}

test("picking an option keeps the chip and puts the filter in the URL", async ({ page }) => {
  await page.goto("/design/list");
  await page
    .getByRole("button", { name: /^(add filter|filter)$/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Payment method", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Payment method filter" });
  await editor.getByRole("checkbox").first().click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot=filter-chip][data-field=method]")).toBeVisible();
  await expect(page).toHaveURL(/[?&]method=/);
});
