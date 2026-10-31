import { describe, expect, it } from "vitest";
import { Distribution } from "../../../models";
import {
  hydrateDistributionAmounts,
  isAllocationVisible,
  isSameDistribution,
  orderDistributionCauseAreas,
  prepareDistributionForSave,
  setCauseAreaStandardSplit,
  setStandardCauseAreaAmount,
} from "./distributionAmounts";

const distribution: Distribution = {
  kid: "kid",
  donorId: 1,
  taxUnitId: null,
  causeAreas: [
    {
      id: 1,
      standardSplit: false,
      percentageShare: "33.33333333",
      organizations: [
        { id: 1, percentageShare: "33.33333333" },
        { id: 2, percentageShare: "66.66666667" },
      ],
    },
    {
      id: 2,
      standardSplit: false,
      percentageShare: "33.33333333",
      organizations: [{ id: 3, percentageShare: "100" }],
    },
    {
      id: 3,
      standardSplit: true,
      percentageShare: "33.33333334",
      organizations: [{ id: 4, percentageShare: "100" }],
    },
  ],
};

const sumPercentages = (items: { percentageShare: string | number }[]) =>
  items.reduce((sum, item) => sum + Number(item.percentageShare), 0);

it("orders distributions using the cause area configuration", () => {
  const ordered = orderDistributionCauseAreas(
    [distribution.causeAreas[2], distribution.causeAreas[0], distribution.causeAreas[1]],
    [
      { id: 1, ordering: 2 },
      { id: 2, ordering: 3 },
      { id: 3, ordering: 1 },
    ],
  );

  expect(ordered.map((causeArea) => causeArea.id)).toEqual([3, 1, 2]);
});

it("only shows inactive allocations when saved or included in the recommended distribution", () => {
  expect(isAllocationVisible(false, 100)).toBe(true);
  expect(isAllocationVisible(false, 0)).toBe(false);
  expect(isAllocationVisible(false, 0, 100)).toBe(true);
  expect(isAllocationVisible(true, 0)).toBe(true);
});

it("keeps the standard organization synchronized with its cause area amount", () => {
  const causeArea = hydrateDistributionAmounts(distribution, 1000).causeAreas[2];
  const updated = setStandardCauseAreaAmount(causeArea, 500, 4);

  expect(updated.amount).toBe(500);
  expect(updated.organizations.find((organization) => organization.id === 4)?.amount).toBe(500);
});

it("preserves organization amounts while smart distribution is toggled", () => {
  const causeArea = {
    ...distribution.causeAreas[0],
    amount: 300,
    organizations: [
      { id: 1, percentageShare: "33.33333333", amount: 100 },
      { id: 2, percentageShare: "66.66666667", amount: 200 },
    ],
  };

  const enabled = setCauseAreaStandardSplit(causeArea, true);
  const disabled = setCauseAreaStandardSplit(enabled, false);

  expect(enabled.organizations).toEqual(causeArea.organizations);
  expect(disabled.organizations).toEqual(causeArea.organizations);
});

it("moves a smart distribution total to its standard organization only in the payload", () => {
  const causeArea = setCauseAreaStandardSplit(
    {
      ...distribution.causeAreas[0],
      amount: 300,
      organizations: [
        { id: 1, percentageShare: "33.33333333", amount: 100 },
        { id: 2, percentageShare: "66.66666667", amount: 200 },
      ],
    },
    true,
  );

  const payload = prepareDistributionForSave(
    { ...distribution, causeAreas: [causeArea] },
    300,
    new Map([[1, 1]]),
  );

  expect(payload.causeAreas[0].organizations).toEqual([
    { id: 1, percentageShare: "100", amount: 300 },
  ]);
});

it("hydrates legacy percentage distributions with exact whole amounts", () => {
  const hydrated = hydrateDistributionAmounts(distribution, 1000);

  expect(hydrated.causeAreas.map((causeArea) => causeArea.amount)).toEqual([333, 333, 334]);
  expect(
    hydrated.causeAreas[0].organizations.reduce(
      (sum, organization) => sum + (organization.amount ?? 0),
      0,
    ),
  ).toBe(333);
});

it("builds amount and percentage payloads whose totals are exact", () => {
  const payload = prepareDistributionForSave(hydrateDistributionAmounts(distribution, 1000), 1000);

  expect(payload.causeAreas.reduce((sum, causeArea) => sum + (causeArea.amount ?? 0), 0)).toBe(
    1000,
  );
  expect(sumPercentages(payload.causeAreas)).toBe(100);

  payload.causeAreas.forEach((causeArea) => {
    expect(
      causeArea.organizations.reduce((sum, organization) => sum + (organization.amount ?? 0), 0),
    ).toBe(causeArea.amount);
    expect(sumPercentages(causeArea.organizations)).toBe(100);
  });
});

it("removes zero allocations from the payload", () => {
  const hydrated = hydrateDistributionAmounts(distribution, 1000);
  hydrated.causeAreas[0].organizations[0].amount = 0;
  hydrated.causeAreas[0].organizations[1].amount = 333;

  const payload = prepareDistributionForSave(hydrated, 1000);

  expect(payload.causeAreas[0].organizations).toHaveLength(1);
  expect(payload.causeAreas[0].organizations[0].amount).toBe(333);
});

describe("isSameDistribution", () => {
  const saved = hydrateDistributionAmounts(distribution, 300);
  const padded = (base: Distribution): Distribution => ({
    ...base,
    causeAreas: [
      ...base.causeAreas,
      {
        id: 99,
        name: "Added for editing",
        standardSplit: true,
        percentageShare: "0",
        amount: 0,
        organizations: [{ id: 990, percentageShare: "100", amount: 0 }],
      },
    ],
  });

  it("ignores cause areas added at 0 so they can be edited", () => {
    expect(isSameDistribution(padded(saved), saved)).toBe(true);
  });

  it("ignores ordering", () => {
    expect(
      isSameDistribution({ ...saved, causeAreas: [...saved.causeAreas].reverse() }, saved),
    ).toBe(true);
  });

  it("sees a changed amount", () => {
    const edited = padded(saved);
    edited.causeAreas[0] = {
      ...edited.causeAreas[0],
      amount: (edited.causeAreas[0].amount ?? 0) + 1,
    };
    expect(isSameDistribution(edited, saved)).toBe(false);
  });

  it("sees money moved to a cause area added at 0", () => {
    const edited = padded(saved);
    const last = edited.causeAreas.length - 1;
    edited.causeAreas[last] = {
      ...edited.causeAreas[last],
      amount: 10,
      organizations: [{ id: 990, percentageShare: "100", amount: 10 }],
    };
    expect(isSameDistribution(edited, saved)).toBe(false);
  });

  it("sees a changed tax unit and a changed standard split", () => {
    expect(isSameDistribution({ ...saved, taxUnitId: 5 }, saved)).toBe(false);
    expect(
      isSameDistribution(
        {
          ...saved,
          causeAreas: saved.causeAreas.map((causeArea, index) =>
            index === 0 ? { ...causeArea, standardSplit: true } : causeArea,
          ),
        },
        saved,
      ),
    ).toBe(false);
  });

  it("handles missing distributions", () => {
    expect(isSameDistribution(null, null)).toBe(true);
    expect(isSameDistribution(null, saved)).toBe(false);
  });
});
