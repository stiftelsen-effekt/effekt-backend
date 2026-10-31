export const PLAUSIBLE_EVENT_ENDPOINT = "https://plausible.io/api/event";

export type VisibilityBeaconEnv = {
  isTrackingEnabled: () => boolean;
  getVisibilityState: () => DocumentVisibilityState;
  getLocation: () => { href: string; hostname: string };
  sendBeacon: (url: string, data: string) => boolean;
};

/**
 * Creates a visibilitychange handler that sends a Plausible `visibility_hidden` event when the
 * page is hidden. Whether tracking is enabled is checked each time the event fires, so a change
 * of consent after the listener was registered is respected.
 */
export const createVisibilityHiddenHandler = (env: VisibilityBeaconEnv) => () => {
  if (env.getVisibilityState() !== "hidden") return;
  if (!env.isTrackingEnabled()) return;
  const { href, hostname } = env.getLocation();
  env.sendBeacon(
    PLAUSIBLE_EVENT_ENDPOINT,
    JSON.stringify({ name: "visibility_hidden", url: href, domain: hostname }),
  );
};
