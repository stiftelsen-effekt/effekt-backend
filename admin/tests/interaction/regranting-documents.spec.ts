import { expect, test, type Page } from "@playwright/test";
import { documentedPaidRoundOverrides, stubRegrantingApi } from "../regranting-fixtures";

/** A paid round with notes and documents on the round, its transfers and an adjustment */
async function openPaidRound(page: Page) {
  await stubRegrantingApi(page, { overrides: documentedPaidRoundOverrides() });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  await page.goto("/regranting/rounds/7");
  await expect(page.getByRole("table", { name: "Transfers" })).toBeVisible();
}

test("notes start on the left and document chips sit to their right, opening in a new tab", async ({
  page,
}) => {
  await openPaidRound(page);

  const header = page.getByRole("region", { name: "Notes and documents" });
  await expect(header).toContainText("Held back or changed by hand:");
  const roundDocs = header.getByRole("list", { name: "Documents of September 2026 regular round" });
  await expect(roundDocs.getByRole("link")).toHaveCount(7);
  // A long label is truncated, the whole label in its tooltip; no label shows the host
  const long = roundDocs.getByRole("link", { name: /Bekreftelse fra GiveWell/ });
  await expect(long).toHaveAttribute(
    "title",
    "Bekreftelse fra GiveWell på mottatt overføring og fordeling mellom fondene",
  );
  await expect(roundDocs.getByRole("link", { name: /drive\.google\.com/ })).toBeVisible();

  // Transfers: the notes start at the same x on every row, documents right of them
  const table = page.getByRole("table", { name: "Transfers" });
  const note70 = table.getByText("Exchange rate and bank fee from DNB's confirmation.");
  const note72 = table.getByText("Paid the day before the foreign transfers, as usual.");
  const [b70, b72] = [await note70.boundingBox(), await note72.boundingBox()];
  expect(b70!.x).toBe(b72!.x);
  const chip = table.getByRole("link", { name: /Bilag 2026\/273/ });
  expect((await chip.boundingBox())!.x).toBeGreaterThan(b70!.x + b70!.width);
  await expect(chip).toHaveAttribute("target", "_blank");
  await expect(chip).toHaveAttribute("href", "https://drive.google.com/file/d/bilag-201/view");

  // Keyboard: the chip takes focus, then its remove button
  await chip.focus();
  await expect(chip).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Remove the link Bilag 2026/273" })).toBeFocused();

  // The row's actions are icon buttons named for what they do; a paid round offers a correction
  await expect(table.getByRole("button", { name: "Edit notes on transfer #70" })).toBeVisible();
  await expect(table.getByRole("button", { name: "Add notes on transfer #71" })).toBeVisible();
  await expect(table.getByRole("button", { name: "Add a document to transfer #73" })).toBeVisible();
  await expect(table.getByRole("button", { name: "Add correction…" })).toHaveCount(4);
});
