/**
 * One agreement model across Vipps and AvtaleGiro. The two APIs return different shapes
 * (active 0|1 vs status string, payment_date vs monthly_charge_day); pages work with
 * AgreementRow and never touch the raw shapes.
 */
import type { AgreementStatus } from "@/lib/status";
import type { RouterOutputs } from "@/lib/trpc";

export type AgreementType = "vipps" | "avtalegiro";

export const agreementTypes: Record<AgreementType, { label: string; short: string }> = {
  vipps: { label: "Vipps", short: "Vipps" },
  avtalegiro: { label: "AvtaleGiro", short: "AvtaleGiro" },
};

export type VippsAgreementListRow = RouterOutputs["vipps"]["agreements"]["list"]["rows"][number];
export type AvtaleGiroListRow = RouterOutputs["giro"]["avtalegiro"]["list"]["rows"][number];

export type AgreementRow = {
  type: AgreementType;
  /** Unique across types: "vipps:agr_x", "avtalegiro:12". Use as table row id. */
  key: string;
  /** The type's own id, as the API wants it back. */
  id: string;
  KID: string;
  donorName: string;
  /** Monthly amount in kroner. */
  amount: number;
  /** Day of month, 1–28; 0 means the last day of the month. */
  chargeDay: number;
  status: AgreementStatus;
  created: string | null;
  cancelled: string | null;
  href: string;
  /** The provider's own status ("ACTIVE", "inactive"); only from agreements.list. */
  providerStatus?: string;
  /** Vipps only, YYYY-MM-DD; only from agreements.list. */
  pausedUntil?: string | null;
  donorId?: number;
};

const vippsStatus: Record<string, AgreementStatus> = {
  ACTIVE: "active",
  PENDING: "pending",
  STOPPED: "stopped",
  // Never accepted in the app; agreements.list maps it the same way.
  EXPIRED: "stopped",
};

export function fromVipps(row: VippsAgreementListRow): AgreementRow {
  return {
    type: "vipps",
    key: `vipps:${row.ID}`,
    id: String(row.ID),
    KID: row.KID,
    donorName: row.full_name,
    amount: row.amount,
    chargeDay: row.monthly_charge_day,
    status: vippsStatus[row.status] ?? "pending",
    created: row.timestamp_created,
    cancelled: null,
    href: `/agreements/vipps/${row.ID}`,
  };
}

export function fromAvtaleGiro(row: AvtaleGiroListRow): AgreementRow {
  return {
    type: "avtalegiro",
    key: `avtalegiro:${row.ID}`,
    id: String(row.ID),
    KID: row.KID,
    donorName: row.full_name,
    amount: row.amount,
    chargeDay: row.payment_date,
    status: row.active ? "active" : row.cancelled ? "stopped" : "pending",
    created: row.created,
    cancelled: row.cancelled,
    href: `/agreements/avtalegiro/${row.ID}`,
  };
}

/** 1st, 2nd, 3rd, 4th … 21st, 22nd. */
export function ordinal(day: number) {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10];
  return `${day}${suffix ?? "th"}`;
}

/** "15th of every month" / "Last day of the month". 0 is the last day of the month. */
export function describeChargeDay(day: number) {
  if (day === 0) return "Last day of the month";
  return `${ordinal(day)} of every month`;
}

/** Short form for table cells: "15th" / "Last". */
export const shortChargeDay = (day: number) => (day === 0 ? "Last" : ordinal(day));
