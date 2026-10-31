import { describe, expect, it, vi } from "vitest";
import { createTRPCClient, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@effekt/api";
import { restLink, restRoutes } from "./restLink";

const profile = {
  id: 0,
  email: "donor@example.org",
  name: "Donor",
  newsletter: false,
  registered: "2024-03-01T12:00:00.000Z",
};

const respond = (status: number, body: unknown) =>
  vi.fn(
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
    // An HTTP status, so callers that turn backend errors into "no data" handle it too
    expect(err.data?.httpStatus).toBe(502);
  });

  it("gives a Danish fundraiser that fails the schema an HTTP status (fundraiser pages show no data)", async () => {
    const err = await caught(
      clientWith(
        respond(200, { status: 200, content: { totalSum: "x", donationCount: 1 } }),
      ).site.fundraiser.query({ id: "8d0c2d7e-1a51-4e0e-9d55-2f3b8b9d6c11" }),
    );
    expect(err).toBeInstanceOf(TRPCClientError);
    expect(err.data?.httpStatus).toBe(502);
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

  describe("Danish Min Side mutations", () => {
    const dkTaxUnit = {
      id: 2,
      donorId: 0,
      name: "Firma ApS",
      ssn: "12345678",
      registered: "2024-03-01T12:00:00.000Z",
      archived: null,
      sumDonations: 0,
      numDonations: "0",
    };
    const changed = { id: 2, donorId: 0, name: "Firma ApS", ssn: "12345678", archived: null };

    it("maps minside.createTaxUnit to POST /donors/:id/taxunits with a JSON body", async () => {
      const fetchImpl = respond(200, { status: 200, content: dkTaxUnit });
      const result = await clientWith(fetchImpl).minside.createTaxUnit.mutate({
        donorId: 42,
        name: "Firma ApS",
        ssn: "12345678",
      });
      expect(result).toEqual(changed);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe("https://api.example.org/donors/42/taxunits");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        Authorization: "Bearer token-123",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(init?.body as string)).toEqual({ name: "Firma ApS", ssn: "12345678" });
    });

    it("maps minside.updateTaxUnit to PUT /donors/:id/taxunits/:taxUnitId", async () => {
      const fetchImpl = respond(200, { status: 200, content: dkTaxUnit });
      const result = await clientWith(fetchImpl).minside.updateTaxUnit.mutate({
        donorId: 42,
        taxUnitId: 2,
        name: "Firma ApS",
        ssn: "12345678",
      });
      expect(result).toEqual(changed);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe("https://api.example.org/donors/42/taxunits/2");
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(init?.body as string)).toEqual({
        taxUnit: { name: "Firma ApS", ssn: "12345678" },
      });
    });

    it("passes the Danish validation error on", async () => {
      const err = await caught(
        clientWith(
          respond(400, { message: "Validation failed", errors: [] }),
        ).minside.createTaxUnit.mutate({ donorId: 42, name: "X", ssn: "1" }),
      );
      expect(err.data?.code).toBe("BAD_REQUEST");
      expect(err.message).toBe("Validation failed");
    });

    it("leaves the mutations without a Danish route unmapped", async () => {
      const fetchImpl = respond(200, {});
      const client = clientWith(fetchImpl);
      const calls = [
        client.minside.updateProfile.mutate({ donorId: 42, name: "Donor" }),
        client.minside.deleteTaxUnit.mutate({ donorId: 42, taxUnitId: 1 }),
        client.minside.cancelVippsAgreement.mutate({ donorId: 42, agreementId: "agr_1" }),
        client.minside.updateVippsAgreementPrice.mutate({
          donorId: 42,
          agreementId: "agr_1",
          amount: 100,
        }),
        client.minside.updateVippsAgreementChargeDay.mutate({
          donorId: 42,
          agreementId: "agr_1",
          chargeDay: 5,
        }),
        client.minside.cancelAvtaleGiroAgreement.mutate({ donorId: 42, KID: "123" }),
        client.minside.updateAvtaleGiroAmount.mutate({ donorId: 42, KID: "123", amount: 100 }),
        client.minside.updateAvtaleGiroPaymentDate.mutate({
          donorId: 42,
          KID: "123",
          paymentDate: 5,
        }),
      ];
      for (const call of calls) {
        expect((await caught(call)).data?.code).toBe("NOT_IMPLEMENTED");
      }
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("doesn't run a mapped query as a mutation", async () => {
      const fetchImpl = respond(200, {});
      const link = restLink<AppRouter>({
        url: "https://api.example.org",
        getToken: async () => "token-123",
        fetch: fetchImpl as unknown as typeof fetch,
        routes: { "minside.updateProfile": { ...restRoutes["minside.profile"] } },
      });
      const client = createTRPCClient<AppRouter>({ links: [link] });
      const err = await caught(client.minside.updateProfile.mutate({ donorId: 42, name: "D" }));
      expect(err.data?.code).toBe("NOT_IMPLEMENTED");
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  it("fails unmapped procedures without calling the API", async () => {
    const fetchImpl = respond(200, {});
    const err = await caught(clientWith(fetchImpl).meta.owners.query());
    expect(err.message).toBe("meta.owners is not available on this site");
    expect(err.data?.code).toBe("NOT_IMPLEMENTED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("leaves the Norwegian agreement lists and tax reports unmapped (no Danish REST route)", async () => {
    for (const path of [
      "minside.vippsAgreements",
      "minside.avtaleGiroAgreements",
      "minside.taxReports",
    ]) {
      expect(Object.keys(restRoutes)).not.toContain(path);
    }
    const fetchImpl = respond(200, {});
    const err = await caught(clientWith(fetchImpl).minside.taxReports.query({ donorId: 42 }));
    expect(err.data?.code).toBe("NOT_IMPLEMENTED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe("Danish results and fundraiser pages", () => {
    const publicClient = (fetchImpl: ReturnType<typeof respond>) =>
      createTRPCClient<AppRouter>({
        links: [
          restLink<AppRouter>({
            url: "https://api.example.org",
            fetch: fetchImpl as unknown as typeof fetch,
          }),
        ],
      });

    it("maps the results procedures and site.organizations to the same REST routes as before, without a token", async () => {
      const cases: Array<[() => Promise<unknown>, string, unknown]> = [];
      const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
        const content = cases.find(([, path]) => url.endsWith(path))![2];
        return new Response(JSON.stringify({ status: 200, content }));
      });
      const trpc = publicClient(fetchImpl as any);
      const headline = {
        totalDonationsToRecommendedOrgs: 13888785,
        numberOfDonors: 1697,
        lastUpdated: "2026-10-30T20:13:15.243Z",
      };
      cases.push(
        [() => trpc.site.resultsHeadline.query(), "/results/headline", headline],
        [
          () => trpc.site.dailyDonations.query(),
          "/results/donations/daily",
          [{ date: "2022-05-09T00:00:00.000Z", sum: 5 }],
        ],
        [() => trpc.site.referralSums.query(), "/results/referrals/sums", []],
        [() => trpc.site.monthlyOutputs.query(), "/results/donations/monthly/outputs", []],
        [
          () => trpc.site.organizations.query(),
          "/organizations/all/",
          // giveffektivt/donation-platform app/organizations/all (buildOrganizations)
          [
            {
              id: -1,
              name: "Smart fordeling",
              widgetDisplayName: "Smart fordeling",
              widgetContext: null,
              shortDescription: "Din donation fordeles efter Giv Effektivts anbefalinger",
              longDescription: "Smart fordeling",
              standardShare: 100,
              informationUrl: "/smart-fordeling",
              isActive: true,
              ordering: 1,
              causeAreaId: -1,
            },
          ],
        ],
      );
      for (const [query, path, content] of cases) {
        fetchImpl.mockClear();
        expect(await query()).toEqual(content);
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe(`https://api.example.org${path}`);
        expect(init?.method).toBe("GET");
        expect(new Headers(init?.headers as HeadersInit).has("authorization")).toBe(false);
      }
    });

    it("maps site.fundraiser to GET /fundraisers/:uuid", async () => {
      const fundraiser = {
        totalSum: 4250,
        donationCount: 1,
        transactions: [
          {
            id: "0b8a6f3e-1d2c-4b5a-9e8f-7a6b5c4d3e2f",
            name: null,
            message: "Godt gået",
            amount: 4250,
            date: "2025-12-10T11:12:08.523Z",
          },
        ],
      };
      const fetchImpl = respond(200, { status: 200, content: fundraiser });
      const id = "7b03b0b2-031e-4df2-93fe-59bb79b0d31d";
      expect(await publicClient(fetchImpl).site.fundraiser.query({ id })).toEqual(fundraiser);
      expect(fetchImpl.mock.calls[0][0]).toBe(`https://api.example.org/fundraisers/${id}`);
    });

    it("leaves the LTV estimate and the payment calls unmapped (no Danish route)", async () => {
      for (const path of [
        "site.ltvEstimate",
        "widget.draftVippsAgreement",
        "widget.draftAvtaleGiro",
      ]) {
        expect(Object.keys(restRoutes)).not.toContain(path);
      }
      const fetchImpl = respond(200, {});
      const err = await caught(publicClient(fetchImpl).site.ltvEstimate.query());
      expect(err.data?.code).toBe("NOT_IMPLEMENTED");
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});
