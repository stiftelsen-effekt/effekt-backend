/**
 * URL state of the Agreements list and its translation into the `agreements.list` filter.
 * The admin is Norway-only: the list always asks for Vipps and AvtaleGiro agreements.
 */
import { defineList, param, type FilterValues } from "@/components/filters/list-state";
import type { AgreementStatus } from "@/lib/status";
import type { RouterInputs, RouterOutputs } from "@/lib/trpc";
import type { AgreementRow } from "./model";

export const listProviders = ["vipps", "avtalegiro"] as const;
export type ListProvider = (typeof listProviders)[number];

/** The normalised statuses Vipps and AvtaleGiro agreements can have. */
export const listStatuses = [
  "active",
  "paused",
  "pending",
  "stopped",
] as const satisfies readonly AgreementStatus[];

export const agreementsList = defineList({
  id: "agreements",
  filters: {
    /** Donor name or email; all digits is a KID */
    q: param.text,
    kid: param.text,
    provider: param.list(listProviders),
    status: param.list(listStatuses),
    amount: param.range,
    chargeDay: param.range,
    created: param.dateRange,
  },
  sortable: ["created", "amount", "chargeDay", "donorName", "status", "provider", "KID", "id"],
  defaultSort: { id: "created", desc: true },
});

export type AgreementListFilters = FilterValues<typeof agreementsList.filters>;
export type AgreementApiFilter = NonNullable<RouterInputs["agreements"]["list"]["filter"]>;
export type AgreementListApiRow = RouterOutputs["agreements"]["list"]["rows"][number];

const range = (value: { min?: number; max?: number } | undefined) =>
  value && { from: value.min, to: value.max };

/** Charge days are 0–28; anything outside is clamped so a typo doesn't fail the request. */
const dayRange = (value: { min?: number; max?: number } | undefined) => {
  const clamp = (day: number | undefined) =>
    day === undefined ? undefined : Math.min(28, Math.max(0, Math.round(day)));
  return value && { from: clamp(value.min), to: clamp(value.max) };
};

/**
 * URL filters → agreements.list filter. The search box takes a donor's name or email, or
 * (all digits) part of a KID. Providers are always limited to the ones this admin handles.
 */
export function toAgreementFilter(filters: AgreementListFilters): AgreementApiFilter {
  const q = filters.q?.trim();
  const qIsKid = Boolean(q && /^\d+$/.test(q));
  const filter: AgreementApiFilter = {
    providers: filters.provider?.length ? filters.provider : [...listProviders],
    statuses: filters.status?.length ? filters.status : undefined,
    amount: range(filters.amount),
    chargeDay: dayRange(filters.chargeDay),
    created: filters.created,
    donor: q && !qIsKid ? q : undefined,
    KID: filters.kid?.trim() || (qIsKid ? q : undefined),
  };
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as AgreementApiFilter;
}

export const toListStatus = (status: AgreementListApiRow["status"]): AgreementStatus => status;

/** A row of agreements.list as the shared AgreementRow. */
export function fromListRow(row: AgreementListApiRow): AgreementRow {
  return {
    type: row.provider as ListProvider,
    key: `${row.provider}:${row.id}`,
    id: row.id,
    KID: row.KID,
    donorName: row.donorName ?? "",
    donorId: row.donorId,
    amount: row.amount,
    chargeDay: row.chargeDay,
    status: toListStatus(row.status),
    providerStatus: row.providerStatus,
    pausedUntil: row.pausedUntil,
    created: toIso(row.created),
    cancelled: toIso(row.cancelled),
    href: `/agreements/${row.provider}/${row.id}`,
    orgSplit: row.orgSplit,
  };
}

const toIso = (value: string | Date | null) =>
  value == null ? null : typeof value === "string" ? value : value.toISOString();
