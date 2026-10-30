import { useCallback, useMemo, useState, type ReactNode } from "react";
import { config } from "@/lib/config";
import { AuthContext, givenNameFrom, type AuthState, type AuthUser } from "./context";

/**
 * Local-only auth against the mock OIDC server from compose.dev.yml. Issues a
 * client-credentials token with the admin scope. Never active in production builds.
 */

const STORAGE_KEY = "effekt-admin-dev-token";

type StoredToken = { accessToken: string; expiresAt: number };

function readStored(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw) as StoredToken;
    return token.expiresAt > Date.now() + 30_000 ? token : null;
  } catch {
    return null;
  }
}

function decodeUser(accessToken: string): AuthUser {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1] ?? "")) as {
      sub?: string;
      name?: string;
      given_name?: string;
      email?: string;
    };
    return {
      id: payload.sub ?? "dev",
      name: payload.name ?? "Dev admin",
      // From the token's claims only; the display fallback above is not a name to greet.
      givenName: givenNameFrom(payload),
      email: payload.email,
    };
  } catch {
    return { id: "dev", name: "Dev admin" };
  }
}

async function requestToken(): Promise<StoredToken> {
  const response = await fetch(config.auth.devTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "admin",
      client_id: "effekt-admin-dev",
      client_secret: "dev",
    }),
  });
  if (!response.ok) {
    throw new Error(`Dev token request failed (${response.status}). Is the mock OIDC server up?`);
  }
  const body = (await response.json()) as { access_token: string; expires_in?: number };
  const token = {
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(token));
  } catch {
    // storage unavailable; token stays in memory
  }
  return token;
}

export function DevAuthProvider({
  children,
  onRedirect,
}: {
  children: ReactNode;
  onRedirect: (path: string) => void;
}) {
  const [token, setToken] = useState<StoredToken | null>(readStored);
  const [error, setError] = useState<Error | null>(null);

  const login = useCallback(
    async ({ returnTo }: { returnTo?: string } = {}) => {
      try {
        setError(null);
        setToken(await requestToken());
        onRedirect(returnTo ?? "/");
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [onRedirect],
  );

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setToken(null);
    onRedirect("/login");
  }, [onRedirect]);

  const getAccessToken = useCallback(async () => {
    const current = readStored() ?? token;
    if (current && current.expiresAt > Date.now() + 30_000) return current.accessToken;
    const fresh = await requestToken();
    setToken(fresh);
    return fresh.accessToken;
  }, [token]);

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated: token !== null,
      isLoading: false,
      error,
      user: token ? decodeUser(token.accessToken) : null,
      login,
      logout,
      getAccessToken,
    }),
    [token, error, login, logout, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
