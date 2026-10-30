import type { AuthMode } from "@/lib/config";

/**
 * Which auth provider a build may use. Production builds only ever use Auth0: dev auth (the
 * local mock issuer) needs a non-production build, and preview auth ("Continue as…" against a
 * preview API) needs a non-production build or one made with `vite build --mode preview`.
 */
export function resolveAuthMode({
  requested,
  production,
  buildMode,
}: {
  requested: AuthMode;
  production: boolean;
  buildMode: string;
}): AuthMode {
  if (requested === "dev" && production) {
    throw new Error("VITE_AUTH_MODE=dev is not allowed in production builds.");
  }
  if (requested === "preview" && production && buildMode !== "preview") {
    throw new Error(
      "VITE_AUTH_MODE=preview is only allowed in preview builds (vite build --mode preview).",
    );
  }
  return requested;
}
