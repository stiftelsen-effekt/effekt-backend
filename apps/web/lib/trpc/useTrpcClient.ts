import { useMemo } from "react";
import { useMainLocale } from "../../context/MainLocaleContext";
import { getAccessToken, getAccessTokenSilently } from "../../hooks/useApi";
import { apiFlavorFor, createWebTrpcClient } from "./client";

/** A tRPC client for the signed-in donor, on the backend this site uses (see apiFlavorFor) */
export const useTrpcClient = (fetchToken: getAccessTokenSilently) => {
  const flavor = apiFlavorFor(useMainLocale());
  return useMemo(
    () => createWebTrpcClient({ flavor, getToken: () => getAccessToken(fetchToken) }),
    [flavor, fetchToken],
  );
};
