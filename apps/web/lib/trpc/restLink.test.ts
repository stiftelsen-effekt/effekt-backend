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

  it("fails unmapped procedures without calling the API", async () => {
    const fetchImpl = respond(200, {});
    const err = await caught(clientWith(fetchImpl).meta.owners.query());
    expect(err.message).toBe("meta.owners is not available on this site");
    expect(err.data?.code).toBe("NOT_IMPLEMENTED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
