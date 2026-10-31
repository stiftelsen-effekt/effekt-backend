import { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { describe, expect, it } from "vitest";
import type { AppRouter } from "@/lib/trpc";
import { createApiClient } from "@/lib/trpc";
import { invalidateDonationQueries } from "./invalidate";

const setUp = () => {
  const queryClient = new QueryClient();
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: createApiClient(async () => null),
    queryClient,
  });
  const keys = {
    donation: trpc.donations.get.queryKey({ id: 1 }),
    donor1Donations: trpc.donors.donations.queryKey({ donorId: 1 }),
    donor1Sums: trpc.donors.donationsAggregated.queryKey({ donorId: 1 }),
    donor1Distributions: trpc.donors.distributionsAggregated.queryKey({ donorId: 1 }),
    donor2Donations: trpc.donors.donations.queryKey({ donorId: 2 }),
    donor3Donations: trpc.donors.donations.queryKey({ donorId: 3 }),
  };
  for (const key of Object.values(keys)) queryClient.setQueryData(key, []);
  const invalidated = () =>
    Object.fromEntries(
      Object.entries(keys).map(([name, key]) => [
        name,
        queryClient.getQueryState(key)?.isInvalidated ?? false,
      ]),
    );
  return { queryClient, trpc, invalidated };
};

describe("invalidateDonationQueries", () => {
  it("refreshes donations and the named donors' donation lists, sums and distributions", async () => {
    const { queryClient, trpc, invalidated } = setUp();
    await invalidateDonationQueries(queryClient, trpc as never, [1, 2, null]);
    expect(invalidated()).toEqual({
      donation: true,
      donor1Donations: true,
      donor1Sums: true,
      donor1Distributions: true,
      donor2Donations: true,
      donor3Donations: false,
    });
  });

  it("refreshes every donor's pages when it isn't known whose donations changed", async () => {
    const { queryClient, trpc, invalidated } = setUp();
    await invalidateDonationQueries(queryClient, trpc as never);
    expect(Object.values(invalidated()).every(Boolean)).toBe(true);
  });
});
