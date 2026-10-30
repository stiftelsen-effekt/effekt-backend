import { createTRPCClient, httpBatchLink, httpLink, type TRPCClient } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@effekt/api";
import type { MainLocale } from "../../context/MainLocaleContext";
import { restLink } from "./restLink";

export type { AppRouter };
export type TrpcClient = TRPCClient<AppRouter>;
/** What each procedure returns (after its output schema), e.g. RouterOutputs["minside"]["donations"] */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Which backend the site talks to. The Danish site's backend (giveffektivt/donation-platform) has
 * no tRPC endpoint, so it gets REST through restLink; every other site uses our backend's /trpc.
 * Derived from the Sanity site setting main_locale, the same switch Min Side already uses for
 * Danish behaviour, so no deployment setting is needed.
 */
export type ApiFlavor = "trpc" | "rest";
export const apiFlavorFor = (mainLocale: MainLocale): ApiFlavor =>
  mainLocale === "dk" ? "rest" : "trpc";

export const apiUrl = () => process.env.NEXT_PUBLIC_EFFEKT_API || "http://localhost:5050";

export const createWebTrpcClient = ({
  flavor,
  getToken,
  url = apiUrl(),
}: {
  flavor: ApiFlavor;
  /** Returns the Auth0 access token (getAccessToken from hooks/useApi) */
  getToken: () => Promise<string>;
  url?: string;
}): TrpcClient =>
  createTRPCClient<AppRouter>({
    links: [
      flavor === "rest"
        ? restLink<AppRouter>({ url, getToken })
        : httpBatchLink({
            url: `${url}/trpc`,
            headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
          }),
    ],
  });

/**
 * A client for the public donation widget: no token, and no batching (the backend refuses widget
 * mutations inside a batch so the per-IP rate limit counts each one). On the Danish site it is the
 * REST link, which only maps the widget's public reads.
 */
export const createPublicTrpcClient = ({
  flavor,
  url = apiUrl(),
}: {
  flavor: ApiFlavor;
  url?: string;
}): TrpcClient =>
  createTRPCClient<AppRouter>({
    links: [flavor === "rest" ? restLink<AppRouter>({ url }) : httpLink({ url: `${url}/trpc` })],
  });

const publicClients: Partial<Record<ApiFlavor, TrpcClient>> = {};

/**
 * The public client (no token, no batching) for a site, by its Sanity main_locale. Shared per
 * flavor, so server-side rendering and client components reuse one client.
 */
export const publicTrpcFor = (mainLocale: MainLocale | string | null | undefined): TrpcClient => {
  const flavor = apiFlavorFor((mainLocale ?? "no") as MainLocale);
  return (publicClients[flavor] ??= createPublicTrpcClient({ flavor }));
};
