import "../styles/globals.css";
import type { AppProps } from "next/app";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import PlausibleProvider from "next-plausible";
import dynamic from "next/dynamic";

// import { usePreviewSubscription } from "../lib/sanity";
import { RouterContext, RouterContextValue, fetchRouterContext } from "../context/RouterContext";
import { getProfileLayoutStaticProps } from "../components/profile/layout/layoutStaticProps";
import { Layout } from "../components/main/layout/layout";
import { FullPageSpinner } from "../components/shared/layout/FullPageSpinner/FullPageSpinner";
import { ConsentState } from "../proxy.page";
import {
  createWidgetStore,
  WidgetStoreProvider,
} from "../components/shared/components/Widget/store/store";
import { useRouter } from "next/router";
import { getReferralCodeFromQuery, storeReferralCode } from "../util/referralCode";
import { useTrackingEnabled } from "../hooks/useTrackingEnabled";
import { createVisibilityHiddenHandler } from "../util/visibilityBeacon";

const PreviewProvider = lazy(() => import("../components/shared/PreviewProvider"));
// The Min side layout (with Auth0) is only loaded on dashboard pages. It is still server-rendered,
// and Next loads its chunk before hydrating. On client-side navigation the placeholder matches
// what the layout itself shows while it checks the login.
const ProfileLayout = dynamic(
  () => import("../components/profile/layout/layout").then((m) => m.ProfileLayout),
  { loading: () => <FullPageSpinner /> },
);
const VisualEditing = dynamic(
  () => import("@sanity/visual-editing/next-pages-router").then((mod) => mod.VisualEditing),
  { ssr: false },
);
// The widget pane's state, kept for the whole visit
const globalWidgetStore = createWidgetStore();

export enum LayoutType {
  Default = "default",
  Profile = "profile",
}

export type GeneralPageProps = Record<string, unknown> & {
  preview: boolean;
  draftMode: boolean;
  token: string | null;
  data?: {
    result: Record<string, unknown>;
    query: string;
    queryParams: { slug?: string };
  };
  appStaticProps?: Awaited<ReturnType<typeof getAppStaticProps>>;
};

function MyApp({
  Component,
  pageProps: { appStaticProps, preview, ...pageProps },
}: AppProps<GeneralPageProps>) {
  // check for plausible_ignore localstorage to disable plausible tracking
  const tracking = useTrackingEnabled();
  const router = useRouter();

  // Keep the router context from the first page load for the lifetime of the app
  const [routerContextValue] = useState<RouterContextValue | null>(
    () => appStaticProps?.routerContext || null,
  );

  useEffect(() => {
    if (!router.isReady) return;
    const referralCode = getReferralCodeFromQuery(router.query);
    if (referralCode) storeReferralCode(referralCode);
  }, [router.isReady, router.query]);

  // Keep the latest tracking state in a ref, so the visibilitychange listener (registered once)
  // reads the current value when the event fires rather than the value from the first render
  const trackingRef = useRef(tracking);
  useEffect(() => {
    trackingRef.current = tracking;
  }, [tracking]);

  useEffect(() => {
    if (window.location.hostname === "localhost") return;
    const handleVisibilityChange = createVisibilityHiddenHandler({
      isTrackingEnabled: () => trackingRef.current,
      getVisibilityState: () => document.visibilityState,
      getLocation: () => window.location,
      sendBeacon: (url, data) => navigator.sendBeacon(url, data),
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  if (!appStaticProps) {
    console.error(`appStaticProps is not defined - did you forget to use getAppStaticProps?`);

    return <Component {...pageProps} />;
  }

  // In draft mode getStaticProps passes the server-only SANITY_API_READ_TOKEN as pageProps.token
  // (only after /api/draft validated Sanity's preview secret), so the token never ships in the
  // JavaScript bundle. A page in draft mode without one renders published content.
  if (pageProps.draftMode && !pageProps.token) {
    console.warn("Draft mode without a Sanity token in pageProps; showing published content");
  }

  if (pageProps.draftMode && pageProps.token) {
    return (
      <PreviewProvider token={pageProps.token}>
        <PlausibleProvider enabled={tracking}>
          <WidgetStoreProvider store={globalWidgetStore}>
            <RouterContext.Provider value={routerContextValue}>
              {appStaticProps.layout === LayoutType.Default ? (
                <Layout {...appStaticProps.layoutProps}>
                  <Component {...pageProps} />
                </Layout>
              ) : (
                <ProfileLayout {...appStaticProps.layoutProps}>
                  <Component {...pageProps} />
                </ProfileLayout>
              )}
            </RouterContext.Provider>
          </WidgetStoreProvider>
        </PlausibleProvider>
        <Suspense>
          <VisualEditing zIndex={Number.MAX_SAFE_INTEGER} />
        </Suspense>
      </PreviewProvider>
    );
  }

  return (
    <PlausibleProvider>
      <WidgetStoreProvider store={globalWidgetStore}>
        <RouterContext.Provider value={routerContextValue}>
          {appStaticProps.layout === LayoutType.Default ? (
            <Layout {...appStaticProps.layoutProps}>
              <Component {...pageProps} />
            </Layout>
          ) : (
            <ProfileLayout {...appStaticProps.layoutProps}>
              <Component {...pageProps} />
            </ProfileLayout>
          )}
        </RouterContext.Provider>
      </WidgetStoreProvider>
    </PlausibleProvider>
  );
}

export async function getAppStaticProps({
  draftMode = false,
  consentState,
  layout = LayoutType.Default,
  showGiveButton = true,
}: {
  draftMode: boolean;
  consentState: ConsentState;
  layout?: LayoutType;
  showGiveButton?: boolean;
}) {
  const routerContext = await fetchRouterContext();

  const appStaticProps = {
    routerContext,
    ...(layout === LayoutType.Default
      ? {
          layout: LayoutType.Default as const,
          layoutProps: await Layout.getStaticProps({ draftMode, consentState, showGiveButton }),
        }
      : {
          layout: LayoutType.Profile as const,
          layoutProps: await getProfileLayoutStaticProps({ draftMode, consentState }),
        }),
  };
  return appStaticProps;
}

export default MyApp;
