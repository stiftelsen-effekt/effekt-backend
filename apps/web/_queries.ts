import { User } from "@auth0/auth0-react";
import useSWR from "swr";
import { apiResult, getAccessToken, getAccessTokenSilently } from "./hooks/useApi";
import { getUserId } from "./lib/user";
import { widgetContentQuery } from "./components/shared/components/Widget/components/Widget";
import { TRPCClientError } from "@trpc/client";
import { useTrpcClient } from "./lib/trpc/useTrpcClient";
import { publicTrpcFor } from "./lib/trpc/client";
import { toCauseArea, toOrganization } from "./lib/trpc/causeAreas";
import { useMainLocale } from "./context/MainLocaleContext";

export interface Query<T> {
  (
    user: User,
    fetchToken: getAccessTokenSilently,
    condition?: boolean,
    ...args: any[]
  ): apiResult<T> & {
    refreshing: boolean;
  };
}

const isPending = (data: unknown, error: unknown) => typeof data === "undefined" && !error;

/**
 * Runs a tRPC call from an SWR fetcher. A failure throws the same error object as fetcher(), which
 * these hooks used before: `info` is the error body, `status` the HTTP status.
 */
const trpcFetch = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (err) {
    const error = new Error("An error occurred while fetching the data.", { cause: err });
    (error as any).info = err instanceof TRPCClientError ? err.shape : undefined;
    (error as any).status = err instanceof TRPCClientError ? err.data?.httpStatus : undefined;
    throw error;
  }
};

/**
 * SWR keys of the Min Side tRPC queries. Revalidate with `mutate(minsideKeys.taxUnits(donorId))`.
 * useDistributions and useAgreementsDistributions share a key, as they shared a URL before.
 */
export const minsideKeys = {
  profile: (donorId: number) => ["minside.profile", donorId] as const,
  taxUnits: (donorId: number) => ["minside.taxUnits", donorId] as const,
  donationsAggregated: (donorId: number) => ["minside.donationsAggregated", donorId] as const,
  donations: (donorId: number) => ["minside.donations", donorId] as const,
  distributions: (donorId: number, kids: string[]) =>
    ["minside.distributions", donorId, kids.join(",")] as const,
  vippsAgreements: (donorId: number) => ["minside.vippsAgreements", donorId] as const,
  avtaleGiroAgreements: (donorId: number) => ["minside.avtaleGiroAgreements", donorId] as const,
  taxReports: (donorId: number) => ["minside.taxReports", donorId] as const,
};

/**
 * Matches every cached minside.distributions query of the donor, whatever KIDs it was for. Revalidate
 * with `mutate(isMinsideDistributionsKey(donorId))` after changing an agreement's distribution.
 */
export const isMinsideDistributionsKey =
  (donorId: number) =>
  (key: unknown): boolean =>
    Array.isArray(key) && key[0] === "minside.distributions" && key[1] === donorId;

