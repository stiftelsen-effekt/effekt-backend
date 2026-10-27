import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./trpc";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify([{ result: { data: [] } }]), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("createApiClient", () => {
  it("attaches the bearer token centrally", async () => {
    const fetchMock = stubFetch();
    const client = createApiClient(async () => "token-123");
    await client.meta.owners.query();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/trpc/meta.owners");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-123");
  });

  it("omits the header when there is no token", async () => {
    const fetchMock = stubFetch();
    const client = createApiClient(async () => null);
    await client.meta.owners.query();
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).has("authorization")).toBe(false);
  });

  it("sends FormData uploads unbatched, as multipart", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            result: {
              data: { valid: 1, invalid: 0, invalidTransactions: [], queue: null, ignored: 0 },
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient(async () => "token-123");
    const form = new FormData();
    form.set("report", new File(["OCR"], "ocr.txt"));
    await client.reports.uploads.ocr.mutate(form);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/trpc\/reports\.uploads\.ocr$/);
    expect(init?.body).toBeInstanceOf(FormData);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-123");
  });
});
