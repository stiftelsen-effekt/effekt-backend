export type AuthMode = "auth0" | "dev" | "preview";

const env = import.meta.env;

/** Built with `vite build --mode preview` (the per-PR preview image, see docs/preview-environments.md). */
export const isPreviewBuild = env.MODE === "preview";

const authModes: readonly AuthMode[] = ["auth0", "dev", "preview"];

export const config = {
  // Preview builds are served by the API itself, so they call it on the same origin.
  apiUrl: (env.VITE_API_URL || (isPreviewBuild ? "" : "http://localhost:5050")).replace(/\/$/, ""),
  auth: {
    mode: (authModes.includes(env.VITE_AUTH_MODE as AuthMode)
      ? env.VITE_AUTH_MODE
      : "auth0") as AuthMode,
    domain: env.VITE_AUTH_DOMAIN ?? "",
    clientId: env.VITE_AUTH_CLIENT_ID ?? "",
    audience: env.VITE_AUTH_AUDIENCE ?? "",
    scope: env.VITE_AUTH_SCOPE || undefined,
    devTokenUrl: env.VITE_DEV_AUTH_TOKEN_URL || "/dev-auth/effekt/token",
  },
  features: {
    regranting: env.VITE_FEATURE_REGRANTING !== "false",
    // Until historical rounds and transfers are imported, every donation ever received shows
    // as owed; the regranting pages say so.
    regrantingBackfilled: env.VITE_REGRANTING_BACKFILLED !== "false",
  },
} as const;
