import type { Page } from "@playwright/test";

/** The fake data's "now" (src/design-system/fake-data.ts NOW). */
export const NOW = new Date("2026-10-24T12:00:00Z");

export const designRoutes = [
  { name: "foundations", path: "/design" },
  { name: "components", path: "/design/components" },
  { name: "patterns", path: "/design/patterns" },
  { name: "home", path: "/design/home" },
  { name: "list", path: "/design/list" },
  { name: "agreements", path: "/design/agreements" },
  { name: "detail", path: "/design/detail" },
  { name: "flow", path: "/design/flow" },
  { name: "settings", path: "/design/settings" },
] as const;

export const viewports = {
  desktop: { width: 1440, height: 900 },
  narrow: { width: 390, height: 844 },
} as const;

export type Theme = "light" | "dark";

/** Fixed clock, chosen theme, then load and wait for fonts and data. */
export async function openDesign(page: Page, path: string, theme: Theme) {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.goto(path);
  await settle(page);
}

export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Loaded: no placeholders left (demo ones marked data-static aside) and no section pending.
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        "[data-slot=skeleton]:not([data-static], [data-static] *), [data-slot=pending]",
      ).length === 0,
    null,
    {
      timeout: 10_000,
    },
  );
  // Charts animate in; let them finish.
  await page.waitForTimeout(150);
}

/**
 * Reference pages scroll inside the content sheet; grow the viewport to the content so one
 * screenshot shows the whole page.
 */
export async function growToContent(page: Page, width: number) {
  const height = await page.evaluate(() => {
    const scroller = document.querySelector("[data-page-scroll]") as HTMLElement | null;
    return scroller ? scroller.scrollHeight + 80 : document.documentElement.scrollHeight;
  });
  await page.setViewportSize({ width, height: Math.min(Math.max(height, 900), 14_000) });
  await settle(page);
}

/** A `home.trends` answer (13 months to Oct 2026), for specs that stub the API and open Home. */
export function homeTrendsFixture() {
  const months = Array.from({ length: 13 }, (_, index) => {
    const month = ((9 + index) % 12) + 1;
    return `${index < 3 ? 2025 : 2026}-${String(month).padStart(2, "0")}`;
  });
  const series = <T>(value: (index: number) => T) => ({
    points: months.map((month, index) => ({ month, value: value(index) })),
    estimated: false,
  });
  return {
    months,
    partialLast: true as const,
    donations: { ...series((index) => `${2_000_000 + index * 40_000}.00`), counts: [] },
    transactionCosts: series((index) => `${15_000 + index * 300}.00`),
    activeAgreements: series((index) => 1290 + index * 26),
    agreementsStarted: series((index) => 40 + (index % 5)),
    agreementsStopped: series((index) => 15 + (index % 4)),
  };
}
