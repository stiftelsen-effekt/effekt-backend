import {
  FlagIcon,
  HandCoinsIcon,
  InboxIcon,
  KeyRoundIcon,
  RepeatIcon,
  UserIcon,
} from "lucide-react";
import { useMemo } from "react";
import { reviewStatus } from "@/lib/status";
import { formatDate, formatMoney } from "@/lib/format";
import { sourceLabel } from "@/features/review-queue/model";
import { errorCode, useTRPCClient } from "@/lib/trpc";
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
        applies: (query) => isDigits(query) || query.replace(/[+\-"*]/g, "").trim().length >= 2,
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
              subtitle: `${fundraiser.donationCount} donations · created ${formatDate(
                fundraiser.registered,
              )}`,
              meta: formatMoney(fundraiser.totalSum),
              href: `/fundraisers/${fundraiser.id}`,
              icon: FlagIcon,
            },
          ];
        },
      },
      {
        // Our database's copy, so search works when Vipps can't be reached.
        id: "vipps-agreement",
        group: "Agreements",
        applies: (query) => isVippsAgreementId(query),
        async search(query, signal) {
          const result = await client.vipps.agreements.list.query(
            { page: 0, limit: 6, filter: { agreementID: query.trim() } },
            { signal },
          );
          return result.rows.map((agreement) => ({
            id: `vipps-${agreement.ID}`,
            title: `Vipps agreement ${agreement.ID}`,
            subtitle: agreement.full_name ?? undefined,
            meta: `${formatMoney(agreement.amount)} / month`,
            href: `/agreements/vipps/${agreement.ID}`,
            icon: RepeatIcon,
          }));
        },
      },
      {
        id: "avtalegiro-agreement",
        group: "Agreements",
        applies: (query) => isDigits(query) && query.trim().length <= 9,
        async search(query, signal) {
          const agreement = await notFoundIsEmpty(
            client.giro.avtalegiro.get.query({ id: Number(query) }, { signal }),
          );
          if (!agreement) return [];
          return [
            {
              id: `avtalegiro-${agreement.ID}`,
              title: `AvtaleGiro agreement #${agreement.ID}`,
              subtitle: agreement.full_name ?? undefined,
              meta: `${formatMoney(agreement.amount)} / month`,
              href: `/agreements/avtalegiro/${agreement.ID}`,
              icon: RepeatIcon,
            },
          ];
        },
      },
      {
        id: "agreement-kid",
        group: "Agreements",
        applies: (query) => isDigits(query) && query.trim().length >= 5,
        async search(query, signal) {
          const result = await client.agreements.list.query(
            {
              page: 0,
              limit: 6,
              filter: { providers: ["vipps", "avtalegiro"], KID: query.trim() },
            },
            { signal },
          );
          return result.rows.map((agreement) => ({
            id: `kid-${agreement.provider}-${agreement.id}`,
            title: `${agreement.provider === "vipps" ? "Vipps" : "AvtaleGiro"} agreement · KID ${
              agreement.KID
            }`,
            subtitle: agreement.donorName ?? undefined,
            meta: `${formatMoney(agreement.amount)} / month`,
            href: `/agreements/${agreement.provider}/${agreement.id}`,
            icon: RepeatIcon,
          }));
        },
      },
      {
        // Unmatched transactions: an item id, or part of a KID, reference, payer or message.
        id: "review-item",
        group: "Review queue",
        applies: (query) => query.trim().length >= 3 || isDigits(query),
        async search(query, signal) {
          const items = await badRequestIsEmpty(
            client.reports.reviewQueue.search.query({ query: query.trim(), limit: 5 }, { signal }),
          );
          return (items ?? []).map((item) => ({
            id: `review-${item.id}`,
            title: `${formatMoney(item.amount)} from ${sourceLabel(item.source)}`,
            subtitle: [
              `Item #${item.id}`,
              reviewStatus[item.status].label,
              item.name,
              item.KID && `KID ${item.KID}`,
            ]
              .filter(Boolean)
              .join(" · "),
            meta: item.date ? formatDate(item.date) : undefined,
            href: `/import/review/${item.id}`,
            icon: InboxIcon,
          }));
        },
      },
    ],
    [client],
  );
}
