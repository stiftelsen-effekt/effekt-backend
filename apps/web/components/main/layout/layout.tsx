import { MainLocaleContext, type MainLocale } from "../../../context/MainLocaleContext";
import { groq } from "next-sanity";
import { Dispatch, SetStateAction, createContext, useState, useMemo } from "react";
import { getClient } from "../../../lib/sanity.client";
import { withStaticProps } from "../../../util/withStaticProps";
import { Widget } from "../../shared/components/Widget/components/Widget";
import Footer from "../../shared/layout/Footer/Footer";
import styles from "../../shared/layout/Layout/Layout.module.scss";
import { GiveButton } from "./GiveButton/GiveButton";
import { PrefilledDistribution, WidgetPane, WidgetPaneProps } from "./WidgetPane/WidgetPane";
import { token } from "../../../token";
import { LiveQuery } from "../../shared/LiveQuery";
import React from "react";
import { stegaClean } from "@sanity/client/stega";
import { ConsentState } from "../../../proxy.page";
import CookieBannerWrapper from "../../shared/layout/CookieBanner/CookieBannerWrapper";
import {
  useExternalDonationWidget,
  getExternalDonationUrls,
} from "../../../util/externalDonationWidget";

export type WidgetContextType = {
  open: boolean;
  prefilled: PrefilledDistribution | null;
  prefilledSum: number | null;
};

export const WidgetContext = createContext<
  [WidgetContextType, Dispatch<SetStateAction<WidgetContextType>>]
>([{ open: false, prefilled: null, prefilledSum: null }, () => {}]);

export type BanerContextType = {
  consentState: ConsentState;
  consentExpired: boolean;
  privacyPolicyLastMajorChange: Date | undefined;
  generalBannerDismissed: boolean;
};

export const BannerContext = createContext<
  [BanerContextType, Dispatch<SetStateAction<BanerContextType>>]
>([
  {
    consentState: "undecided",
    consentExpired: false,
    privacyPolicyLastMajorChange: undefined,
    generalBannerDismissed: false,
  },
  () => {},
]);

type QueryResult = {
  settings: {
    donate_label_short: string;
    donate_label_title: string;
    accent_color: string;
    general_banner?: any;
    cookie_banner_configuration?: any;
    main_locale?: string | null;
  };
};

const query = groq`
  {
    "settings": *[_type == "site_settings"][0] {
      donate_label_short,
      donate_label_title,
      accent_color,
      general_banner,
      main_locale,
      cookie_banner_configuration {
        ...,
        privacy_policy_link {
          "_key": coalesce(_id,_key,"id_privacy_policy_link"),
          _type,
          title,
          "slug": page->slug.current,
          "pagetype": coalesce(page->_type, "generic_page"),
        }
      }
    }
  }
`;

export const Layout = withStaticProps(
  async ({
    draftMode = false,
    showGiveButton = true,
    consentState,
  }: {
    draftMode: boolean;
    showGiveButton: boolean;
    consentState: ConsentState;
  }) => {
    const result = await getClient(draftMode ? token : undefined).fetch<QueryResult>(query);
    const settings = result.settings;
    return {
      footer: await Footer.getStaticProps({ draftMode }),
      widget: await Widget.getStaticProps({ draftMode }),
      // isPreview: preview,
      giveButton: {
        donate_label_short: settings.donate_label_short,
        donate_label_title: settings.donate_label_title,
        accent_color: stegaClean(settings.accent_color),
      },
      general_banner: settings.general_banner,
      cookie_banner_configuration: settings.cookie_banner_configuration,
      // For useMainLocale(): picks the backend for public API calls, see lib/trpc/client.ts
      mainLocale: (stegaClean(settings.main_locale) ?? "no") as MainLocale,
      showGiveButton: showGiveButton,
      draftMode,
      consentState,
    };
  },
)(({
  children,
  footer,
  widget,
  giveButton,
  cookie_banner_configuration,
  mainLocale,
  consentState,
  showGiveButton,
  draftMode,
}) => {
  const [widgetContext, setInternalWidgetContext] = useState<WidgetContextType>({
    open: false,
    prefilled: null,
    prefilledSum: null,
  });
  const externalDonationUrls = getExternalDonationUrls(widget.data.result.external_donation_widget);
  const usesExternalWidget = externalDonationUrls !== null;
  const setWidgetContext = useExternalDonationWidget(
    externalDonationUrls,
    widgetContext,
    setInternalWidgetContext,
  );
  const widgetContextValue = useMemo<
    [WidgetContextType, Dispatch<SetStateAction<WidgetContextType>>]
  >(() => [widgetContext, setWidgetContext], [widgetContext, setWidgetContext]);

  const [banners, setBanners] = useState<BanerContextType>({
    consentState,
    consentExpired: false,
    privacyPolicyLastMajorChange: undefined,
    generalBannerDismissed: false,
  });

  if (widgetContext.open && window.innerWidth < 1180) {
    document.body.style.overflow = "hidden";
  } else if (typeof document !== "undefined") {
    document.body.style.overflow = "hidden";
  }

  return (
    <MainLocaleContext.Provider value={mainLocale}>
      <div className={styles.container}>
        {showGiveButton && (
          <GiveButton
            inverted={false}
            color={giveButton.accent_color}
            title={giveButton.donate_label_title}
            onClick={() => setWidgetContext({ open: true, prefilled: null, prefilledSum: null })}
          >
            {giveButton.donate_label_short}
          </GiveButton>
        )}
        <WidgetContext.Provider value={widgetContextValue}>
          <BannerContext.Provider value={[banners, setBanners]}>
            <CookieBannerWrapper cookieBannerConfig={cookie_banner_configuration} />
            {usesExternalWidget ? null : draftMode ? (
              <PreviewWidgetPane
                {...widget}
                prefilled={widgetContext.prefilled}
                prefilledSum={widgetContext.prefilledSum}
              />
            ) : (
              <WidgetPane
                {...widget}
                prefilled={widgetContext.prefilled}
                prefilledSum={widgetContext.prefilledSum}
              />
            )}
            <main className={styles.main}>{children}</main>
          </BannerContext.Provider>
        </WidgetContext.Provider>
        {draftMode ? <PreviewFooter {...footer} /> : <Footer {...footer} />}
      </div>
    </MainLocaleContext.Provider>
  );
});

const PreviewFooter: React.FC<Awaited<ReturnType<typeof Footer.getStaticProps>>> = (props) => {
  return (
    <LiveQuery data={props.data}>{(data) => <Footer {...(props as any)} data={data} />}</LiveQuery>
  );
};

const PreviewWidgetPane: React.FC<
  Awaited<ReturnType<typeof Widget.getStaticProps>> & WidgetPaneProps
> = (props) => {
  return (
    <LiveQuery data={props.data}>
      {(data) => <WidgetPane {...(props as any)} data={data} />}
    </LiveQuery>
  );
};
