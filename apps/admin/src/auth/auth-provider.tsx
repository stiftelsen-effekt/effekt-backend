import type { ReactNode } from "react";
import { config } from "@/lib/config";
import { Auth0AuthProvider } from "./auth0-provider";
import { DevAuthProvider } from "./dev-provider";
import { resolveAuthMode } from "./mode";
import { PreviewAuthProvider } from "./preview-provider";

export function AuthProvider({
  children,
  onRedirect,
}: {
  children: ReactNode;
  onRedirect: (path: string) => void;
}) {
  const mode = resolveAuthMode({
    requested: config.auth.mode,
    production: import.meta.env.PROD,
    buildMode: import.meta.env.MODE,
  });
  const Provider =
    mode === "dev" ? DevAuthProvider : mode === "preview" ? PreviewAuthProvider : Auth0AuthProvider;
  return <Provider onRedirect={onRedirect}>{children}</Provider>;
}
