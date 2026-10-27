import { createContext, useContext } from "react";

export type AuthUser = {
  id: string;
  name?: string;
  /** For greetings. Only ever from the identity's own claims, never a placeholder. */
  givenName?: string;
  email?: string;
  picture?: string;
};

export type PreviewUser = {
  id: string;
  label: string;
  email: string;
  description: string;
};

export type PreviewInfo = {
  pr: string | null;
  sha: string | null;
  seededAt: string | null;
};

/** Only in preview environments (VITE_AUTH_MODE=preview): "Continue as…" instead of a login. */
export type PreviewSession = {
  users: PreviewUser[];
  current: PreviewUser | null;
  info: PreviewInfo | null;
  continueAs: (userId: string, options?: { returnTo?: string }) => Promise<void>;
};

export type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  error: Error | null;
  login: (options?: { returnTo?: string }) => Promise<void>;
  logout: () => void;
  getAccessToken: () => Promise<string>;
  preview?: PreviewSession;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within an AuthProvider");
  return auth;
}

/** The signed-in user where there may be no auth provider (the /design demos): null there. */
export function useOptionalUser(): AuthUser | null {
  return useContext(AuthContext)?.user ?? null;
}

/**
 * A first name from identity claims: `given_name` when present, else the first word of
 * `name`, unless that is really an email address (Auth0 sets name = email for password
 * accounts) or an id.
 */
export function givenNameFrom(claims: { given_name?: unknown; name?: unknown }) {
  const given = typeof claims.given_name === "string" ? claims.given_name.trim() : "";
  if (given) return given;
  const name = typeof claims.name === "string" ? claims.name.trim() : "";
  if (!name || name.includes("@") || /\d/.test(name)) return undefined;
  return name.split(/\s+/)[0];
}
