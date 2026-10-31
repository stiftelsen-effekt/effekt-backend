import { describe, expect, it, vi } from "vitest";
import {
  PLAUSIBLE_EVENT_ENDPOINT,
  VisibilityBeaconEnv,
  createVisibilityHiddenHandler,
} from "./visibilityBeacon";

const makeEnv = (overrides: Partial<VisibilityBeaconEnv> = {}) => {
  const sendBeacon = vi.fn(() => true);
  const env: VisibilityBeaconEnv = {
    isTrackingEnabled: () => true,
    getVisibilityState: () => "hidden",
    getLocation: () => ({ href: "https://gieffektivt.no/resultater", hostname: "gieffektivt.no" }),
    sendBeacon,
    ...overrides,
  };
  return { env, sendBeacon: overrides.sendBeacon ?? sendBeacon };
};

describe("createVisibilityHiddenHandler", () => {
  it("sends the visibility_hidden event when the page is hidden and tracking is enabled", () => {
    const { env, sendBeacon } = makeEnv();
    createVisibilityHiddenHandler(env)();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith(
      PLAUSIBLE_EVENT_ENDPOINT,
      JSON.stringify({
        name: "visibility_hidden",
        url: "https://gieffektivt.no/resultater",
        domain: "gieffektivt.no",
      }),
    );
  });

  it("does not send anything when tracking is disabled", () => {
    const { env, sendBeacon } = makeEnv({ isTrackingEnabled: () => false });
    createVisibilityHiddenHandler(env)();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("does not send anything when the page becomes visible", () => {
    const { env, sendBeacon } = makeEnv({ getVisibilityState: () => "visible" });
    createVisibilityHiddenHandler(env)();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("checks tracking each time the event fires", () => {
    let enabled = false;
    const { env, sendBeacon } = makeEnv({ isTrackingEnabled: () => enabled });
    const handler = createVisibilityHiddenHandler(env);
    handler();
    expect(sendBeacon).not.toHaveBeenCalled();
    enabled = true;
    handler();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    enabled = false;
    handler();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
