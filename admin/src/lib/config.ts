export type AuthMode = "auth0" | "dev";

const env = import.meta.env;

export const config = {
  apiUrl: (env.VITE_API_URL || "http://localhost:5050").replace(/\/$/, ""),
  auth: {
    mode: (env.VITE_AUTH_MODE === "dev" ? "dev" : "auth0") as AuthMode,
    domain: env.VITE_AUTH_DOMAIN ?? "",
    clientId: env.VITE_AUTH_CLIENT_ID ?? "",
    audience: env.VITE_AUTH_AUDIENCE ?? "",
    scope: env.VITE_AUTH_SCOPE || undefined,
    devTokenUrl: env.VITE_DEV_AUTH_TOKEN_URL || "/dev-auth/effekt/token",
  },
} as const;
