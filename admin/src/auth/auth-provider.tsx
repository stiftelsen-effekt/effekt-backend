import type { ReactNode } from "react";
import { config } from "@/lib/config";
import { Auth0AuthProvider } from "./auth0-provider";
import { DevAuthProvider } from "./dev-provider";

const devModeRequested = config.auth.mode === "dev";
const devModeAllowed = devModeRequested && !import.meta.env.PROD;

export function AuthProvider({
  children,
  onRedirect,
}: {
  children: ReactNode;
  onRedirect: (path: string) => void;
}) {
  if (devModeRequested && !devModeAllowed) {
    throw new Error("VITE_AUTH_MODE=dev is not allowed in production builds.");
  }
  const Provider = devModeAllowed ? DevAuthProvider : Auth0AuthProvider;
  return <Provider onRedirect={onRedirect}>{children}</Provider>;
}
