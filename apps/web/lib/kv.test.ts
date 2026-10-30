import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { RedisMock } = vi.hoisted(() => ({ RedisMock: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: RedisMock }));

const ENV_KEYS = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

// A fresh module per test, so the cached client from an earlier test isn't reused
const loadGetKv = async (): Promise<typeof import("./kv").getKv> => {
  vi.resetModules();
  return (await import("./kv")).getKv;
};

describe("getKv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    RedisMock.mockClear();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("builds the client from the KV_* variables with the @vercel/kv defaults", async () => {
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";

    (await loadGetKv())();

    expect(RedisMock).toHaveBeenCalledTimes(1);
    expect(RedisMock).toHaveBeenCalledWith({
      url: "https://kv.example",
      token: "kv-token",
      cache: "default",
      enableAutoPipelining: true,
      enableTelemetry: false,
    });
  });

  it("falls back to the UPSTASH_REDIS_* variables", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

    (await loadGetKv())();

    expect(RedisMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://upstash.example", token: "upstash-token" }),
    );
  });

  it("prefers the KV_* variables when both are set", async () => {
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";
    process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token";

    (await loadGetKv())();

    expect(RedisMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://kv.example", token: "kv-token" }),
    );
  });

  it("reuses a single client", async () => {
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";

    const getKv = await loadGetKv();
    expect(getKv()).toBe(getKv());
    expect(RedisMock).toHaveBeenCalledTimes(1);
  });

  it("throws without credentials, like @vercel/kv", async () => {
    const getKv = await loadGetKv();
    expect(() => getKv()).toThrow(/KV_REST_API_URL/);
    expect(RedisMock).not.toHaveBeenCalled();
  });
});
