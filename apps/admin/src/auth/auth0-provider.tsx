import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { config } from "@/lib/config";
import { AuthContext, authUserFromClaims, isSessionEndedError, type AuthState } from "./context";

type AppState = { returnTo?: string };

const currentPath = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

function Auth0Bridge({ children }: { children: ReactNode }) {
  const auth0 = useAuth0();
  const {
    isAuthenticated,
    isLoading,
    user,
    error,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  } = auth0;

  const getAccessToken = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      if (!token) throw new Error("No access token");
      return token;
    } catch (error) {
      // The Auth0 session ended: back to the login, then to this page.
      if (isSessionEndedError(error)) {
        void loginWithRedirect({ appState: { returnTo: currentPath() } });
      }
      throw error;
    }
  }, [getAccessTokenSilently, loginWithRedirect]);

  // Check when the tab comes back, so an ended session goes to the login before the next click.
  useEffect(() => {
    if (!isAuthenticated) return;
    const check = () => {
      if (document.visibilityState === "visible") getAccessToken().catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [isAuthenticated, getAccessToken]);

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated,
      isLoading,
      error: error ?? null,
      user: user ? authUserFromClaims(user) : null,
      login: ({ returnTo } = {}) => loginWithRedirect({ appState: { returnTo } }),
      logout: () => void logout({ logoutParams: { returnTo: window.location.origin } }),
      getAccessToken,
    }),
    [isAuthenticated, isLoading, user, error, loginWithRedirect, logout, getAccessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function Auth0AuthProvider({
  children,
  onRedirect,
}: {
  children: ReactNode;
  onRedirect: (path: string) => void;
}) {
  return (
    <Auth0Provider
      domain={config.auth.domain}
      clientId={config.auth.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: config.auth.audience,
        scope: config.auth.scope,
      }}
      cacheLocation={import.meta.env.PROD ? "memory" : "localstorage"}
      onRedirectCallback={(appState?: AppState) => onRedirect(appState?.returnTo ?? "/")}
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  );
}
