import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useMemo, type ReactNode } from "react";
import { config } from "@/lib/config";
import { AuthContext, givenNameFrom, type AuthState } from "./context";

type AppState = { returnTo?: string };

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

  const value = useMemo<AuthState>(
    () => ({
      isAuthenticated,
      isLoading,
      error: error ?? null,
      user: user
        ? {
            id: user.sub ?? "",
            name: user.name,
            givenName: givenNameFrom(user),
            email: user.email,
            picture: user.picture,
          }
        : null,
      login: ({ returnTo } = {}) => loginWithRedirect({ appState: { returnTo } }),
      logout: () => void logout({ logoutParams: { returnTo: window.location.origin } }),
      getAccessToken: async () => {
        const token = await getAccessTokenSilently();
        if (!token) throw new Error("No access token");
        return token;
      },
    }),
    [isAuthenticated, isLoading, user, error, loginWithRedirect, logout, getAccessTokenSilently],
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
