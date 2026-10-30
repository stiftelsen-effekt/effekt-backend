import { describe, expect, it, jest } from "@jest/globals";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@effekt/api";
import { restLink } from "./restLink";

const profile = {
  id: 0,
  email: "donor@example.org",
  name: "Donor",
  newsletter: false,
  registered: "2024-03-01T12:00:00.000Z",
};

const respond = (status: number, body: unknown) =>
  jest.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );

const clientWith = (fetchImpl: ReturnType<typeof respond>) =>
  createTRPCClient<AppRouter>({
    links: [
      restLink<AppRouter>({
        url: "https://api.example.org",
        getToken: async () => "token-123",
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    ],
  });

const caught = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err as TRPCClientError<AppRouter>;
  }
  throw new Error("expected the call to fail");
};

describe("restLink", () => {
  it("maps minside.profile to GET /donors/:id/ with the bearer token", async () => {
    const fetchImpl = respond(200, { status: 200, content: { ...profile, extra: "dropped" } });

    const result = await clientWith(fetchImpl).minside.profile.query({ donorId: 42 });

    expect(result).toEqual(profile);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.org/donors/42/");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({ Authorization: "Bearer token-123" });
  });

  it("turns REST errors into tRPC errors with the HTTP status", async () => {
    const err = await caught(
      clientWith(respond(401, "Unauthorized")).minside.profile.query({ donorId: 42 }),
    );
    expect(err).toBeInstanceOf(TRPCClientError);
    expect(err.data?.code).toBe("UNAUTHORIZED");
    expect(err.data?.httpStatus).toBe(401);
  });

  it("uses the REST error message", async () => {
    const err = await caught(
      clientWith(
        respond(404, { status: 404, content: "No donor found with ID 42" }),
      ).minside.profile.query({ donorId: 42 }),
    );
    expect(err.message).toBe("No donor found with ID 42");
    expect(err.data?.code).toBe("NOT_FOUND");
  });

  it("rejects responses that don't match the output schema", async () => {
    const err = await caught(
      clientWith(
        respond(200, { status: 200, content: { id: 0, email: "x" } }),
      ).minside.profile.query({ donorId: 42 }),
    );
    expect(err).toBeInstanceOf(TRPCClientError);
    expect(err.message).toMatch(/unexpected response from the REST API/);
  });

  /**
   * Responses shaped like the Danish backend's (giveffektivt/donation-platform, app/donors/[id]/…):
   * numeric columns as numbers, COUNT(*) as a string, donorId 0, tax units numbered 1, 2, …
   */
  describe("Danish Min Side responses", () => {
    const dkTaxUnit = {
      id: 1,
      donorId: 0,
      name: "Anonym",
      ssn: "",
      registered: "2024-03-01T12:00:00.000Z",
      archived: null,
      sumDonations: 1500,
      numDonations: "3",
      taxDeductions: [{ year: 2024, sumDonations: 1500, deduction: 1500, benefit: 390 }],
    };
    const dkDonation = {
      id: 1,
      donor: "",
      donorId: 0,
      email: "donor@example.org",
      sum: 500,
      transactionCost: 0,
      paymentMethod: "MobilePay",
      KID: "6c4a8d9e-0000-4000-8000-000000000001",
      taxUnitId: 1,
      timestamp: "2024-03-01T12:00:00.000Z",
      impact: [
        {
          recipient: "Against Malaria Foundation",
          unit: null,
          organization: "Myggenet mod malaria",
          amount: 500,
          count: 83.3,
        },
      ],
    };
    const dkDistribution = {
      id: "6c4a8d9e-0000-4000-8000-000000000001",
      kid: "6c4a8d9e-0000-4000-8000-000000000001",
      donorId: 0,
      taxUnitId: 1,
      causeAreas: [
        {
          id: 1,
          name: "Global sundhed og fattigdom",
          standardSplit: false,
          amount: 500,
          percentageShare: 100,
          organizations: [{ id: 2, name: "Myggenet", amount: 500, percentageShare: 100 }],
        },
      ],
    };

    it("maps minside.taxUnits to GET /donors/:id/taxunits/", async () => {
      const fetchImpl = respond(200, { status: 200, content: [dkTaxUnit] });
      const result = await clientWith(fetchImpl).minside.taxUnits.query({ donorId: 42 });
      expect(result).toEqual([dkTaxUnit]);
      expect(fetchImpl.mock.calls[0][0]).toBe("https://api.example.org/donors/42/taxunits/");
    });

    it("maps minside.donationsAggregated to GET /donors/:id/donations/aggregated", async () => {
      const rows = [{ organization: "Myggenet mod malaria", value: 500, year: 2024 }];
      const fetchImpl = respond(200, { status: 200, content: rows });
      const result = await clientWith(fetchImpl).minside.donationsAggregated.query({
        donorId: 42,
      });
      expect(result).toEqual(rows);
      expect(fetchImpl.mock.calls[0][0]).toBe(
        "https://api.example.org/donors/42/donations/aggregated",
      );
    });

    it("maps minside.donations to GET /donors/:id/donations/", async () => {
      const fetchImpl = respond(200, { status: 200, content: [dkDonation] });
      const result = await clientWith(fetchImpl).minside.donations.query({ donorId: 42 });
      expect(result).toEqual([dkDonation]);
      expect(fetchImpl.mock.calls[0][0]).toBe("https://api.example.org/donors/42/donations/");
    });

    it("maps minside.distributions to GET /donors/:id/distributions/?kids=…", async () => {
      const fetchImpl = respond(200, { status: 200, content: [dkDistribution] });
      const result = await clientWith(fetchImpl).minside.distributions.query({
        donorId: 42,
        kids: [dkDistribution.kid, "other"],
      });
      // The Danish backend's extra `id` is not part of the schema
      const { id: _id, ...expected } = dkDistribution;
      expect(result).toEqual([expected]);
      expect(fetchImpl.mock.calls[0][0]).toBe(
        `https://api.example.org/donors/42/distributions/?kids=${encodeURIComponent(
          `${dkDistribution.kid},other`,
        )}`,
      );
    });
  });

  it("fails unmapped procedures without calling the API", async () => {
    const fetchImpl = respond(200, {});
    const err = await caught(clientWith(fetchImpl).meta.owners.query());
    expect(err.message).toBe("meta.owners is not available on this site");
    expect(err.data?.code).toBe("NOT_IMPLEMENTED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
