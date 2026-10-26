/**
 * One agreement model across Vipps, AvtaleGiro and AutoGiro. The three APIs return
 * different shapes (ID vs id, active 0|1 vs boolean vs status string, payment_date vs
 * monthly_charge_day); pages work with AgreementRow and never touch the raw shapes.
 *
 * Which types exist depends on the build: NO has Vipps + AvtaleGiro, SE has AutoGiro.
 */
import type { Locale } from "@/lib/config";
import type { AgreementStatus } from "@/lib/status";
import type { RouterOutputs } from "@/lib/trpc";

export type AgreementType = "vipps" | "avtalegiro" | "autogiro";

export const agreementTypes: Record<AgreementType, { label: string; short: string }> = {
  vipps: { label: "Vipps", short: "Vipps" },
  avtalegiro: { label: "AvtaleGiro", short: "AvtaleGiro" },
  autogiro: { label: "AutoGiro", short: "AutoGiro" },
};

export const agreementTypesFor = (locale: Locale): AgreementType[] =>
  locale === "NO" ? ["vipps", "avtalegiro"] : ["autogiro"];

export type VippsAgreementListRow = RouterOutputs["vipps"]["agreements"]["list"]["rows"][number];
export type AvtaleGiroListRow = RouterOutputs["giro"]["avtalegiro"]["list"]["rows"][number];
export type AutoGiroListRow = RouterOutputs["giro"]["autogiro"]["list"]["rows"][number];

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
};

const vippsStatus: Record<string, AgreementStatus> = {
  ACTIVE: "active",
  PENDING: "pending",
  STOPPED: "stopped",
  EXPIRED: "expired",
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

export function fromAutoGiro(row: AutoGiroListRow): AgreementRow {
  return {
    type: "autogiro",
    key: `autogiro:${row.ID}`,
    id: String(row.ID),
    KID: row.KID,
    donorName: row.full_name,
    amount: row.amount,
    chargeDay: row.payment_date,
    status: row.active ? "active" : row.cancelled ? "stopped" : "pending",
    created: row.created,
    cancelled: row.cancelled,
    href: `/agreements/autogiro/${row.ID}`,
  };
}

/** "Every month on the 15th" / "Last day of every month". */
export function describeChargeDay(day: number) {
  if (day === 0) return "Last day of the month";
  return `${day}. every month`;
}
