import { FlagIcon, HandCoinsIcon, KeyRoundIcon, RepeatIcon, UserIcon } from "lucide-react";
import { useMemo } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { errorCode, useTRPCClient } from "@/lib/trpc";
import { appLocale } from "@/lib/locale";
import { isDigits, isVippsAgreementId, type SearchProvider } from "./providers";

const notFoundIsEmpty = <T>(promise: Promise<T>) =>
  promise.catch((error: unknown) => {
    if (errorCode(error) === "NOT_FOUND") return null;
    throw error;
  });

/** A query with only operators left ("-", "+") is a bad request, not a failure. */
const badRequestIsEmpty = <T>(promise: Promise<T>) =>
  promise.catch((error: unknown) => {
    if (errorCode(error) === "BAD_REQUEST") return null;
    throw error;
  });

/** Providers backed by the tRPC API. Mounted by the authenticated app layout. */
export function useApiSearchProviders(): SearchProvider[] {
  const client = useTRPCClient();
  return useMemo<SearchProvider[]>(
    () => [
      {
        id: "donors",
        group: "Donors",
        // The API matches name/email full text (+word requires, -word excludes, "a phrase",
        // prefix*), and an all-digit query matches the donor id.
        applies: (query) =>
          isDigits(query) || query.replace(/[+\-"*]/g, "").trim().length >= 2,
        async search(query, signal) {
          const result = await badRequestIsEmpty(
            client.donors.search.query({ query: query.trim(), page: 0, limit: 6 }, { signal }),
          );
          if (!result) return [];
          return result.rows.map((donor) => ({
            id: `donor-${donor.id}`,
            title: donor.name ?? donor.email,
            subtitle: donor.email,
            meta: `#${donor.id}`,
            href: `/donors/${donor.id}`,
            icon: UserIcon,
          }));
        },
      },
      {
        id: "donation",
        group: "Donations",
        applies: isDigits,
        async search(query, signal) {
          const donation = await notFoundIsEmpty(
            client.donations.get.query({ id: Number(query) }, { signal }),
          );
          if (!donation) return [];
          return [
            {
              id: `donation-${donation.id}`,
              title: `Donation #${donation.id}`,
              subtitle: `${donation.donor} · ${formatDate(donation.timestamp)}`,
              meta: formatMoney(donation.sum),
              href: `/donations/${donation.id}`,
              icon: HandCoinsIcon,
            },
          ];
        },
      },
      {
        id: "kid",
        group: "Distributions",
        applies: (query) => isDigits(query) && query.trim().length >= 5,
        async search(query, signal) {
          const kid = query.trim();
          const distribution = await notFoundIsEmpty(
            client.donations.distributions.get.query({ kid }, { signal }),
          );
          if (!distribution) return [];
          return [
            {
              id: `kid-${kid}`,
              title: `KID ${kid}`,
              subtitle: distribution.donor?.name ?? undefined,
              href: `/distributions/${kid}`,
              icon: KeyRoundIcon,
            },
          ];
        },
      },
      {
        id: "fundraiser",
        group: "Fundraisers",
        applies: isDigits,
        async search(query, signal) {
          const fundraiser = await notFoundIsEmpty(
            client.reports.fundraisers.get.query({ id: Number(query) }, { signal }),
          );
          if (!fundraiser) return [];
          return [
            {
              id: `fundraiser-${fundraiser.id}`,
              title: `Fundraiser #${fundraiser.id}`,
              subtitle: `${fundraiser.donationCount} donations · created ${formatDate(fundraiser.registered)}`,
              meta: formatMoney(fundraiser.totalSum),
              href: `/fundraisers/${fundraiser.id}`,
              icon: FlagIcon,
            },
          ];
        },
      },
      {
        id: "vipps-agreement",
        group: "Agreements",
        applies: (query) => appLocale.locale === "NO" && isVippsAgreementId(query),
        async search(query, signal) {
          const agreement = await notFoundIsEmpty(
            client.vipps.agreements.get.query({ id: query.trim() }, { signal }),
          );
          if (!agreement) return [];
          return [
            {
              id: `vipps-${agreement.id}`,
              title: `Vipps agreement ${agreement.id}`,
              meta: formatMoney(agreement.pricing.amount / 100),
              href: `/agreements/vipps/${agreement.id}`,
              icon: RepeatIcon,
            },
          ];
        },
      },
    ],
    [client],
  );
}
