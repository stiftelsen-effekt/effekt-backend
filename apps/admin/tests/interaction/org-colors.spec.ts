import { expect, test, type Page } from "@playwright/test";
import { stubAnalysisApi } from "../analysis-fixtures";

/** An organization's chart colour is stored on it: pick one in settings, see it in org bars. */

const org = (
  id: number,
  name: string,
  abbreviation: string,
  share: number,
  chartColor: string,
) => ({
  id,
  causeAreaId: 1,
  name,
  abbreviation,
  shortDescription: null,
  longDescription: "",
  informationUrl: null,
  standardShare: share,
  isActive: true,
  ordering: id,
  chartColor,
});

async function signIn(page: Page) {
  const organizations = [
    org(1, "Against Malaria Foundation", "AMF", 60, "chart-1"),
    org(2, "Malaria Consortium", "MC", 40, "chart-2"),
  ];
  const causeAreas = () => [
    {
      id: 1,
      name: "Global Health",
      standardPercentageShare: 100,
      shortDescription: null,
      longDescription: null,
      informationUrl: null,
      isActive: true,
      ordering: 1,
      organizations,
    },
  ];
  const updates: unknown[] = [];
  await stubAnalysisApi(page, {
    overrides: {
      "config.causeAreas.listAll": causeAreas,
      "config.causeAreas.listActive": causeAreas,
      "config.organizations.listByCauseArea": () => organizations,
      "config.organizations.update": (input) => {
        const patch = input as { id: number; chartColor?: string };
        updates.push(patch);
        const target = organizations.find((o) => o.id === patch.id)!;
        Object.assign(target, patch);
        return target;
      },
    },
    extra: { "meta.owners": [{ id: 1, owner: "Gi Effektivt", default: true }] },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: /dev token/i }).click();
  await page.waitForURL("/");
  return updates;
}

const barColors = (page: Page) =>
  page
    .locator("[data-slot=org-split-bar] > div")
    .evaluateAll((slices) =>
      slices.map((slice) => /bg-(chart-\d+)/.exec(slice.className)?.[1]).filter(Boolean),
    );

test("changing an organization's colour in settings changes it in the org bar", async ({
  page,
}) => {
  const updates = await signIn(page);

  await page.goto("/distributions/new");
  await page.getByRole("button", { name: "Use recommended split" }).click();
  expect(await barColors(page)).toEqual(["chart-1", "chart-2"]);

  await page.goto("/settings");
  const table = page.getByRole("table", { name: "Global Health organizations" });
  await table.getByRole("button", { name: "Edit Malaria Consortium" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Malaria Consortium" });
  const picker = dialog.getByRole("radiogroup", { name: "Chart colour" });

  // The current colour is chosen; the others say who uses them.
  await expect(picker.getByRole("radio", { name: /^Blue/ })).toBeChecked();
  await expect(
    picker.getByRole("radio", { name: "Ink, used by Against Malaria Foundation" }),
  ).toBeVisible();

  // Arrow keys move between colours like any radio group.
  await picker.getByRole("radio", { name: /^Blue/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(picker.getByRole("radio", { name: /^Ochre/ })).toBeChecked();

  await picker.locator("[data-color=chart-12]").click(); // the swatch, as people click it
  await expect(picker.getByRole("radio", { name: "Olive, unused", exact: true })).toBeChecked();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  expect(updates).toEqual([expect.objectContaining({ id: 2, chartColor: "chart-12" })]);

  await page.goto("/distributions/new");
  await page.getByRole("button", { name: "Use recommended split" }).click();
  expect(await barColors(page)).toEqual(["chart-1", "chart-12"]);
});
