import { expect, test, type Page } from "@playwright/test";
import {
  donationFixture,
  overviewFixture,
  pledgesFixture,
  stubAnalysisApi,
} from "../analysis-fixtures";

/** The analysis pages against a stubbed API: the count-up, and adding and closing pledges. */
const osloToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });

async function signIn(page: Page, overrides = {}) {
  await stubAnalysisApi(page, { overrides });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
}

test("the through-time figure counts up once without moving anything", async ({ page }) => {
  // Record every value the figure shows, and the width of its box, from the first paint
  await page.addInitScript(() => {
    const seen: { text: string; width: number }[] = [];
    (window as unknown as { countUp: typeof seen }).countUp = seen;
    new MutationObserver(() => {
      const el = document.querySelector("[data-slot=count-up]");
      const text = el?.textContent?.replace(/\s/g, " ");
      if (el && text && text !== seen.at(-1)?.text)
        seen.push({ text, width: (el.parentElement as HTMLElement).offsetWidth });
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await signIn(page);
  // Navigate within the app, so the brand font is already in (the fallback font is wider)
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  const figure = page.locator("[data-slot=count-up]");
  await expect(figure).toHaveText("170 245 588 kr");
  await page.waitForTimeout(300);
  const seen = await page.evaluate(
    () => (window as unknown as { countUp: { text: string; width: number }[] }).countUp,
  );
  expect(seen.length).toBeGreaterThan(3);
  expect(seen.at(-1)!.text).toBe("170 245 588 kr");
  // The box is as wide as the total from the first value on (within subpixel rendering)
  const final = seen.at(-1)!.width;
  for (const { width } of seen) expect(Math.abs(width - final)).toBeLessThanOrEqual(1);
  // Screen readers get the total only
  await expect(page.getByText("170 245 588 kr", { exact: true }).last()).toHaveClass(/sr-only/);
});

test("under reduced motion the total shows at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await page.goto("/analysis");
  const figure = page.locator("[data-slot=count-up]");
  await expect(figure).toBeVisible();
  // Read once, without retrying: the first value shown is already the total
  expect((await figure.textContent())?.replace(/\s/g, " ")).toBe("170 245 588 kr");
});

test("the overview refreshes every minute and the figure follows new donations", async ({
  page,
}) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "reduce" });
  let calls = 0;
  await signIn(page, {
    "analysis.overview": () => {
      calls++;
      const overview = overviewFixture();
      // From the second call on, a donation of 4 412 kr has come in
      return calls === 1
        ? overview
        : { ...overview, withPledges: { ...overview.withPledges, sum: "170250000" } };
    },
  });
  await page.goto("/analysis");
  const figure = page.locator("[data-slot=count-up]");
  await expect(figure).toHaveText("170 245 588 kr");
  const before = calls;
  await page.clock.fastForward(61_000);
  await expect.poll(() => calls).toBeGreaterThan(before);
  await expect(figure).toHaveText("170 250 000 kr");
});

test("adding a pledge validates inline, sends amount and date, and refetches the overview", async ({
  page,
}) => {
  const created: unknown[] = [];
  let overviewCalls = 0;
  let pledges = pledgesFixture();
  await signIn(page, {
    "analysis.pledges.create": (input: unknown) => {
      created.push(input);
      const { sum, decidedDate } = input as { sum: number; decidedDate: string };
      const pledge = {
        id: 9,
        sum: sum.toFixed(2),
        decidedDate,
        receivedDate: null,
        donationId: null,
      };
      pledges = [pledge, ...pledges];
      return pledge;
    },
    "analysis.pledges.list": () => pledges,
    "analysis.overview": () => {
      overviewCalls++;
      return overviewFixture();
    },
  });
  // The overview is cached from the earlier visit, so a refetch after the change is visible
  await page.goto("/analysis");
  await expect(page.locator("[data-slot=count-up]")).toBeVisible();
  await page.getByRole("link", { name: "Pledges", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pledges" })).toBeVisible();

  await page.getByRole("button", { name: "Add pledge" }).click();
  const dialog = page.getByRole("dialog", { name: "Add pledge" });
  await dialog.getByRole("textbox", { name: "Amount" }).fill("12,345");
  await dialog.getByRole("button", { name: "Add pledge" }).click();
  await expect(dialog).toContainText("at most two decimals");
  expect(created).toEqual([]);

  await dialog.getByRole("textbox", { name: "Amount" }).fill("1 350 000,50");
  const before = overviewCalls;
  await dialog.getByRole("button", { name: "Add pledge" }).click();
  await expect(dialog).toBeHidden();
  expect(created).toEqual([{ sum: 1350000.5, decidedDate: osloToday() }]);
  await expect(page.getByRole("table", { name: "Pledges" })).toContainText("1 350 000,50 kr");
  // The overview was invalidated: going back fetches fresh numbers
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect.poll(() => overviewCalls).toBeGreaterThan(before);
});

test("marking received sends the date and donation; reopening can be undone", async ({ page }) => {
  const calls: { path: string; input: unknown }[] = [];
  const record = (path: string, result: (input: unknown) => unknown) => (input: unknown) => {
    calls.push({ path, input });
    return result(input);
  };
  const pledge = pledgesFixture()[0]!;
  await signIn(page, {
    "analysis.pledges.markReceived": record("markReceived", (input) => ({
      ...pledge,
      ...(input as object),
    })),
    "analysis.pledges.reopen": record("reopen", () => pledge),
    "analysis.pledges.delete": record("delete", () => ({ id: 3 })),
    "donations.get": (input: unknown) =>
      (input as { id: number }).id === 75625
        ? donationFixture
        : { error: { code: "NOT_FOUND", message: "Donation not found", httpStatus: 404 } },
  });
  await page.goto("/analysis/pledges");

  await page.getByRole("button", { name: "Mark received" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Donation ID" }).fill("999");
  await expect(dialog).toContainText("No donation has ID 999");
  await dialog.getByRole("textbox", { name: "Donation ID" }).fill("75625");
  await expect(dialog.getByRole("link", { name: "Donation #75625" })).toBeVisible();
  await dialog.getByRole("button", { name: "Mark as received" }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toEqual([
    {
      path: "markReceived",
      input: { id: 7, receivedDate: osloToday(), donationId: 75625 },
    },
  ]);

  calls.length = 0;
  await page.getByRole("button", { name: "Reopen" }).first().click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Change undone")).toBeVisible();
  expect(calls).toEqual([
    { path: "reopen", input: { id: 4 } },
    { path: "markReceived", input: { id: 4, receivedDate: "2026-05-11", donationId: 75625 } },
  ]);

  calls.length = 0;
  await page.getByRole("button", { name: /^Delete the pledge of 750 000,00 kr/ }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("The open pledges on the overview go down by 750 000,00 kr");
  await confirm.getByRole("button", { name: "Delete pledge" }).click();
  await expect(confirm).toBeHidden();
  expect(calls).toEqual([{ path: "delete", input: { id: 3 } }]);
});