const fetcher = async (
  url: string,
  fetchToken: getAccessTokenSilently | null = null,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
) => {
  const api = process.env.NEXT_PUBLIC_EFFEKT_API;
  const headers: Record<string, string> = {};

  if (fetchToken) {
    const token = await getAccessToken(fetchToken);
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(api + url, {
    method: method,
    headers: headers,
  });

  if (!response.ok) {
    let error = new Error("An error occurred while fetching the data.");
    // Attach extra info to the error object.
    (error as any).info = await response.json();
    (error as any).status = response.status;
    throw error;
  }

  return (await response.json()).content;
};

/**
 * Get total sum donated to each charity, per year. Through tRPC (minside.donationsAggregated); on
 * the Danish site the REST link maps it to GET /donors/:id/donations/aggregated.
 *
 * @param {User} user - Which user's data to fetch
 * @param {String} fetchToken - Access token
 */
export const useAggregatedDonations = (
  user: User | undefined,
  fetchToken: getAccessTokenSilently,
) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    user ? minsideKeys.donationsAggregated(getUserId(user)) : null,
    ([, donorId]) =>
      trpcFetch(() =>
        trpc.minside.donationsAggregated.query({
          donorId,
        }),
      ),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * Gets entire donation history. Through tRPC (minside.donations); on the Danish site the REST link
 * maps it to GET /donors/:id/donations/.
 *
 * @param {User} user - Which user's data to fetch
 * @param {String} getAccessTokenSilently - Retrieves access token
 * */
export const useDonations = (user: User | undefined, fetchToken: getAccessTokenSilently) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    user ? minsideKeys.donations(getUserId(user)) : null,
    ([, donorId]) => trpcFetch(() => trpc.minside.donations.query({ donorId })),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * Gets distribution of money between organizations in a donation. Through tRPC
 * (minside.distributions); on the Danish site the REST link maps it to
 * GET /donors/:id/distributions/?kids=….
 *
 * @param {User} user - Which user's data to fetch
 * @param {String} fetchToken - Access token
 * @param {boolean} condition -
 * @param {kids} string[] -
 * */
export const useDistributions = (
  user: User | undefined,
  fetchToken: getAccessTokenSilently,
  condition: boolean,
  kids: string[],
) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    condition && user ? minsideKeys.distributions(getUserId(user), Array.from(kids)) : null,
    ([, donorId, kidList]) =>
      trpcFetch(() =>
        trpc.minside.distributions.query({
          donorId,
          kids: kidList ? kidList.split(",") : [],
        }),
      ),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

export const useAgreementsDistributions = (
  user: User | undefined,
  fetchToken: getAccessTokenSilently,
  condition: boolean,
  kids: string[],
) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    condition && user ? minsideKeys.distributions(getUserId(user), Array.from(kids)) : null,
    ([, donorId, kidList]) =>
      trpcFetch(() =>
        trpc.minside.distributions.query({
          donorId,
          kids: kidList ? kidList.split(",") : [],
        }),
      ),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * The donor's AvtaleGiro agreements. Through tRPC (minside.avtaleGiroAgreements); not available on
 * the Danish site, whose agreements page uses useDKAgreements.
 */
export const useAvtalegiroAgreements = (
  user: User | undefined,
  fetchToken: getAccessTokenSilently,
) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    user ? minsideKeys.avtaleGiroAgreements(getUserId(user)) : null,
    ([, donorId]) =>
      trpcFetch(() =>
        trpc.minside.avtaleGiroAgreements.query({
          donorId,
        }),
      ),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * The donor's Vipps agreements. Through tRPC (minside.vippsAgreements); not available on the Danish
 * site.
 */
export const useVippsAgreements = (user: User | undefined, fetchToken: getAccessTokenSilently) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    user ? minsideKeys.vippsAgreements(getUserId(user)) : null,
    ([, donorId]) => trpcFetch(() => trpc.minside.vippsAgreements.query({ donorId })),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

export const useDKAgreements = (user: User | undefined, fetchToken: getAccessTokenSilently) => {
  const { data, error, isValidating } = useSWR(
    user ? `/donors/${getUserId(user)}/recurring/` : null,
    (url) => fetcher(url, fetchToken),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

export const useAgreementFeedbackTypes = () => {
  const { data, error, isValidating } = useSWR<
    {
      ID: number;
      name: string;
      isOther: boolean;
    }[]
  >(`/agreementfeedback/types`, (url: string) => fetcher(url));
  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * Every cause area with its organizations. Public tRPC widget.causeAreas, as the donation widget
 * uses; on the Danish site the REST link maps it to GET /causeareas/all/.
 */
export const useCauseAreas = () => {
  const trpc = publicTrpcFor(useMainLocale());
  const { data, error, isValidating } = useSWR(["widget.causeAreas"], () =>
    trpcFetch(async () => (await trpc.widget.causeAreas.query()).map(toCauseArea)),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * Every organization, inactive ones included. Public tRPC site.organizations; on the Danish site
 * the REST link maps it to GET /organizations/all/.
 */
export const useAllOrganizations = () => {
  const trpc = publicTrpcFor(useMainLocale());
  const { data, error, isValidating } = useSWR(["site.organizations"], () =>
    trpcFetch(async () => (await trpc.site.organizations.query()).map(toOrganization)),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * Gets the donor's profile. Through tRPC (minside.profile); on the Danish site the REST link maps
 * it to GET /donors/:id (lib/trpc/restLink.ts).
 */
export const useDonor = (user: User | undefined, fetchToken: getAccessTokenSilently) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    user ? minsideKeys.profile(getUserId(user)) : null,
    ([, donorId]) => trpcFetch(() => trpc.minside.profile.query({ donorId })),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * Gets the donor's tax units. Through tRPC (minside.taxUnits); on the Danish site the REST link maps
 * it to GET /donors/:id/taxunits/.
 */
export const useTaxUnits = (user: User | undefined, fetchToken: getAccessTokenSilently) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    user ? minsideKeys.taxUnits(getUserId(user)) : null,
    ([, donorId]) => trpcFetch(() => trpc.minside.taxUnits.query({ donorId })),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

/**
 * The donor's yearly tax reports (Norwegian deduction rules). Through tRPC (minside.taxReports);
 * not available on the Danish site.
 */
export const useYearlyTaxReports = (user: User | undefined, fetchToken: getAccessTokenSilently) => {
  const trpc = useTrpcClient(fetchToken);
  const { data, error, isValidating } = useSWR(
    user ? minsideKeys.taxReports(getUserId(user)) : null,
    ([, donorId]) => trpcFetch(() => trpc.minside.taxReports.query({ donorId })),
  );

  const loading = isPending(data, error);

  return {
    loading,
    isValidating,
    data,
    error,
  };
};

export const linksSelectorQuery = `
_type == 'navitem' => @ {
  ...,
  "slug": page->slug.current,
  "pagetype": page->_type,
},
_type == 'link' => @ {
  ...
},
`;

export const linksContentQuery = `links[] {
  ${linksSelectorQuery}
}`;

const cookieBannerQueryString = `
  ...,
  privacy_policy_link {
    "_key": coalesce(_id,_key,"id_privacy_policy_link"),
    _type,
    title,
    "slug": page->slug.current,
    "pagetype": coalesce(page->_type, "generic_page"),
  }
`;

const generalBannerQueryString = `
  ...,
  link {
    "_key": coalesce(_id,_key,"id_general_banner_link"),
    _type,
    title,
    "slug": page->slug.current,
    "pagetype": coalesce(page->_type, "generic_page"),
  }
`;

export const pageBannersContentQuery = `
  cookie_banner_configuration {
    ${cookieBannerQueryString}
  },
  general_banner-> {
    ${generalBannerQueryString}
  }
`;

const questionAndAnswerSelectionQuery = `
  ...,
  answers[] {
    ...,
    ${linksContentQuery}
} `;

export const pageContentQuery = `content[hidden!=true] {
  ...,
  blocks[] {
    _type == 'reference' => @->,
    _type == 'testimonials' =>  {
      ...,
      testimonials[]->{
        ...,
        image {
          asset->{
            _id,
            metadata {
              lqip
            }
          }
        }
      },
    },
    _type == 'organizationslist' =>  {
      ...,
      organizations[]->{
        ...,
        "organization_page_slug": organization_page->{
          slug {
            current
          }
        },
      },
    },
    _type == 'opendistributionbutton' =>  {
      ...,
      organization->,
    },
    _type == 'fullvideo' =>  {
      ...,
      video{
        asset->,
      },
    },
    _type == 'links' => {
      ...,
      ${linksContentQuery}
    },
    _type == 'questionandanswergroup' => {
      ${questionAndAnswerSelectionQuery}
    },
    _type == 'columns' => {
      ...,
      columns[] {
        ...,
        richText[] {
          ...,
          markDefs[] {
            ${linksSelectorQuery}
            _type != 'citation' => @ && _type != 'link' && _type != 'navitem',
          }
        },
        links[] {
          ${linksSelectorQuery}
        }
      }
    },
    _type == 'paragraph' => @ {
      ...,
      content[] {
        ...,
        markDefs[] {
          _type == 'citation' => @ {
            ...,
            "citations": citations[]->
          },
          ${linksSelectorQuery}
          _type != 'citation' => @ && _type != 'link' && _type != 'navitem',
        }
      }
    },
    _type == 'splitview' => {
      ...,
      richText[] {
        ...,
        markDefs[] {
          ${linksSelectorQuery}
          _type != 'citation' => @ && _type != 'link' && _type != 'navitem',
        }
      },
      ${linksContentQuery}
    },
    _type == 'splitviewhtml' => {
      ...,
      paragraph[] {
        ...,
        markDefs[] {
          ${linksSelectorQuery}
          _type != 'citation' => @ && _type != 'link' && _type != 'navitem',
        }
      }
    },
    _type == 'wealthcalculator' => {
      ...,
      configuration->{
        ...,
        data_explanation {
          _type == 'reference' => @->{
            ...,
            blocks[] {
              _type == 'paragraph' => @ {
                ...,
                content[] {
                  ...,
                  markDefs[] {
                    _type == 'citation' => @ {
                      ...,
                      "citations": citations[]->
                    },
                    ${linksSelectorQuery}
                    _type != 'citation' => @ && _type != 'link' && _type != 'navitem',
                  }
                }
              },
            }
          },
        },
      },
      impact_configuration->{
        ...,
        intervention_configuration {
          ...,
          output_configuration->{
            ...,
            "donate_label_short": *[ _type == "site_settings"][0].donate_label_short,
            "locale": *[ _type == "site_settings"][0].main_locale,
            explanation_links[] {
              ${linksSelectorQuery}
            },
          },
          "currency": *[ _type == "site_settings"][0].main_currency,
          "locale": *[ _type == "site_settings"][0].main_locale,
        },
      },
      "currency": *[ _type == "site_settings"][0].main_currency,
      "locale": *[ _type == "site_settings"][0].main_locale,
    },
    _type == 'contributorlist' => {
      ...,
      role->,
      contributors[]->{
        ...,
        image {
          asset->{
            _id,
            metadata {
              lqip
            }
          }
        }
      }
    },
    _type == 'inngress' => {
      ...,
      sidelinks[] {
        ${linksSelectorQuery}
      },
    },
    _type == 'wealthcalculatorteaser' => {
      ...,
      button {
        ${linksSelectorQuery}
      },
      "locale": *[ _type == "site_settings"][0].main_locale,
    },
    _type == 'interventionwidget' => {
      ...,
      output_configuration->{
        ...,
        "donate_label_short": *[ _type == "site_settings"][0].donate_label_short,
        "locale": *[ _type == "site_settings"][0].main_locale,
        explanation_links[] {
          ${linksSelectorQuery}
        },
      },
      "currency": *[ _type == "site_settings"][0].main_currency,
      "locale": *[ _type == "site_settings"][0].main_locale,
    },
    _type == 'giftcardteaser' => {
      ...,
      links[] {
        ${linksSelectorQuery}
      },
    },
    _type == 'giftcards' => {
      ...,
      "locale": *[_type == "site_settings"][0].main_locale,
      "currency": *[_type == "site_settings"][0].main_currency,
      giftcards[] {
        ...,
        links[] {
          ${linksSelectorQuery}
        },
      },
    },
    _type == 'normalimage' => {
      ...,
      image {
        asset -> {
          _id,
          metadata {
            lqip,
            dimensions {
              width,
              height
            }
          }
        }
      },
    },
    _type == 'fullimage' => {
      ...,
      image {
        asset -> {
          _id,
          metadata {
            lqip,
            dimensions {
              width,
              height
            }
          }
        }
      },
    },
    _type == 'giveblock' => {
      ...,
      "donate_label_short": *[ _type == "site_settings"][0].donate_label,
      "accent_color": *[ _type == "site_settings"][0].accent_color,
    },
    _type == 'teamintroduction' => {
      ...,
      contributor->{
        ...,
        image {
          asset -> {
            _id,
            metadata {
              lqip
            }
          }
        },
      },
      links {
        links[] {
          ${linksSelectorQuery}
        },
      },
    },
    _type == 'teasers' => {
      ...,
      teasers[] {
        ...,
        image {
          asset -> {
            _id,
            metadata {
              lqip
            }
          }
        },
        links[] {
          ${linksSelectorQuery}
        },
      },
    },
    _type == 'accordion' => {
      ...,
      blocks[] {
        _type == 'paragraph' => @ {
          ...,
          content[] {
            ...,
            markDefs[] {
              _type == 'citation' => @ {
                ...,
                "citations": citations[]->
              },
              ${linksSelectorQuery}
              _type != 'citation' => @ && _type != 'link' && _type != 'navitem',
            }
          }
        },
        _type != 'paragraph' => @,
      }
    },
    _type == 'philantropicteaser' => {
      ...,
      button {
        ...,
        link {
          ${linksSelectorQuery}
        },
      },
      people[]->,
      "locale": *[ _type == "site_settings"][0].main_locale,
    },
    _type == 'plausiblerevenuetracker' => {
      ...,
      "locale": *[ _type == "site_settings"][0].main_locale,
    },
    _type == 'donationwidgetblock' => {
      ...,
      donationwidget->{
        ${widgetContentQuery}
      }
    },
    _type == 'mediacoverageteaser' => {
      ...,
      coverage[] {
        ...,
        publication_logo {
          asset->{
            _id,
            metadata {
              lqip
            }
          }
        },
      },
      read_more_button {
        ...,
        "slug": page->slug.current,
        "pagetype": page->_type,
      },
    },
    _type == 'resultsteaser' => {
      ...,
      see_more_button {
        ...,
        "slug": page->slug.current,
        "pagetype": page->_type,
      },
      "locale": *[ _type == "site_settings"][0].main_locale,
    },
    _type == 'taxdeductionwidget' => {
      ...,
      "locale": *[ _type == "site_settings"][0].main_locale,
    },
    _type == 'newslettersignup' => {
      ...,
      "locale": *[ _type == "site_settings"][0].main_locale,
    },
    _type != 'splitviewhtml' && _type != 'teamintroduction' && _type!= 'fullimage' && _type != 'normalimage' && _type != 'teasers' && _type != 'giveblock' && _type != 'links' && _type != 'questionandanswergroup' && _type != 'reference' && _type != 'testimonials' && _type != 'organizationslist' && _type != 'opendistributionbutton' && _type != 'fullvideo' && _type!= 'paragraph' && _type != 'splitview' && _type != 'contributorlist' && _type != 'inngress' && _type != 'wealthcalculator' && _type != 'giftcardteaser' && _type != 'giftcards' && _type != 'columns' && _type != 'interventionwidget' && _type != 'wealthcalculatorteaser' && _type != 'accordion' && _type != 'plausiblerevenuetracker' && _type != 'philantropicteaser' && _type != 'mediacoverageteaser' && _type != 'resultsteaser' &&_type != 'taxdeductionwidget' && _type != 'donationwidgetblock' => @,
  }
},
`;
