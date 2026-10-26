import { createContext, useContext } from "react";

export type AuthUser = {
  id: string;
  name?: string;
  email?: string;
  picture?: string;
};

export type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  error: Error | null;
  login: (options?: { returnTo?: string }) => Promise<void>;
  logout: () => void;
  getAccessToken: () => Promise<string>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used within an AuthProvider");
  return auth;
}
